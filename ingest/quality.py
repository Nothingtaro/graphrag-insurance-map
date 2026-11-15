"""Measure extraction quality, before vs after repair.

    python -I ingest/quality.py            # reads ingest/out/pages/*.json, writes ingest/out/quality.md + .json

Metrics, per document and per page:
  * dictionary coverage: share of Thai characters that fall inside words found in the
    PyThaiNLP dictionary (plus a small domain list). Garbled text tokenises into unknown
    fragments, so this is the headline number.
  * residual junk: stray glyphs (Æ, U+FFFD, ...) still present.
  * invalid clusters: mark sequences impossible in correct Thai (double tone, mark without base).
"Before" is PyMuPDF's plain get_text() on the same page, with no repair.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz
from pythainlp.corpus import thai_words
from pythainlp.tokenize import word_tokenize
from pythainlp.util import Trie

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from thai_fix import invalid_clusters, is_thai, residual_junk  # noqa: E402

DOMAIN = """กรมธรรม์ ผู้เอาประกันภัย ผู้รับประโยชน์ คู่กรณี สินไหมทดแทน ค่าสินไหมทดแทน วินาศภัย
ประกันวินาศภัย อนุญาโตตุลาการ ร.ย. ร.ย.ภ. ร.ย.ฟ. พ.ร.บ. แบตเตอรี่ อัดประจุ ชาร์จ ไฟฟ้า สันดาป
เอกสารแนบท้าย ความเสียหายส่วนแรก ยานพาหนะ ทุพพลภาพ ประกันตัว เช่าซื้อ ลีสซิ่ง วิริยะ ปริมณฑล ธัญญะพาร์ค""".split()
# single characters that legitimately stand alone: list markers (ก) (ข), ฯ, ๆ, ณ
STANDALONE_OK = set("กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮฯๆ")
WORDS = set(thai_words()) | set(DOMAIN)
TRIE = Trie(WORDS)


def coverage(text: str) -> tuple[int, int]:
    """(Thai chars inside known words, all Thai chars)."""
    known = total = 0
    for tok in word_tokenize(text, custom_dict=TRIE, engine="newmm", keep_whitespace=False):
        n = sum(1 for ch in tok if is_thai(ch))
        if not n:
            continue
        total += n
        if tok in WORDS:
            known += n
    return known, total


def suspects(text: str) -> list[tuple[str, str]]:
    """Unknown multi-character Thai tokens with a little context: candidates for human review
    (source typos, words the repair could not restore)."""
    out, pos = [], 0
    for tok in word_tokenize(text, custom_dict=TRIE, engine="newmm", keep_whitespace=True):
        start = pos
        pos += len(tok)
        if not any(is_thai(ch) for ch in tok) or tok in WORDS or tok.strip() in STANDALONE_OK:
            continue
        out.append((tok, text[max(0, start - 15):pos + 15].replace("\n", " ").replace("\t", " ")))
    return out


def pct(a: int, b: int) -> float:
    return round(100.0 * a / b, 2) if b else 100.0


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    cfg = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    src_dir = HERE.parent / cfg["source_dir"]
    report = []
    for d in cfg["documents"]:
        path = HERE / "out" / "pages" / f"{d['id']}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        pdf = fitz.open(src_dir / d["file"])
        tot = {"bk": 0, "bt": 0, "ak": 0, "at": 0, "bj": 0, "aj": 0, "bi": 0, "ai": 0}
        pages = []
        for p in doc["pages"]:
            before = pdf[p["page"] - 1].get_text()
            after = p["text"] + "\n" + "\n".join(c or "" for t in p["tables"] for r in t["rows"] for c in r)
            bk, bt = coverage(before)
            ak, at = coverage(after)
            row = {"page": p["page"], "before": pct(bk, bt), "after": pct(ak, at), "thai_chars": at,
                   "junk_before": residual_junk(before), "junk_after": residual_junk(after),
                   "invalid_before": invalid_clusters(before), "invalid_after": invalid_clusters(after),
                   "suspects": suspects(after)}
            pages.append(row)
            for k, v in (("bk", bk), ("bt", bt), ("ak", ak), ("at", at), ("bj", row["junk_before"]), ("aj", row["junk_after"]),
                         ("bi", row["invalid_before"]), ("ai", row["invalid_after"])):
                tot[k] += v
        worst = sorted((p for p in pages if p["thai_chars"] > 200), key=lambda p: p["after"])[:3]
        report.append({"id": d["id"], "title": d["title"], "effective": doc["effective"], "pages": len(pages),
                       "coverage_before": pct(tot["bk"], tot["bt"]), "coverage_after": pct(tot["ak"], tot["at"]),
                       "junk_before": tot["bj"], "junk_after": tot["aj"], "invalid_before": tot["bi"], "invalid_after": tot["ai"],
                       "tables": sum(len(p["tables"]) for p in doc["pages"]), "repair": doc["repair"],
                       "worst_pages": worst, "per_page": pages})
        r = report[-1]
        print(f"{d['id']:15s} coverage {r['coverage_before']:6.2f}% -> {r['coverage_after']:6.2f}%   junk {r['junk_before']:5d} -> {r['junk_after']}   invalid {r['invalid_before']:5d} -> {r['invalid_after']}")

    (HERE / "out" / "quality.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    md = ["# คุณภาพการดึงข้อความ (ระยะ 1)", "",
          "ความครอบคลุมพจนานุกรม = สัดส่วนตัวอักษรไทยที่อยู่ในคำที่รู้จัก (PyThaiNLP + ศัพท์ประกันภัย) "
          "ก่อนซ่อม = `get_text()` ของ PyMuPDF ตรง ๆ, หลังซ่อม = ผลของ `extract.py`", "",
          "| เอกสาร | มีผล | หน้า | ตาราง | ความครอบคลุม ก่อน → หลัง | อักษรแปลกปลอม ก่อน → หลัง | กลุ่มสระ/วรรณยุกต์ผิด ก่อน → หลัง |",
          "|---|---|---:|---:|---|---|---|"]
    for r in report:
        md.append(f"| {r['title']} | {r['effective']} | {r['pages']} | {r['tables']} | {r['coverage_before']}% → **{r['coverage_after']}%** "
                  f"| {r['junk_before']:,} → {r['junk_after']} | {r['invalid_before']:,} → {r['invalid_after']} |")
    md += ["", "## รายการให้คนตรวจ: คำที่ไม่รู้จักหลังซ่อม", "",
           "ส่วนใหญ่เป็นคำพิมพ์ผิดในต้นฉบับ ระบบไม่เดาแก้ให้ ให้เทียบกับ PDF แล้วตัดสินใจ", "",
           "| เอกสาร | หน้า | คำ | บริบท |", "|---|---:|---|---|"]
    n_sus = 0
    for r in report:
        for p in r["per_page"]:
            for tok, ctx in p["suspects"]:
                md.append(f"| {r['id']} | {p['page']} | `{tok}` | …{ctx}… |")
                n_sus += 1
    if not n_sus:
        md.append("| – | – | ไม่มี | |")
    md += ["", "## หน้าที่คะแนนต่ำสุดของแต่ละเอกสาร (ไว้สุ่มตรวจกับ PDF)", ""]
    for r in report:
        md.append(f"- **{r['id']}**: " + ", ".join(f"หน้า {p['page']} ({p['after']}%)" for p in r["worst_pages"]))
    md += ["", "## การซ่อมที่ทำ (จำนวนครั้ง)", "", "| เอกสาร | วรรณยุกต์ซ้ำ | glyph แปลกปลอม | สระอำ (2563) | สระซ้อนจากต้นฉบับ | ตาราง |", "|---|---:|---:|---:|---:|---:|"]
    for r in report:
        rp = r["repair"]
        md.append(f"| {r['id']} | {rp.get('duplicate_mark', 0):,} | {rp.get('junk_glyph', 0) + rp.get('junk_ascii', 0):,} | "
                  f"{rp.get('sara_am_restored', 0)} | {rp.get('overlapping_mark_dropped', 0)} | {r['tables']} |")
    (HERE / "out" / "quality.md").write_text("\n".join(md) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
