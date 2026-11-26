"""Convert aligned 24 kHz WAVs into packs the public sanoTTS trainers load."""
import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf
import torch
from torchaudio.transforms import MelSpectrogram

SAMPLE_RATE = 24_000
HOP = 256
MEL_BANDS = 100


def build(manifest, vocabulary_path, output):
    vocabulary = json.loads(vocabulary_path.read_text(encoding="utf-8"))
    if not vocabulary or sorted(vocabulary.values()) != list(range(len(vocabulary))):
        raise ValueError("Vocabulary must map phone strings to consecutive IDs starting at zero.")
    mel = MelSpectrogram(sample_rate=SAMPLE_RATE, n_fft=1024, hop_length=HOP,
                         n_mels=MEL_BANDS, power=1.0, mel_scale="htk")
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent, prefix=".nanourdu-") as temp:
        staging = Path(temp) / "pack"
        staging.mkdir()
        rows = []
        with manifest.open(encoding="utf-8") as source, torch.inference_mode():
            for line in source:
                if not line.strip():
                    continue
                row = json.loads(line)
                ids = [vocabulary[phone] for phone in row["phones"]]
                durations = row["durations"]
                if not ids or len(ids) != len(durations) or any(
                    type(value) is not int or not 1 <= value <= 80 for value in durations
                ):
                    raise ValueError(f"{row['id']}: expected a duration of 1–80 frames per phone")
                frames = sum(durations)
                audio, rate = sf.read(manifest.parent / row["audio"], dtype="float32")
                if rate != SAMPLE_RATE or audio.ndim != 1 or len(audio) < 1024 or len(audio) // HOP != frames:
                    raise ValueError(f"{row['id']}: expected mono 24 kHz audio matching {frames} frames")
                waveform = torch.from_numpy(audio[:frames * HOP])
                target = mel(waveform)[:, :frames].clamp_min(1e-7).log().numpy()
                filename = f"{len(rows):06d}.npz"
                np.savez_compressed(staging / filename, phoneme_ids=np.asarray(ids, dtype=np.int64),
                                    w_ceil=np.asarray(durations, dtype=np.int64), generator_input=target)
                rows.append({
                    "row_id": row["id"], "index": len(rows) + 1, "text": row["transcription"],
                    "chunks": [{"chunk_index": 0, "tensor_npz": str(output / filename),
                                "audio_samples": frames * HOP}],
                })
        if not rows:
            raise ValueError(f"{manifest}: empty manifest")
        (staging / "rows.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        staging.rename(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("vocabulary", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("choose a new pack output directory")
    build(args.manifest, args.vocabulary, args.output)
