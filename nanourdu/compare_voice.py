"""Render held-out clips through each stage so you can hear where quality is lost.

For every clip it writes:
  1_ground_truth.wav   the original recording
  2_decoder_only.wav   true mel -> decoder        (if this is bad, the decoder is the problem)
  3_acoustic.wav       predicted mel -> decoder   (if only this is bad, the acoustic model is)
  4_int8_runtime.wav   phonemes -> int8 C runtime (what ships; if only this is bad, it is quantization)
plus mels.png (true vs predicted log-mel) and report.json.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

import decoder as dec
import speaker_filter
from speak import render

RATE = 24_000


def load_decoder(path, device):
    model = dec.load_shipped_decoder()
    model.load_state_dict(torch.load(path, map_location="cpu")["model"])
    return model.to(device).eval()


def vocode(model, mel, device, seed):
    generator = torch.Generator(device="cpu").manual_seed(seed)
    noise = torch.randn(1, dec.CONFIG["noise_channels"], mel.shape[-1], generator=generator).to(device)
    window = torch.hann_window(dec.CONFIG["n_fft"], device=device)
    with torch.no_grad():
        return model.synthesize(model(torch.from_numpy(mel)[None].to(device), noise=noise), window)[0].cpu().numpy()


def write(path, wave):
    sf.write(path, np.clip(wave, -1, 1), RATE, subtype="PCM_16")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="aligned.jsonl of the evaluation split")
    parser.add_argument("pack", type=Path)
    parser.add_argument("--decoder", type=Path, required=True)
    parser.add_argument("--acoustic", type=Path, required=True)
    parser.add_argument("--voice", type=Path, required=True, help="int8 export directory")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    items = dec.load_audio_and_mels(args.manifest, args.pack)[:args.count]
    predicted = dec.predicted_mels(args.pack, args.acoustic, args.device)
    rows = {row["row_id"]: row for row in json.loads((args.pack / "rows.json").read_text(encoding="utf-8"))}
    model = load_decoder(args.decoder, args.device)
    report = []
    figure_rows = []
    for index, (row_id, mel, wave) in enumerate(items):
        folder = args.out / f"{index:02d}-{row_id}"
        folder.mkdir(exist_ok=True)
        pred = predicted[row_id]
        with np.load(rows[row_id]["chunks"][0]["tensor_npz"]) as tensors:
            ids = [int(i) for i in tensors["phoneme_ids"]]
        files = {"1_ground_truth": write(folder / "1_ground_truth.wav", wave),
                 "2_decoder_only": write(folder / "2_decoder_only.wav", vocode(model, mel, args.device, 1)),
                 "3_acoustic": write(folder / "3_acoustic.wav", vocode(model, pred, args.device, 1))}
        try:
            files["4_int8_runtime"] = write(folder / "4_int8_runtime.wav", render(args.voice, ids, 1))
        except Exception as error:  # keep going: the float stages are still informative
            print(f"{row_id}: int8 runtime failed: {error}")
        a, b = mel.reshape(-1), pred.reshape(-1)
        report.append({
            "row": row_id, "text": rows[row_id]["text"], "files": {k: str(v) for k, v in files.items()},
            "mel_l1": float(np.abs(mel - pred).mean()),
            "mel_cosine": float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b))),
            "median_pitch_hz": {k: speaker_filter.median_pitch(v) for k, v in files.items()},
            "pitch_variation_semitones": {k: speaker_filter.pitch_variation(v) for k, v in files.items()},
        })
        figure_rows.append((row_id, mel, pred))
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(len(figure_rows), 2, figsize=(12, 2.4 * len(figure_rows)), squeeze=False)
        for axis, (row_id, mel, pred) in zip(axes, figure_rows):
            low, high = np.percentile(mel, [1, 99])
            axis[0].imshow(mel, origin="lower", aspect="auto", vmin=low, vmax=high)
            axis[0].set_title(f"{row_id}: true log-mel")
            axis[1].imshow(pred, origin="lower", aspect="auto", vmin=low, vmax=high)
            axis[1].set_title("predicted log-mel (blurry = chorus effect)")
        fig.tight_layout()
        fig.savefig(args.out / "mels.png", dpi=90)
    except ImportError:
        pass
    (args.out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps([{k: v for k, v in r.items() if k not in ("files", "text")} for r in report], indent=2))


if __name__ == "__main__":
    main()
