"""Run sanoTTS's public exporter with the local trainable width-62 decoder."""
import argparse
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor/sanoTTS/tools"))
import export_e12_nano_q8 as exporter


if __name__ == "__main__":
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--vocabulary", type=Path)
    options, upstream_args = parser.parse_known_args()
    if "--help" in upstream_args or "-h" in upstream_args:
        print("Nano Urdu also requires --vocabulary PHONE_MAP.json")
    elif not options.vocabulary or not options.out:
        parser.error("--out and --vocabulary are required")
    else:
        if options.out.exists():
            parser.error("choose a new export directory")
        vocabulary = json.loads(options.vocabulary.read_text(encoding="utf-8"))
        if not vocabulary or sorted(vocabulary.values()) != list(range(len(vocabulary))) or len(vocabulary) > 128:
            parser.error("expected a vocabulary of up to 128 consecutive IDs")
    sys.argv[1:] = upstream_args
    if options.out:
        sys.argv.extend(["--out", str(options.out)])
    find_upstream_module = exporter._find

    def find_module(*candidates):
        if all(candidate.name == "train_tiny_vocos_student.py" for candidate in candidates):
            return find_upstream_module(*candidates, ROOT / "decoder.py")
        return find_upstream_module(*candidates)

    exporter._find = find_module
    exporter.main()
    shutil.copyfile(options.vocabulary, options.out / "phones.json")
    for blob in options.out.glob("*.bin"):
        fixture = options.out / "golden" / blob.name
        if not fixture.exists():
            fixture.symlink_to(Path("..") / blob.name)
