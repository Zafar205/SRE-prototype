"""Render space-separated phonemes with the exported sanoTTS int8 C runtime."""
import argparse
import ctypes as ct
import hashlib
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf

MCU = Path(__file__).resolve().parent / "vendor/sanoTTS/mcu"
PCM = ct.CFUNCTYPE(ct.c_int, ct.POINTER(ct.c_float), ct.c_int, ct.c_void_p)


class Config(ct.Structure):
    _fields_ = [
        ("front_blob", ct.c_void_p), ("dec_blob", ct.c_void_p), ("arena", ct.c_void_p),
        ("arena_size", ct.c_size_t), ("dur_override", ct.c_void_p), ("noise_seed", ct.c_uint64),
    ]


def render(package, ids, seed):
    report = json.loads((package / "export-report.json").read_text())
    shapes = report["shapes"]
    if report["weights"] != "int8":
        raise ValueError("The host renderer expects an int8 export")
    if not 2 <= len(ids) <= shapes["NANO_DUR_MAX_TOKENS"]:
        raise ValueError(f"Expected 2–{shapes['NANO_DUR_MAX_TOKENS']} phonemes for this voice")
    if any(not 0 <= index < shapes["NANO_VOCAB"] for index in ids):
        raise ValueError("Phoneme IDs do not match the voice vocabulary")
    blobs = []
    for name in ("front_q8.bin", "model_q8.bin"):
        payload = (package / name).read_bytes()
        if len(payload) != report["bytes"][name]:
            raise ValueError(f"Incomplete weight blob {name}")
        blobs.append(ct.create_string_buffer(payload))
    # A conservative host scratch bound derived from the maximum mel frames.
    arena_size = 1024 * 1024 + 1024 * len(ids) * shapes["NANO_DUR_MAX_DURATION"]
    arena = ct.create_string_buffer(arena_size)
    config = Config(ct.addressof(blobs[0]), ct.addressof(blobs[1]), ct.addressof(arena),
                    arena_size, None, seed)
    samples = []

    @PCM
    def collect(pcm, length, _user):
        samples.append(np.ctypeslib.as_array(pcm, (length,)).copy())
        return 0

    with TemporaryDirectory(prefix="nanourdu-host-") as temp:
        library = Path(temp) / "sano-nano.so"
        subprocess.run(["cc", "-shared", "-fPIC", "-O2", "-std=c99", "-DFSD_FAST_MATH",
                        f"-I{MCU / 'include'}", f"-I{MCU / 'src'}", f"-I{package.resolve()}",
                        str(MCU / "src/snt_nano.c"), str(MCU / "src/snt_kernels_ref.c"),
                        str(MCU / "ports/host/snt_port_host.c"), "-lm", "-o", str(library)],
                       check=True)
        runtime = ct.CDLL(str(library))
        synthesize = runtime.snt_nano_synthesize
        synthesize.argtypes = [ct.POINTER(Config), ct.POINTER(ct.c_int32), ct.c_int,
                               PCM, ct.c_void_p, ct.c_void_p]
        synthesize.restype = ct.c_int
        tokens = (ct.c_int32 * len(ids))(*ids)
        status = synthesize(ct.byref(config), tokens, len(ids), collect, None, None)
    if status != 0 or not samples:
        raise RuntimeError(f"sanoTTS synthesis returned {status}")
    return np.concatenate(samples)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("phones", help="One argument with a space between each phoneme.")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    vocabulary = json.loads((args.package / "phones.json").read_text(encoding="utf-8"))
    try:
        ids = [vocabulary[phone] for phone in args.phones.split()]
    except KeyError as error:
        parser.error(f"phoneme {error.args[0]!r} is missing from this voice")
    seed = int.from_bytes(hashlib.sha256(args.phones.encode()).digest()[:8], "big")
    waveform = render(args.package, ids, seed)
    with args.output.open("xb") as output:
        sf.write(output, waveform, 24_000, format="WAV", subtype="PCM_16")
    print(f"Wrote {len(waveform) / 24_000:.2f} s to {args.output}")
