# Nano Urdu

Nano Urdu is a standalone Urdu TTS project targeting fewer than 300,000 neural
parameters, including waveform synthesis. It uses Ampixa's sanoTTS
`heart-nano` lineage. The test frontend accepts Urdu-script text with numbers
and converts it to the model's phoneme inventory.

## Verified baseline

`make check-upstream` fetches the pinned sanoTTS source, checks the shipped
`heart-nano` fixture hashes, and runs the upstream int8 C runtime against eight
English reference utterances.

| Component | Original English model | 128-symbol Nano Urdu configuration |
|---|---:|---:|
| Duration model | 22,858 | 24,574 |
| Acoustic model | 65,299 | 67,345 |
| Width-62 waveform decoder | 206,122 | 206,122 |
| **Total** | **294,279** | **298,041** |

The Urdu column is the size of the pilot architecture. `audit_budget.py` counts
the instantiated upstream duration and acoustic networks and the trainable
decoder. Each extra symbol adds 57 parameters across the two embeddings.

## Prepare data, train, and export

Use a Python environment with matching PyTorch and TorchAudio builds. The
forced aligner is a training dependency with roughly 1.2 GB of weights.

```sh
python -m pip install -r requirements.txt
make check-upstream
python prepare_data.py --split train --limit 1000 --output data/train
python prepare_data.py --split eval --limit 100 --output data/eval
python align_data.py data/train/utterances.jsonl data/train/aligned.jsonl data/phones.json
python align_data.py data/eval/utterances.jsonl data/eval/aligned.jsonl data/phones.json
python build_pack.py data/train/aligned.jsonl data/phones.json data/train-pack
python build_pack.py data/eval/aligned.jsonl data/phones.json data/eval-pack
make train-front PYTHON=python
python decoder.py data/train/aligned.jsonl data/train-pack runs/decoder.pt
python export_nano.py --base . \
  --duration-checkpoint runs/duration/duration-student.pt \
  --acoustic-checkpoint runs/acoustic/latent-student.pt \
  --decoder-checkpoint runs/decoder.pt --pack data/eval-pack \
  --vocabulary data/phones.json --out runs/int8
make check-voice
python speak.py runs/int8 'h ɛ' runs/example.wav
```

The corpus downloader streams Arrow shards and keeps the requested audio sample
as 24 kHz WAVs. Audit speaker consistency and listen to the alignments before
using a large sample. The corpus contains four unlabeled speakers and the ASR
transcripts and IPA can contain errors. Freeze the training phone map before
creating evaluation packs. The aligner reports skips for low confidence,
unknown IPA, and out-of-range durations. It currently folds gaps into the
neighboring phonemes. The mel pack uses 100 bands, a 1024-point FFT, and a
256-sample hop to match the `heart-nano` interface.

The public export tool requires upstream's private TinyVocos training module.
Nano Urdu supplies the matching standard-operator decoder, initializes it from
the shipped int8 `heart-nano` weights, and hands the adapted checkpoint to the
upstream exporter. The resulting package includes weights, model metadata, the
phone map, and reference audio for checking the upstream C runtime. `speak.py`
accepts space-separated phonemes from that map.

## Test Urdu script and numbers

Open [Nano_Urdu_Kaggle.ipynb](Nano_Urdu_Kaggle.ipynb) and edit `URDU_TEXT` in
**Test Urdu script and numbers** after training. For a local voice package,
install eSpeak NG and run:

```sh
python urdu_frontend.py runs/int8 'قیمت ۱٬۲۵۰ روپے ہے۔' runs/urdu-example.wav
```

The frontend accepts `25`, `۲۵`, and `٢٥`. A decimal such as `۳٫۰۵` reads
each fractional digit, and `۰۰۷` reads as a code. Pass `--digits` to read any
integer digit by digit. Write dates, times, ranges, and fractions in Urdu words.
The voice must have learned the phonemes used by your text.

## Urdu voice work remaining

- Train on a curated corpus and listen to the waveform decoder on reference
  mels, then with predicted mels and durations. The pilot uses a handful of
  clips and verifies execution and quantization parity.
- Add Roman Urdu and common English pronunciations when expanding beyond
  Urdu-script testing. Record matching-speaker code-switched prompts for English
  pronunciations missing from the read-speech corpus.
- Listen to held-out Urdu and mixed-language prompts, verify int8 audio parity,
  and measure the full offline package before making any size record claim.

Sources and licensing

- [sanoTTS source and model counts](https://github.com/Ampixa/sanoTTS/tree/55c6f39b2b535b5a591667a0852a6c2778320fab)
- [Upstream nano training availability](https://github.com/Ampixa/sanoTTS/blob/55c6f39b2b535b5a591667a0852a6c2778320fab/docs/distilling-kokoro.md#known-problems)
- [UrduTTS corpus card and CC BY-NC 4.0 license](https://huggingface.co/datasets/kaab4321/UrduTTS)
