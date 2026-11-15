"""Run: python -I -m unittest discover -s ingest/tests -v   (from the project root)"""
import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from thai_fix import MARKS, clean_chars, invalid_clusters, normalise  # noqa: E402


def glyphs(spec):
    """Build PyMuPDF-like rawdict chars. Thai marks and listed junk get zero width.
    spec: a string, or a list of (char, width) for explicit widths."""
    out, x = [], 0.0
    items = spec if isinstance(spec, list) else [(ch, None) for ch in spec]
    for ch, w in items:
        if w is None:
            w = 0.0 if (ch in MARKS or ch in "ÆÇÃÄÊË�") else 4.5
        out.append({"c": ch, "origin": (x, 10.0), "bbox": (x, 0.0, x + w, 12.0)})
        x += w
    return out


class Fix2568(unittest.TestCase):
    """InDesign 2568 editions: doubled marks plus a stray glyph at the same position."""

    def test_doubled_marks_and_replacement_char(self):
        self.assertEqual(clean_chars(glyphs("ภายใต้้การคุ้้�มครอง")), "ภายใต้การคุ้มครอง")

    def test_latin1_junk_after_marks(self):
        self.assertEqual(clean_chars(glyphs("เงื่่Æอนไข")), "เงื่อนไข")
        self.assertEqual(clean_chars(glyphs("ประกันภัยนี้Ç")), "ประกันภัยนี้")
        self.assertEqual(clean_chars(glyphs("ที่่Ãได้")), "ที่ได้")

    def test_superscript_three_after_sara_am(self):
        # ³ has a real advance width but always follows SARA AM
        self.assertEqual(clean_chars(glyphs([("จ", 4.5), ("ำ", 0.0), ("³", 3.0), ("ก", 4.5), ("ั", 0.0), ("ด", 4.5)])), "จำกัด")

    def test_zero_width_ascii_letter_after_thai(self):
        self.assertEqual(clean_chars(glyphs([("ค", 4.5), ("ุ", 0), ("้", 0), ("n", 0.0), ("ม", 4.5)])), "คุ้ม")

    def test_real_latin_text_untouched(self):
        self.assertEqual(clean_chars(glyphs("High Voltage Battery")), "High Voltage Battery")
        self.assertEqual(clean_chars(glyphs("แบตเตอรี่ (High Voltage)")), "แบตเตอรี่ (High Voltage)")

    def test_narrow_no_break_space(self):
        self.assertEqual(clean_chars(glyphs("ประกันภัย หรือ")), "ประกันภัย หรือ")

    def test_counts_repairs(self):
        st = Counter()
        clean_chars(glyphs("ต้้Ç"), st)
        self.assertEqual(st["duplicate_mark"], 1)
        self.assertEqual(st["junk_glyph"], 1)

    def test_caller_list_not_modified(self):
        g = glyphs([("ท", 4.5), (" ", 0.0), ("า", 4.5)])
        before = [c["c"] for c in g]
        clean_chars(g)
        self.assertEqual([c["c"] for c in g], before)


class Fix2563(unittest.TestCase):
    """Word-exported 2563 editions: SARA AM drawn as zero-width space + SARA AA."""

    def test_sara_am(self):
        self.assertEqual(clean_chars(glyphs([("ท", 7.3), (" ", 0.0), ("า", 5.3), ("ต", 6.8)])), "ทำต")

    def test_sara_am_with_tone(self):
        self.assertEqual(clean_chars(glyphs([("ต", 6.8), (" ", 0.0), ("่", 0.0), ("า", 5.3)])), "ต่ำ")
        self.assertEqual(clean_chars(glyphs([("น", 7.1), (" ", 0.0), ("้", 0.0), ("า", 5.3)])), "น้ำ")

    def test_real_space_before_sara_aa_kept(self):
        # a normal-width space is a word gap, not SARA AM
        self.assertEqual(clean_chars(glyphs([("ก", 4.5), (" ", 3.0), ("า", 4.5)])), "ก า")


class Normalise(unittest.TestCase):
    def test_decomposed_sara_am(self):
        self.assertEqual(normalise("น้ํา"), "น้ำ")
        self.assertEqual(normalise("นํ้า"), "น้ำ")

    def test_tone_before_vowel_reordered(self):
        self.assertEqual(normalise("คุ้ม"), "คุ้ม")

    def test_overlapping_vowels_from_source_typo(self):
        st = Counter()
        self.assertEqual(normalise("ซึี่ง", st), "ซึ่ง")
        self.assertEqual(st["overlapping_mark_dropped"], 1)

    def test_thanthakhat_with_tone_kept(self):
        self.assertEqual(normalise("ศักดิ์"), "ศักดิ์")


class Validator(unittest.TestCase):
    def test_clean_text_has_no_invalid_clusters(self):
        self.assertEqual(invalid_clusters("ผู้เอาประกันภัยต้องชำระเบี้ยประกันภัย ซึ่งรวมถึงน้ำท่วม"), 0)

    def test_detects_doubled_tone_and_orphan_mark(self):
        self.assertGreater(invalid_clusters("ต้้"), 0)
        self.assertGreater(invalid_clusters(" ่"), 0)


if __name__ == "__main__":
    unittest.main()
