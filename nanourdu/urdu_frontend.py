"""Urdu-script text and number normalization for Nano Urdu."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import unicodedata

from phones import BOUNDARY, LENGTH, phone_pattern, tokenize_words, with_boundaries


CARDINALS = """
صفر ایک دو تین چار پانچ چھ سات آٹھ نو
دس گیارہ بارہ تیرہ چودہ پندرہ سولہ سترہ اٹھارہ انیس
بیس اکیس بائیس تئیس چوبیس پچیس چھبیس ستائیس اٹھائیس انتیس
تیس اکتیس بتیس تینتیس چونتیس پینتیس چھتیس سینتیس اڑتیس انتالیس
چالیس اکتالیس بیالیس تینتالیس چوالیس پینتالیس چھیالیس سینتالیس اڑتالیس انچاس
پچاس اکیاون باون ترپن چوّن پچپن چھپن ستاون اٹھاون انسٹھ
ساٹھ اکسٹھ باسٹھ تریسٹھ چونسٹھ پینسٹھ چھیاسٹھ سڑسٹھ اڑسٹھ انہتر
ستر اکہتر بہتر تہتر چوہتر پچہتر چھہتر ستتر اٹھہتر اناسی
اسی اکیاسی بیاسی تراسی چوراسی پچاسی چھیاسی ستاسی اٹھاسی نواسی
نوے اکانوے بانوے ترانوے چورانوے پچانوے چھیانوے ستانوے اٹھانوے ننانوے
""".split()
SCALES = ((10**12, "کھرب"), (10**9, "ارب"), (10**7, "کروڑ"),
          (10**5, "لاکھ"), (1000, "ہزار"), (100, "سو"))
DIGIT_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩كي−٫٬٪",
                          "01234567890123456789کی-.,%")
NUMBER = re.compile(r"[+-]?[0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?(?:[ \t]*%)?")
GROUPING = re.compile(r"(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})+,[0-9]{3})")
PUNCTUATION = "۔،؛؟!?.,:;…()«»\"'“”–—-"


def cardinal(number):
    words = []
    for scale, name in SCALES:
        units, number = divmod(number, scale)
        if units:
            words.extend((CARDINALS[units], name))
    if number or not words:
        words.append(CARDINALS[number])
    return " ".join(words)


def spell_digits(number):
    return " ".join(CARDINALS[int(digit)] for digit in number)


def speak_number(match, digit_by_digit):
    token = match[0]
    sign = {"-": "منفی", "+": "مثبت"}.get(token[0])
    percent = token.endswith("%")
    unsigned = token.lstrip("+-").removesuffix("%").strip()
    integer, _, fraction = unsigned.partition(".")
    if "," in integer and not GROUPING.fullmatch(integer):
        raise ValueError(f"Invalid digit grouping in {token!r}. Use spaces between separate numbers.")
    integer = integer.replace(",", "")
    if digit_by_digit or len(integer) > 14 or (len(integer) > 1 and integer.startswith("0")):
        words = [spell_digits(integer)]
    else:
        words = [cardinal(int(integer))]
    if sign:
        words.insert(0, sign)
    if fraction:
        words.extend(("اعشاریہ", spell_digits(fraction)))
    if percent:
        words.append("فیصد")
    return " " + " ".join(words) + " "


def normalize(text, *, digit_by_digit=False):
    text = unicodedata.normalize("NFKC", text).translate(DIGIT_MAP)
    text = "".join(char for char in text if unicodedata.category(char) != "Cf" and char != "ـ")
    text = re.sub(r"[0-9]+(?:،[0-9]+)+", normalize_grouping, text)
    if re.search(r"[0-9]\s*[:/–—-]\s*[0-9]", text):
        raise ValueError("Write times, fractions, dates, and ranges out in Urdu words.")
    text = NUMBER.sub(lambda match: speak_number(match, digit_by_digit), text).strip()
    for char in text:
        if char.isspace() or char in PUNCTUATION:
            continue
        kind = unicodedata.category(char)[0]
        if kind not in "LM" or not unicodedata.name(char, "").startswith("ARABIC"):
            raise ValueError(f"Use Urdu script and numbers. Unsupported character {char!r}.")
    if not any(unicodedata.category(char).startswith("L") for char in text):
        raise ValueError("Enter some Urdu text or a number.")
    return re.sub(r"\s+", " ", text)


def normalize_grouping(match):
    grouped = match[0].replace("،", ",")
    return grouped if GROUPING.fullmatch(grouped) else match[0]


def phonemize(text):
    executable = shutil.which("espeak-ng")
    if executable is None:
        raise RuntimeError("Install eSpeak NG for Urdu phonemization.")
    result = subprocess.run([executable, "-q", "--ipa", "-v", "ur", "--stdin"],
                            input=text + "\n", text=True, capture_output=True, check=True)
    return result.stdout.strip()


VOWELS = "aeiouɛɔəɪʊʌɐ"
# Nearest sounds for symbols eSpeak can emit (mostly in loanwords) that a voice
# may never have seen in training; used only when the voice lacks the symbol.
NEAREST = {"ʒ": "z", "g": "ɡ", "ŋ": "n", "ɲ": "n", "ɳ": "n", "ɭ": "l", "v": "ʋ",
           "ɦ": "h", "χ": "x", "ʁ": "ɣ", "ɑ": "aː", "ɑː": "aː", "æ": "ɛ", "ɒ": "ɔ"}


def phone_aliases(vocabulary):
    """Map phones the voice never saw to the nearest one it knows (e.g. loanword "o" -> "oː")."""
    aliases = {source: target for source, target in NEAREST.items()
               if source not in vocabulary and target in vocabulary}
    for vowel in VOWELS:
        for base in (vowel, vowel + "̃"):  # plain and nasal
            short, long = unicodedata.normalize("NFC", base), unicodedata.normalize("NFC", base + LENGTH)
            if short not in vocabulary and long in vocabulary:
                aliases[short] = long
            elif long not in vocabulary and short in vocabulary:
                aliases[long] = short
    return aliases


def phones_for(ipa, vocabulary):
    aliases = phone_aliases(vocabulary)
    words = tokenize_words(ipa, phone_pattern(set(vocabulary) | set(aliases)))
    words = [[aliases.get(phone, phone) for phone in word] for word in words]
    if not words:
        raise ValueError("The phonemizer produced no usable phones.")
    if BOUNDARY in vocabulary:  # voices trained with word-boundary / pause tokens
        return with_boundaries(words)
    return [phone for word in words for phone in word]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("text")
    parser.add_argument("output", type=Path)
    parser.add_argument("--digits", action="store_true", help="Read every integer digit individually.")
    args = parser.parse_args()
    try:
        spoken = normalize(args.text, digit_by_digit=args.digits)
        vocabulary = json.loads((args.package / "phones.json").read_text(encoding="utf-8"))
        ipa = phonemize(spoken)
        phones = phones_for(ipa, vocabulary)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    print(f"Spoken Urdu: {spoken}\nIPA: {ipa}", flush=True)
    subprocess.run([sys.executable, str(Path(__file__).with_name("speak.py")),
                    str(args.package), " ".join(phones), str(args.output)], check=True)
