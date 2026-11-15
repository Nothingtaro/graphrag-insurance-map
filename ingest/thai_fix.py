"""Glyph-level repair of Thai text extracted from the Viriyah policy PDFs.

Two kinds of damage were measured in the source files (see ingest/README.md):

2568 editions (InDesign, DB Thai fonts):
  * every positioned mark is drawn twice at the same x  -> "ต้้" instead of "ต้"
  * an extra zero-width glyph with no/incorrect Unicode follows the mark
    (U+FFFD, Æ Ç Ã Ä Ê Ë, a stray "n"/"h", and ³ after SARA AM)
  * U+202F narrow no-break space used as the phrase space
  All extra glyphs sit at the same position as a real mark, so dropping them loses nothing.

2563 editions (Word -> PDF):
  * SARA AM is drawn as a zero-width space followed by SARA AA  -> "ท า" instead of "ทำ"

The functions work on PyMuPDF "rawdict" chars, because the decision needs the glyph
width and position, which plain text extraction throws away.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter

THAI_START, THAI_END = 0x0E00, 0x0E7F
# marks that combine with the preceding base character
UPPER_LOWER_VOWELS = set("ัิีึืฺุู็")
TONE_MARKS = set("่้๊๋์ํ๎")
MARKS = UPPER_LOWER_VOWELS | TONE_MARKS
SARA_AM, SARA_AA, NIKHAHIT = "ำ", "า", "ํ"
JUNK_GLYPHS = set("ÆÇÃÄÊË³�")  # Æ Ç Ã Ä Ê Ë ³ �
SPACE_LIKE = {" ": " ", " ": " ", " ": " ", " ": " ",
              "\n": " ", "\r": " ", " ": " ", " ": " "}  # some lines carry a literal line break glyph
ZERO_W = 0.3  # points; marks and the stray glyphs are drawn with no advance


def is_thai(ch: str) -> bool:
    return bool(ch) and THAI_START <= ord(ch) <= THAI_END


def clean_chars(chars: list[dict], stats: Counter | None = None) -> str:
    """Rebuild a line from PyMuPDF rawdict chars (each has 'c', 'origin', 'bbox')."""
    stats = stats if stats is not None else Counter()
    chars = list(chars)  # we may blank an entry below; never touch the caller's list
    out: list[str] = []
    n = len(chars)
    for i, c in enumerate(chars):
        ch = c["c"]
        width = c["bbox"][2] - c["bbox"][0]
        prev = out[-1] if out else ""

        if ch in JUNK_GLYPHS and (width < ZERO_W or is_thai(prev) or ch == "³"):
            stats["junk_glyph"] += 1
            continue
        if ch.isascii() and ch.isalpha() and width < ZERO_W and is_thai(prev):
            stats["junk_ascii"] += 1
            continue
        # 2563 editions: zero-width space (+ tone mark) + SARA AA == (tone mark +) SARA AM
        if ch == " " and width < ZERO_W and is_thai(prev) and i + 1 < n:
            nxt = chars[i + 1]["c"]
            if nxt == SARA_AA:
                out.append(SARA_AM)
                stats["sara_am_restored"] += 1
                chars[i + 1] = dict(chars[i + 1], c="")  # consume the SARA AA
                continue
            if nxt in TONE_MARKS and i + 2 < n and chars[i + 2]["c"] == SARA_AA:
                out.append(nxt + SARA_AM)
                stats["sara_am_restored"] += 1
                chars[i + 1] = dict(chars[i + 1], c="")
                chars[i + 2] = dict(chars[i + 2], c="")
                continue
        if ch == "":
            continue
        if ch in MARKS and prev == ch:
            stats["duplicate_mark"] += 1
            continue
        if ch in SPACE_LIKE:
            ch = SPACE_LIKE[ch]
            stats["space_normalised"] += 1
        out.append(ch)
    return normalise("".join(out), stats)


CONSONANTS = {chr(c) for c in range(0x0E01, 0x0E2F)}  # ก..ฮ (with ฤ ฦ)
LOWER_VOWELS = set("ฺุู")
TONE_TRUE = set("่้๊๋")  # ่ ้ ๊ ๋ (์ and ํ may legitimately combine with them)
_ORDER_STATS: Counter = Counter()
_CLUSTER = re.compile("([ก-ฮ])([" + "".join(sorted(MARKS)) + SARA_AM + "]{2,})")


def _order_marks(m: re.Match) -> str:
    base, marks = m.group(1), m.group(2)
    am = marks.count(SARA_AM)
    rest = [ch for ch in marks if ch != SARA_AM]
    # canonical Thai order: vowel above/below, then tone, then SARA AM last; drop exact repeats.
    # A base carries at most one upper vowel, one lower vowel and one tone mark; the source PDFs
    # contain a few overlapping typos (e.g. ซึี่ง drawn as ซึ่ง), so keep the first of each kind.
    seen, kinds, ordered = set(), set(), []
    for ch in sorted(rest, key=lambda ch: 0 if ch in UPPER_LOWER_VOWELS else 1):
        kind = "lower" if ch in LOWER_VOWELS else "upper" if ch in UPPER_LOWER_VOWELS else "tone" if ch in TONE_TRUE else ch
        if ch in seen or kind in kinds:
            _ORDER_STATS["overlapping_mark_dropped"] += 1
            continue
        seen.add(ch)
        kinds.add(kind)
        ordered.append(ch)
    return base + "".join(ordered) + (SARA_AM if am else "")


def normalise(text: str, stats: Counter | None = None) -> str:
    """Text-level normalisation, safe to run on any extracted Thai string."""
    stats = stats if stats is not None else Counter()
    before = text
    text = unicodedata.normalize("NFC", text)
    # decomposed SARA AM: NIKHAHIT (+ tone) + SARA AA  ->  tone + SARA AM
    text = re.sub(NIKHAHIT + "([่-๋]?)" + SARA_AA, lambda m: m.group(1) + SARA_AM, text)
    text = re.sub("([่-๋])" + NIKHAHIT + SARA_AA, r"\1" + SARA_AM, text)
    _ORDER_STATS.clear()
    text = _CLUSTER.sub(_order_marks, text)
    stats.update(_ORDER_STATS)
    for k, v in SPACE_LIKE.items():
        text = text.replace(k, v)
    text = re.sub(r"[  ]{2,}", " ", text)
    if text != before:
        stats["normalised_lines"] += 1
    return text


def invalid_clusters(text: str) -> int:
    """Count mark sequences that cannot occur in correct Thai: a mark with no base,
    two vowels above/below on one base, or two tone marks on one base."""
    bad = 0
    run_v = run_t = 0
    prev = ""
    for ch in text:
        if ch in MARKS or ch == SARA_AM:
            if prev not in CONSONANTS and prev not in MARKS:
                bad += 1
            if ch in UPPER_LOWER_VOWELS:
                run_v += 1
            elif ch in TONE_MARKS:
                run_t += 1
            if run_v > 1 or run_t > 1:
                bad += 1
                run_v = min(run_v, 1)
                run_t = min(run_t, 1)
        else:
            run_v = run_t = 0
        prev = ch
    return bad


ODD_SPACES = {" ", " ", " ", " ", " ", " "}


def residual_junk(text: str) -> int:
    return sum(1 for ch in text if ch in JUNK_GLYPHS or ch in ODD_SPACES)
