"""Build a consistent one-voice training corpus by reading UrduTTS sentences with a teacher TTS.

Why: a 300k-parameter model trained on human recordings learns the *average* of
many different ways each phrase was spoken, which sounds flat and robotic. A
teacher model (Meta MMS-TTS Urdu, a VITS model) speaks every phrase one fixed way,
so the small student can learn that mapping instead of an average. The student's
voice and prosody then follow the teacher.

Each row gets the teacher audio at 24 kHz plus IPA from the same eSpeak NG front
end that synthesis uses, so training and inference see identical phones.
"""
import argparse
import json
from math import gcd
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from scipy.signal import resample_poly
import soundfile as sf
import torch

from prepare_data import rows
from urdu_frontend import normalize, phonemize

TEACHER = "facebook/mms-tts-urd-script_arabic"
TEACHER_REVISION = "4c4f53d52e4f0b40cb8e7f36dcef66a2a73619c5"
SAMPLE_RATE = 24_000


def trim_silence(wave, rate, threshold_db=-40, pad_seconds=0.08):
    frame = int(rate * 0.01)
    energy = np.sqrt(np.convolve(wave ** 2, np.ones(frame) / frame, mode="same"))
    loud = np.flatnonzero(energy > energy.max() * 10 ** (threshold_db / 20))
    if not len(loud):
        return wave
    pad = int(rate * pad_seconds)
    return wave[max(0, loud[0] - pad):loud[-1] + pad]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("train", "eval", "test"), default="train")
    parser.add_argument("--limit", type=int, default=16)
    parser.add_argument("--skip", type=int, default=0, help="Skip this many usable sentences first.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--noise-scale", type=float, default=0.3,
                        help="Teacher prosody randomness. Lower is more consistent (easier to learn).")
    parser.add_argument("--noise-scale-duration", type=float, default=0.0)
    parser.add_argument("--phonemizer", choices=("espeak", "dataset"), default="espeak",
                        help="espeak matches synthesis; dataset uses the corpus IPA column.")
    args = parser.parse_args()
    if args.limit < 1 or args.output.exists():
        parser.error("provide a positive limit and a new output directory")

    from transformers import AutoTokenizer, VitsModel
    tokenizer = AutoTokenizer.from_pretrained(TEACHER, revision=TEACHER_REVISION)
    model = VitsModel.from_pretrained(TEACHER, revision=TEACHER_REVISION).to(args.device).eval()
    model.noise_scale = args.noise_scale
    model.noise_scale_duration = args.noise_scale_duration
    teacher_rate = model.config.sampling_rate
    divisor = gcd(teacher_rate, SAMPLE_RATE)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.output.parent, prefix=".nanourdu-") as temp:
        staging = Path(temp) / "teacher"
        (staging / "wavs").mkdir(parents=True)
        count = skipped = seen = 0
        source = rows(args.split)
        failure = None
        try:
          try:
            with (staging / "utterances.jsonl").open("w", encoding="utf-8") as manifest:
                for shard, index, script, dataset_ipa, _audio in source:
                    try:
                        text = normalize(script or "")
                    except ValueError:
                        skipped += 1
                        continue
                    seen += 1
                    if seen <= args.skip:
                        continue
                    ipa = phonemize(text) if args.phonemizer == "espeak" else dataset_ipa
                    inputs = tokenizer(text, return_tensors="pt").to(args.device)
                    if not ipa or inputs["input_ids"].shape[-1] < 3:
                        skipped += 1
                        continue
                    torch.manual_seed(count)
                    with torch.no_grad():
                        wave = model(**inputs).waveform[0].float().cpu().numpy()
                    wave = trim_silence(wave, teacher_rate)
                    wave = resample_poly(wave, SAMPLE_RATE // divisor, teacher_rate // divisor)
                    seconds = len(wave) / SAMPLE_RATE
                    if not 1.0 <= seconds <= 12:
                        skipped += 1
                        continue
                    rms = np.sqrt(np.mean(wave ** 2)) + 1e-8
                    wave = np.clip(wave * (0.1 / rms), -0.99, 0.99)  # consistent loudness
                    clip_id = f"{args.split}-{count:05d}"
                    relative = f"wavs/{clip_id}.wav"
                    sf.write(staging / relative, wave, SAMPLE_RATE, subtype="PCM_16")
                    manifest.write(json.dumps({
                        "id": clip_id, "audio": relative, "transcription": text, "phonemes": ipa, "phonemes_dataset": dataset_ipa,
                        "source_split": args.split, "source_shard": shard, "source_row": index,
                        "teacher": TEACHER, "teacher_revision": TEACHER_REVISION,
                    }, ensure_ascii=False) + "\n")
                    count += 1
                    if count % 500 == 0:
                        print(f"{count} sentences synthesized", flush=True)
                    if count == args.limit:
                        break
          except Exception as error:  # e.g. the corpus download failed for good
            failure = error
            print(f"Corpus reading stopped after {count} sentences: {error!r}", flush=True)
        finally:
            source.close()
        if failure is not None and count < max(1, args.limit // 2):
            raise failure
        if count < max(1, args.limit // 2):
            raise RuntimeError(f"Expected {args.limit} sentences and synthesized {count}")
        if count < args.limit:
            print(f"Warning: the split ran out at {count} of {args.limit} sentences; continuing.")
        staging.rename(args.output)
    print(f"Synthesized {count} teacher clips ({skipped} skipped) to {args.output}")


if __name__ == "__main__":
    main()
