"""Align the corpus IPA with a training-only Wav2Vec2 phoneme aligner."""
import argparse
import json
from pathlib import Path
import re
import unicodedata

from huggingface_hub import hf_hub_download
import numpy as np
import soundfile as sf
import torch
from torchaudio.functional import forced_align, resample
from transformers import AutoModelForCTC

from build_pack import HOP, SAMPLE_RATE
from phones import BOUNDARY, phone_pattern, tokenize_words, with_boundaries


REPO = "facebook/wav2vec2-lv-60-espeak-cv-ft"
REVISION = "ae45363bf3413b374fecd9dc8bc1df0e24c3b7f4"
ALIGNER_RATE = 16_000


def align(row, audio_path, model, labels, pattern, min_confidence, device="cpu"):
    words = tokenize_words(row["phonemes"], pattern)
    phones = [phone for word in words for phone in word]
    if not 1 <= len(with_boundaries(words)) <= 207:
        raise ValueError("phone count outside 1–207")
    audio, rate = sf.read(audio_path, dtype="float32")
    if audio.ndim != 1 or rate != SAMPLE_RATE:
        raise ValueError("expected mono 24 kHz audio")
    waveform = resample(torch.from_numpy(audio), rate, ALIGNER_RATE)
    waveform = (waveform - waveform.mean()) / (waveform.var(unbiased=False) + 1e-7).sqrt()
    target = torch.tensor([[labels[phone] for phone in phones]], dtype=torch.int32)
    with torch.inference_mode():
        probabilities = model(waveform.unsqueeze(0).to(device)).logits.log_softmax(dim=-1).cpu()
        if target.numel() + int((target[:, 1:] == target[:, :-1]).sum()) > probabilities.shape[1]:
            raise ValueError("clip too short for IPA")
        blank = model.config.pad_token_id
        path, scores = forced_align(probabilities, target, blank=blank)
    speech = path[0] != blank
    confidence = scores[0][speech].exp().mean().item()
    if confidence < min_confidence:
        raise ValueError(f"alignment confidence {confidence:.3f} below {min_confidence:.3f}")
    previous_blank = torch.cat((torch.tensor([True]), ~speech[:-1]))
    changes = torch.cat((torch.tensor([True]), path[0][1:] != path[0][:-1]))
    starts = torch.where(speech & (previous_blank | changes))[0].numpy()
    ends = torch.where(speech & torch.cat((changes[1:], torch.tensor([True]))))[0].numpy()
    if len(starts) != len(phones) or len(ends) != len(phones):
        raise ValueError("alignment phone count mismatch")

    stride, receptive_field = 1, 1
    for kernel, step in zip(model.config.conv_kernel, model.config.conv_stride):
        receptive_field += (kernel - 1) * stride
        stride *= step
    def mel_frame(ctc_frame):
        seconds = (ctc_frame * stride + (receptive_field - 1) / 2) / ALIGNER_RATE
        return int(np.rint(seconds * SAMPLE_RATE / HOP))

    total = len(audio) // HOP
    # Each word gap becomes a boundary token spanning the silence between the
    # last phone of one word and the first of the next (at least one frame).
    cuts = [0, max(1, mel_frame(starts[0] - 0.5))]
    last_of_word = set(np.cumsum([len(word) for word in words])[:-1] - 1)
    for i in range(len(phones) - 1):
        if i in last_of_word:
            left, right = mel_frame(ends[i] + 0.5), mel_frame(starts[i + 1] - 0.5)
            if right <= left:
                left = mel_frame((starts[i + 1] + ends[i]) / 2)
                right = left + 1
            cuts.extend((left, right))
        else:
            cuts.append(mel_frame((starts[i + 1] + ends[i]) / 2))
    cuts.extend((min(mel_frame(ends[-1] + 0.5), total - 1), total))
    durations = np.diff(np.asarray(cuts)).astype(int)
    sequence = with_boundaries(words)
    if len(durations) != len(sequence):
        raise ValueError("boundary bookkeeping mismatch")
    if np.any(durations < 1) or np.any(durations > 80):
        raise ValueError("duration outside 1–80 mel frames")
    phones = sequence
    return {**row, "audio": str(audio_path), "phones": phones, "durations": durations.tolist(),
            "alignment_confidence": round(confidence, 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("vocabulary", type=Path, help="Create this map on train and reuse it for eval.")
    parser.add_argument("--min-confidence", type=float, default=0.10)
    parser.add_argument("--local-files-only", action="store_true")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu", help="Device for the Wav2Vec2 forward pass.")
    args = parser.parse_args()
    if not 0 <= args.min_confidence <= 1 or args.output.exists():
        parser.error("choose a confidence in [0, 1] and a new output manifest")
    pinned = {"revision": REVISION, "local_files_only": args.local_files_only}
    label_path = hf_hub_download(REPO, "vocab.json", **pinned)
    raw_labels = json.loads(Path(label_path).read_text(encoding="utf-8"))
    labels = {unicodedata.normalize("NFC", phone): index for phone, index in raw_labels.items()}
    pattern = phone_pattern(labels)
    model = AutoModelForCTC.from_pretrained(REPO, use_safetensors=False, **pinned).eval().to(args.device)
    existing = args.vocabulary.exists()
    vocabulary = json.loads(args.vocabulary.read_text(encoding="utf-8")) if existing else {}
    accepted, observed, fallbacks, skipped = [], set(), 0, {}
    for line in args.manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        try:
            try:
                aligned = align(row, (args.manifest.parent / row["audio"]).resolve(),
                                model, labels, pattern, args.min_confidence, args.device)
            except ValueError as error:
                # Teacher rows keep the corpus IPA as a fallback when eSpeak emits a
                # symbol the aligner does not know.
                if not row.get("phonemes_dataset") or "unknown IPA" not in str(error):
                    raise
                row = {**row, "phonemes": row["phonemes_dataset"], "phonemes_source": "dataset"}
                aligned = align(row, (args.manifest.parent / row["audio"]).resolve(),
                                model, labels, pattern, args.min_confidence, args.device)
                fallbacks += 1
            phones = set(aligned["phones"])
            if existing and phones - vocabulary.keys():
                raise ValueError(f"unseen phones {sorted(phones - vocabulary.keys())}")
        except ValueError as error:
            print(f"Skipped {row['id']}: {error}")
            message = str(error)
            if message.startswith("unknown IPA at "):  # keep the offending symbol
                reason = "unknown IPA " + message[len("unknown IPA at "):][:3] + "'"
            else:
                reason = re.sub(r"\d+\.\d+", "N", message)
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        observed.update(phones)
        accepted.append(aligned)
    if not accepted:
        raise SystemExit("No alignments passed")
    if not existing:
        if len(observed) > 128:
            raise SystemExit("The observed inventory exceeds the 128-symbol training configuration")
        args.vocabulary.parent.mkdir(parents=True, exist_ok=True)
        with args.vocabulary.open("x", encoding="utf-8") as stream:
            json.dump({p: i for i, p in enumerate(sorted(observed))}, stream, ensure_ascii=False)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as stream:
        for row in accepted:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Aligned {len(accepted)} clips with {len(observed)} observed symbols "
          f"({fallbacks} used the corpus IPA fallback)")
    print("Skip reasons:", json.dumps(dict(sorted(skipped.items(), key=lambda kv: -kv[1])),
                                      ensure_ascii=False))
    (args.output.parent / f"{args.output.stem}-skips.json").write_text(
        json.dumps(skipped, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
