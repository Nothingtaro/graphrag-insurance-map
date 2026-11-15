"""Run: python -I -m unittest discover -s ingest/tests -v   (from the project root)

Layouts below are copied from the real files (x positions in points, fonts, bold flags)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from structure import Clause, Line, code_key, chunks, join_lines, line_breaks, merge_definitions, parse, plan_parts, render  # noqa: E402

HEAD = dict(font="DBSathornX", size=14.0)
HEAD2 = dict(font="DBSathornX-Medium", size=14.0)


def doc(*pages):
    """pages: lists of (text, x, extra-kwargs) -> the phase-1 page JSON shape"""
    out = []
    for n, rows in enumerate(pages, 1):
        lines = []
        for i, row in enumerate(rows):
            text, x, kw = (row + ({},))[:3] if len(row) == 2 else row
            lines.append({"text": text, "x": x, "y": 50 + i * 13, "size": kw.get("size", 12.0),
                          "font": kw.get("font", "DBThaiTextX"), "bold": kw.get("bold", False)})
        out.append({"page": n, "lines": lines, "tables": []})
    return {"pages": out}


class Sections(unittest.TestCase):
    def test_numbered_section_with_wrapped_title(self):
        d = doc([("หมวดที่ 2\tหมวดการคุ้มครองความรับผิดต่อ", 45.4, HEAD2), ("บุคคลภายนอก", 106.3, HEAD2),
                 ("ข้อ 1.\t ข้อตกลงคุ้มครอง", 22.7, {"bold": True}), ("บริษัทจะชดใช้", 45.4)])
        sections, clauses, _ = parse(d)
        self.assertEqual(sections[0].key, "s2")
        self.assertEqual(sections[0].title, "หมวดที่ 2 : หมวดการคุ้มครองความรับผิดต่อบุคคลภายนอก")
        self.assertEqual([c.ref for c in clauses], ["หมวดที่ 2 ข้อ 1"])

    def test_endorsement_title_spread_over_rows(self):
        d = doc([("เอกสารแนบท้าย\tความคุ้มครองความเสียหายต่อ", 36.9, HEAD), ("รถยนต์เนื่องจากการชนกับยาน", 115.7, HEAD2),
                 ("พาหนะทางบก (ร.ย.ภ.10)", 115.7, HEAD2), ("ข้อ 1.\tข้อตกลงคุ้มครอง", 22.7, {"bold": True})])
        sections, clauses, _ = parse(d)
        self.assertEqual(sections[0].key, "rp10")
        self.assertEqual(sections[0].title,
                         "เอกสารแนบท้าย : ความคุ้มครองความเสียหายต่อรถยนต์เนื่องจากการชนกับยานพาหนะทางบก (ร.ย.ภ.10)")
        self.assertEqual(clauses[0].ref, "ร.ย.ภ.10 ข้อ 1")

    def test_ev_endorsement_split_into_two_rows(self):
        d = doc([("เอกสาร\tการประกันภัยค่ารักษาพยาบาล", 36.9, HEAD2), ("แนบท้าย\t(ร.ย.ฟ.02)", 36.9, HEAD2),
                 ("เป็นที่ตกลงกันว่า", 45.4)])
        sections, clauses, _ = parse(d)
        self.assertEqual((sections[0].key, sections[0].label), ("ryf02", "ร.ย.ฟ.02"))
        self.assertEqual(clauses[0].key, "ryf02_0")

    def test_2563_bold_headings(self):
        d = doc([("หมวดเงื่อนไขทั่วไป", 56.6, {"bold": True}), ("ข้อ 1. กรมธรรม์ประกันภัยนี้", 56.6, {"bold": True}),
                 ("การชำระเบี้ยประกันภัยกรณีผู้เอาประกันภัยเป็นนิติบุคคล", 56.6, {"bold": True}), ("ในกรณีที่", 92.7)])
        sections, clauses, _ = parse(d)
        self.assertEqual([s.key for s in sections], ["g", "jur"])
        self.assertEqual([c.key for c in clauses], ["g_1", "jur_0"])

    def test_branch_directory_ends_the_document(self):
        d = doc([("หมวดที่ 1\tหมวดเงื่อนไขทั่วไป", 36.9, HEAD), ("ข้อ 1.\tข้อความ", 22.7)],
                [("ศูนย์ฯ สาขา วิริยะประกันภัย ทั่วประเทศ", 30), ("ศูนย์ฯ ชุมพร\t0 7753 4360", 30)])
        _, clauses, _ = parse(d)
        self.assertNotIn("ชุมพร", join_lines(clauses[-1].lines))

    def test_codes(self):
        self.assertEqual([code_key(c) for c in ["ร.ย.01", "ร.ย.ภ.10", "ร.ย.ฟ.30", "ร.ย.30"]], ["ry01", "rp10", "ryf30", "ry30"])


class Numbering(unittest.TestCase):
    def test_subclauses_follow_the_current_clause(self):
        d = doc([("หมวดที่ 1\tหมวดเงื่อนไขทั่วไป", 36.9, HEAD), ("ข้อ 3.\tการยกเว้นทั่วไป", 22.7),
                 ("3.1\tข้อแรก", 45.4), ("3.2\tข้อสอง", 45.4), ("ข้อ 4.\tถัดไป", 22.7)])
        # ข้อ 3 opens without ข้อ 1-2 in this snippet, so it is not a heading: numbering must start at 1
        _, clauses, rejected = parse(d)
        self.assertEqual([c.key for c in clauses], ["s1_0"])
        self.assertTrue(rejected)

    def test_wrapped_cross_reference_is_body_text(self):
        d = doc([("หมวดที่ 1\tหมวดเงื่อนไขทั่วไป", 36.9, HEAD), ("ข้อ 1.\tนิยาม", 22.7), ("1.1\tรายการ", 45.4),
                 ("ข้อ 3.1.5 มาใช้บังคับโดยอนุโลม", 22.7), ("1.3\tข้ามลำดับ", 45.4), ("ข้อ 2.\tถัดไป", 22.7)])
        _, clauses, rejected = parse(d)
        self.assertEqual([c.key for c in clauses], ["s1_1", "s1_1_1", "s1_2"])
        self.assertIn("มาใช้บังคับโดยอนุโลม", join_lines(clauses[1].lines))
        self.assertEqual(len(rejected), 1)   # 1.3 after 1.1 is reported for review

    def test_pa_benefit_items(self):
        d = doc([("เอกสารแนบท้าย\tการประกันภัยอุบัติเหตุส่วนบุคคล", 36.9, HEAD), ("(ร.ย.01)", 115.7, HEAD2),
                 ("เมื่อใช้ในเอกสารแนบท้ายนี้", 22.7), ("การคุ้มครองข้อ 1 : การเสียชีวิต", 45.4),
                 ("การคุ้มครองข้อ 2 : การสูญเสีย มือ เท้า", 45.4)])
        _, clauses, _ = parse(d)
        self.assertEqual([c.ref for c in clauses], ["ร.ย.01", "ร.ย.01 การคุ้มครองข้อ 1", "ร.ย.01 การคุ้มครองข้อ 2"])


def rows(*spec):
    return [Line(t, 1, x, bold=b) for t, x, b in ((s + (False,))[:3] for s in spec)]


class Text(unittest.TestCase):
    def test_thai_wraps_join_without_space_and_title_breaks(self):
        body = rows(("ข้อ 1.\tข้อตกลงคุ้มครอง", 22.7, True), ("รถยนต์สูญหาย บริษัทจะชดใช้ค่าสินไหม", 45.4),
                    ("ทดแทน เมื่อรถยนต์", 22.7), ("รถยนต์ไฟไหม้ บริษัทจะชดใช้", 45.4), ("ค่าสินไหมทดแทน", 22.7))
        self.assertEqual(join_lines(body), "ข้อ 1. ข้อตกลงคุ้มครอง\nรถยนต์สูญหาย บริษัทจะชดใช้ค่าสินไหมทดแทน เมื่อรถยนต์\n"
                                           "รถยนต์ไฟไหม้ บริษัทจะชดใช้ค่าสินไหมทดแทน")

    def test_full_width_bold_row_is_not_a_title(self):
        body = rows(("1.1\tความเสียหายต่อชีวิต ร่างกาย หรืออนามัย บริษัทจะรับผิดชดใช้", 45.0, True),
                    ("ค่าสินไหมทดแทน", 67.7))
        self.assertNotIn("\n", join_lines(body))

    def test_list_items_and_wrapped_references(self):
        # real items sit right of the clause's left edge; a wrapped "(ข) และ (ค)" sits on it
        body = rows(("ข้อ 4.\tความเสียหายส่วนแรก", 22.7, True), ("(ก)\t1,000 บาทแรก", 45.4),
                    ("หรือกรณีที่เกิดจากการชน", 68.0), ("(ข)\tตามจำนวนเงิน", 45.4),
                    ("ในกรณีที่ต้องรับผิดชอบเอง ตาม (ก)", 45.4), ("(ข) และ (ค) บริษัทจะจ่ายแทน", 22.7), ("ไปก่อน", 22.7))
        self.assertEqual(join_lines(body).split("\n"),
                         ["ข้อ 4. ความเสียหายส่วนแรก", "(ก) 1,000 บาทแรกหรือกรณีที่เกิดจากการชน", "(ข) ตามจำนวนเงิน",
                          "ในกรณีที่ต้องรับผิดชอบเอง ตาม (ก) (ข) และ (ค) บริษัทจะจ่ายแทนไปก่อน"])

    def test_table_rows_stay_on_their_own_lines(self):
        body = [Line("ตารางอัตรา", 1, 22.7), Line("ไม่เกิน 1 ปี | 100", 1, table=True), Line("เกินกว่า 5 ปี ขึ้นไป | 50", 1, table=True),
                Line("เมื่อบริษัทได้ชดใช้", 1, 45.4), Line("ความเสียหาย", 1, 22.7)]
        self.assertEqual(render(body, line_breaks(body)).split("\n")[1:3], ["ไม่เกิน 1 ปี | 100", "เกินกว่า 5 ปี ขึ้นไป | 50"])


class Definitions(unittest.TestCase):
    def test_two_column_definitions_become_one_line_each(self):
        body = [Line("“รถยนต์”\tหมายถึง\tรถยนต์ที่เอาประกันภัย ซึ่งมีรายการที่ระบุไว้", 1, 45.4),
                Line("ในตาราง", 1, 126.7),
                Line("“อุบัติเหตุ\tหมายถึง\tเหตุการณ์หนึ่งหรือหลายเหตุการณ์สืบเนื่องกัน", 1, 45.4),
                Line("แต่ละครั้ง”\tซึ่งเกิดจากสาเหตุเดียวกัน", 1, 45.6),
                Line("ทุพพลภาพชั่วคราว\tห\tมายถึง\tทุพพลภาพถึงขนาด", 1, 45.4),
                Line("เป็นที่ตกลงกันว่า", 1, 45.4), Line("ดังต่อไปนี้", 1, 22.7)]
        self.assertEqual(join_lines(body).split("\n"), [
            "“รถยนต์” หมายถึง รถยนต์ที่เอาประกันภัย ซึ่งมีรายการที่ระบุไว้ในตาราง",
            "“อุบัติเหตุแต่ละครั้ง” หมายถึง เหตุการณ์หนึ่งหรือหลายเหตุการณ์สืบเนื่องกันซึ่งเกิดจากสาเหตุเดียวกัน",
            "ทุพพลภาพชั่วคราว หมายถึง ทุพพลภาพถึงขนาด",
            "เป็นที่ตกลงกันว่าดังต่อไปนี้"])

    def test_sentence_using_the_word_is_not_a_definition(self):
        body = [Line("รถยนต์เสียหายสิ้นเชิง ในที่นี้หมายถึง รถยนต์ได้รับความ", 1, 45.4), Line("เสียหาย", 1, 22.7)]
        self.assertEqual(len(merge_definitions(body)), 2)


class Chunks(unittest.TestCase):
    def test_parts_end_at_paragraphs(self):
        paras = ["ก" * 300, "ข" * 300, "ค" * 300]
        text = "\n".join(paras)
        bounds = [301, 602]
        parts = plan_parts(text, bounds, max_chars=400)
        self.assertEqual([text[a:b].strip()[0] for a, b in parts], ["ก", "ข", "ค"])

    def test_long_paragraph_is_cut_before_a_connecting_word(self):
        text = "ก" * 300 + " ทั้งนี้" + "ข" * 300 + " และ" + "ค" * 200
        parts = plan_parts(text, [], max_chars=400)
        self.assertTrue(text[parts[1][0]:parts[1][1]].strip().startswith("ทั้งนี้"))

    def test_table_stays_with_its_title(self):
        para = "ก" * 60
        lines = [Line("ข้อ 2.\tหัวข้อ", 1, 22.7, bold=True)]
        for _ in range(3):
            lines += [Line(para, 1, 45.4)] + [Line(para, 1, 22.7) for _ in range(4)]
        lines += [Line("ตารางอัตรา", 2, 45.4)] + [Line(f"แถว {i} อายุการใช้งานแบตเตอรี่ | {i}0", 2, table=True) for i in range(8)]
        c = Clause("s4_2", "หมวดที่ 4 ข้อ 2", "หมวดที่ 4", lines)
        out = chunks([c], "ev1", "EV1", max_chars=400)
        self.assertGreater(len(out), 1)
        with_table = [k for k, v in out.items() if "แถว" in v["text"]]
        self.assertEqual(len(with_table), 1)
        self.assertIn("ตารางอัตรา", out[with_table[0]]["text"])
        self.assertEqual(out[with_table[0]]["page"], "2")

    def test_chunk_ids_and_refs(self):
        d = doc([("หมวดที่ 4\tหมวดการคุ้มครอง", 36.9, HEAD), ("ข้อ 1.\tข้อตกลงคุ้มครอง", 22.7, {"bold": True})]
                + [("ข" * 60, 45.4 if i % 4 == 0 else 22.7) for i in range(40)])
        _, clauses, _ = parse(d)
        out = chunks(clauses, "t1", "T1", max_chars=700)
        keys = list(out)
        self.assertTrue(all(k.startswith("t1_s4_1_p") for k in keys))
        self.assertEqual(out[keys[0]]["ref"], f"หมวดที่ 4 ข้อ 1 (ส่วนที่ 1/{len(keys)})")
        self.assertEqual(out[keys[0]]["sec"], "หมวดที่ 4 : หมวดการคุ้มครอง")


if __name__ == "__main__":
    unittest.main()
