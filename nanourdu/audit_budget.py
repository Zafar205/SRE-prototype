"""Count the public sanoTTS front models with a chosen phoneme vocabulary and sizes."""
import argparse
from pathlib import Path
import sys

TOOLS = Path(__file__).resolve().parent / "vendor/sanoTTS/tools"
sys.path.insert(0, str(TOOLS))

from train_roota_piper_duration_student import DurationStudent
from train_roota_piper_latent_student import ContextualLatentStudent
from decoder import CONFIG, TinyVocosStudent

LIMIT = 500_000


def count(vocabulary, duration_hidden=26, acoustic_hidden=31, acoustic_depth=3):
    duration = DurationStudent(vocab_size=vocabulary, hidden=duration_hidden, depth=3,
                               kernel_size=5, max_tokens=207)
    acoustic = ContextualLatentStudent(vocab_size=vocabulary, hidden=acoustic_hidden,
                                       depth=acoustic_depth, token_depth=acoustic_depth,
                                       kernel_size=5, out_channels=100)
    return tuple(sum(p.numel() for p in model.parameters()) for model in (duration, acoustic))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vocabulary", type=int)
    parser.add_argument("--duration-hidden", type=int, default=26)
    parser.add_argument("--acoustic-hidden", type=int, default=31)
    parser.add_argument("--acoustic-depth", type=int, default=3)
    parser.add_argument("--limit", type=int, default=LIMIT)
    args = parser.parse_args()
    if not 1 <= args.vocabulary <= 128:
        parser.error("vocabulary must be between 1 and 128")
    reference = count(62)
    if reference != (22_858, 65_299):
        raise SystemExit(f"Upstream shapes no longer match heart-nano: {reference}")
    duration, acoustic = count(args.vocabulary, args.duration_hidden,
                               args.acoustic_hidden, args.acoustic_depth)
    config = dict(CONFIG)
    config["dim"] = config.pop("width")
    decoder = sum(p.numel() for p in TinyVocosStudent(**config).parameters())
    if decoder != 206_122:
        raise SystemExit(f"Decoder count does not match heart-nano: {decoder}")
    total = duration + acoustic + decoder
    print(f"{args.vocabulary} symbols: {duration:,} duration + {acoustic:,} acoustic + "
          f"{decoder:,} decoder = {total:,} parameters")
    if total >= args.limit:
        raise SystemExit(f"Over the strict under-{args.limit:,} target")
