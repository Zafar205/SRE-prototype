"""Shared IPA segmentation for corpus alignment and synthesis."""
import re
import unicodedata

BOUNDARY = "|"  # word-boundary / pause token; carries the silence between words
LENGTH = "ː"


def phone_pattern(inventory):
    symbols = sorted((phone for phone in inventory
                      if phone and not phone.startswith("<") and phone != BOUNDARY),
                     key=lambda phone: (-len(phone), phone))
    if not symbols:
        raise ValueError("The phone inventory is empty.")
    return re.compile("|".join(map(re.escape, symbols)))


def tokenize_words(ipa, pattern):
    """IPA split into words, each a list of phones."""
    ipa = unicodedata.normalize("NFC", ipa).translate(str.maketrans("", "", "ˈˌ͜͡‌‍"))
    words = []
    for word in re.split(r"[\s.,:;!?،؛؟۔…“”|]+", ipa):
        phones, offset = [], 0
        while offset < len(word):
            match = pattern.match(word, offset)
            if match is None:
                symbol = word[offset]
                if symbol == LENGTH and phones:
                    # A length mark the inventory has no combined symbol for
                    # (eSpeak writes Urdu geminates as e.g. "nː"): hold the
                    # previous phone for twice as long by repeating it.
                    phones.append(phones[-1])
                    offset += 1
                    continue
                if unicodedata.combining(symbol):
                    offset += 1  # an unsupported diacritic (e.g. stray nasal tilde)
                    continue
                raise ValueError(f"unknown IPA at {word[offset:]!r}")
            phones.append(match[0])
            offset = match.end()
        if phones:
            words.append(phones)
    return words


def tokenize(ipa, pattern):
    return [phone for word in tokenize_words(ipa, pattern) for phone in word]


def with_boundaries(words):
    """Phones with a boundary token before, between, and after words."""
    sequence = [BOUNDARY]
    for word in words:
        sequence.extend(word)
        sequence.append(BOUNDARY)
    return sequence
