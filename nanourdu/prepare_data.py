"""Stream a bounded UrduTTS sample for audition and alignment."""
import argparse
import io
import json
import time
from math import gcd
from pathlib import Path
from tempfile import TemporaryDirectory

import pyarrow as pa
import requests
from scipy.signal import resample_poly
import soundfile as sf


REPO = "kaab4321/UrduTTS"
REVISION = "f5c50b7aaabd4325bfe33617232203ad02e30f97"
BASE = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}"
SAMPLE_RATE = 24_000


def download(client, url, path, attempts=8):
    """Fetch url to path, resuming after dropped connections."""
    for attempt in range(attempts):
        done = path.stat().st_size if path.exists() else 0
        headers = {"Range": f"bytes={done}-"} if done else {}
        try:
            with client.get(url, stream=True, timeout=(30, 120), headers=headers) as response:
                if response.status_code == 416:  # already complete
                    return
                response.raise_for_status()
                mode = "ab" if done and response.status_code == 206 else "wb"
                with path.open(mode) as stream:
                    for chunk in response.iter_content(1 << 20):
                        stream.write(chunk)
            return
        except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as error:
            wait = min(60, 5 * 2 ** attempt)
            print(f"Download interrupted ({error.__class__.__name__}); retrying in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"Could not download {url} after {attempts} attempts")


def rows(split):
    """Yield corpus rows. Each shard is downloaded to disk first, so a slow
    consumer (e.g. teacher synthesis) never holds a network stream open."""
    with requests.Session() as client, TemporaryDirectory(prefix="nanourdu-shard-") as temp:
        response = client.get(f"{BASE}/{split}/state.json", timeout=60)
        response.raise_for_status()
        for shard in response.json()["_data_files"]:
            name = shard["filename"]
            local = Path(temp) / Path(name).name
            download(client, f"{BASE}/{split}/{name}", local)
            try:
                with pa.memory_map(str(local)) as source, pa.ipc.open_stream(source) as reader:
                    index = 0
                    for batch in reader:
                        audio = batch["audio"]
                        script = batch["transcription"]
                        ipa = batch["phonemes"]
                        for row in range(batch.num_rows):
                            yield name, index, script[row].as_py(), ipa[row].as_py(), audio[row].as_py()
                            index += 1
            finally:
                local.unlink(missing_ok=True)


def prepare(split, limit, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent, prefix=".nanourdu-") as temp:
        staging = Path(temp) / "sample"
        (staging / "wavs").mkdir(parents=True)
        count = 0
        source = rows(split)
        try:
            with (staging / "utterances.jsonl").open("w", encoding="utf-8") as manifest:
                for shard, index, script, ipa, audio in source:
                    if not script or not ipa or not audio or not audio["bytes"]:
                        continue
                    waveform, rate = sf.read(io.BytesIO(audio["bytes"]), dtype="float32", always_2d=True)
                    if not 1.5 <= len(waveform) / rate <= 12:
                        continue
                    divisor = gcd(rate, SAMPLE_RATE)
                    mono = resample_poly(waveform.mean(axis=1), SAMPLE_RATE // divisor, rate // divisor)
                    clip_id = f"{split}-{count:05d}"
                    relative = f"wavs/{clip_id}.wav"
                    sf.write(staging / relative, mono.clip(-1, 1), SAMPLE_RATE, subtype="PCM_16")
                    manifest.write(json.dumps({
                        "id": clip_id, "audio": relative, "transcription": script, "phonemes": ipa,
                        "source_file": audio["path"], "source_split": split,
                        "source_shard": shard, "source_row": index, "source_revision": REVISION,
                    }, ensure_ascii=False) + "\n")
                    count += 1
                    if count == limit:
                        break
        finally:
            source.close()
        if count < limit:
            raise RuntimeError(f"Expected {limit} usable clips and found {count}")
        staging.rename(output)
    print(f"Saved {count} clips and their Urdu script and IPA to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("train", "eval", "test"), default="train")
    parser.add_argument("--limit", type=int, default=16)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.limit < 1 or args.output.exists():
        parser.error("provide a positive clip limit and a new output directory")
    prepare(args.split, args.limit, args.output)
