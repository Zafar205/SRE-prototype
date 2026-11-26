"""Keep the clips of one voice, chosen by median pitch (UrduTTS has no speaker labels).

Training one model on a mix of speakers makes it predict an average of their pitches,
which sounds like several people talking at once. This keeps the most common pitch
cluster. Evaluation clips reuse the training cluster via --center.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as AF

RATE = 24_000
HOP = 240  # 10 ms


def pitch_track(path):
    wave, rate = sf.read(path, dtype="float32")
    if rate != RATE or wave.ndim != 1:
        raise ValueError(f"{path}: expected mono {RATE} Hz audio")
    wave = torch.from_numpy(wave)
    pitch = AF.detect_pitch_frequency(wave, RATE, frame_time=HOP / RATE, freq_low=70, freq_high=400)
    frames = min(len(pitch), len(wave) // HOP)
    energy = wave[:frames * HOP].reshape(frames, HOP).pow(2).mean(1).sqrt()
    voiced = (energy > 0.25 * energy.max()) & (pitch[:frames] > 75) & (pitch[:frames] < 390)
    if voiced.sum() < 20:
        return None
    return pitch[:frames][voiced].numpy()


def median_pitch(path):
    track = pitch_track(path)
    return None if track is None else float(np.median(track))


def pitch_variation(path):
    """Standard deviation of the voiced pitch contour in semitones (flat, robotic speech is low)."""
    track = pitch_track(path)
    return None if track is None else float(np.std(12 * np.log2(track / np.median(track))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path, help="Filtered manifest, written beside the audio.")
    parser.add_argument("--center", type=float, help="Pitch in Hz to keep; default: the most common one.")
    parser.add_argument("--tolerance", type=float, default=0.10, help="Allowed fraction around the centre.")
    parser.add_argument("--min-clips", type=int, default=20)
    args = parser.parse_args()
    if args.output.exists() or args.output.parent != args.manifest.parent:
        parser.error("choose a new output manifest in the same directory as the input")
    rows = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    pitches = [median_pitch(args.manifest.parent / row["audio"]) for row in rows]
    valid = np.array([p for p in pitches if p])
    center = args.center
    if center is None:
        grid = np.arange(80, 380, 2.0)
        score = [(np.abs(np.log(valid / g)) < args.tolerance).sum() for g in grid]
        center = float(grid[int(np.argmax(score))])
    keep = [row for row, p in zip(rows, pitches) if p and abs(np.log(p / center)) < args.tolerance]
    histogram, edges = np.histogram(valid, bins=np.arange(70, 400, 20))
    print("median-pitch histogram (Hz: clips)")
    for count, low in zip(histogram, edges):
        print(f"  {int(low):3d}-{int(low) + 19:3d}: {'#' * int(40 * count / max(1, histogram.max()))} {count}")
    print(f"keeping {len(keep)} of {len(rows)} clips within {args.tolerance:.0%} of {center:.0f} Hz")
    if len(keep) < args.min_clips:
        raise RuntimeError("Too few clips in one pitch cluster; raise the candidate count or --tolerance.")
    with args.output.open("w", encoding="utf-8") as out:
        for row in keep:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    args.output.with_suffix(".json").write_text(json.dumps(
        {"center_hz": center, "tolerance": args.tolerance, "kept": len(keep), "total": len(rows)}))


if __name__ == "__main__":
    main()
