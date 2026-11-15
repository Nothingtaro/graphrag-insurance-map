"""Phase 1: PDF -> clean page text + tables.

    python -I ingest/extract.py                # every document in ingest/sources.json
    python -I ingest/extract.py --only ev-t1-2568

Writes, per document, ingest/out/pages/<id>.json (machine-readable) and <id>.md (for review).
Thai glyph repair lives in thai_fix.py; quality.py measures the result.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz  # PyMuPDF

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from thai_fix import clean_chars, is_thai  # noqa: E402

ROOT = HERE.parent
BAND = 0.075          # top/bottom share of the page where running headers and footers live
SAME_BASELINE = 2.0   # points; lines closer than this are one visual row
MIN_TABLE_ROWS, MIN_TABLE_COLS = 3, 2


def find_tables(page: fitz.Page) -> list:
    """Ruled tables only. Decorative 1-row boxes (section headers, page numbers) and the
    full-page cover frame are not tables."""
    try:
        found = page.find_tables().tables
    except Exception:  # PyMuPDF raises on some vector-heavy pages; treat as no tables
        return []
    area = page.rect.width * page.rect.height
    keep = []
    for t in found:
        x0, y0, x1, y1 = t.bbox
        if t.row_count < MIN_TABLE_ROWS or t.col_count < MIN_TABLE_COLS:
            continue
        if (x1 - x0) * (y1 - y0) > 0.8 * area:
            continue
        keep.append(t)
    return keep


def inside(pt, bbox, pad=0.5) -> bool:
    return bbox[0] - pad <= pt[0] <= bbox[2] + pad and bbox[1] - pad <= pt[1] <= bbox[3] + pad


def char_point(c) -> tuple[float, float]:
    # marks have zero width; their origin x plus mid-height is a stable location
    return (c["origin"][0] + 0.01, (c["bbox"][1] + c["bbox"][3]) / 2)


def join_cell_lines(parts: list[str]) -> str:
    """Lines wrapped inside a table cell. Thai does not separate words with spaces,
    so a wrap between two Thai characters is joined directly."""
    out = ""
    for p in (p.strip() for p in parts):
        if not p:
            continue
        if out and not (is_thai(out[-1]) and is_thai(p[0])):
            out += " "
        out += p
    return out


def page_items(page: fitz.Page, stats: Counter) -> tuple[list[dict], list[dict]]:
    raw = page.get_text("rawdict", sort=True)
    tables = find_tables(page)
    lines, cells_chars = [], {}
    for b in raw["blocks"]:
        if b.get("type") != 0:
            continue
        for ln in b["lines"]:
            chars = [c for s in ln["spans"] for c in s["chars"]]
            if not chars:
                continue
            body = []
            for c in chars:
                pt = char_point(c)
                hit = None
                for ti, t in enumerate(tables):
                    if inside(pt, t.bbox):
                        for ri, row in enumerate(t.rows):
                            for ci, cb in enumerate(row.cells):
                                if cb and inside(pt, cb, pad=0.2):
                                    hit = (ti, ri, ci)
                                    break
                            if hit:
                                break
                        if hit is None:
                            hit = (ti, -1, -1)  # inside the table frame but outside any cell
                        break
                if hit is None:
                    body.append(c)
                elif hit[1] >= 0:
                    cells_chars.setdefault(hit, []).append((id(ln), c))
            if body:
                text = clean_chars(body, stats).strip(" ")
                if text.strip():
                    span = max(ln["spans"], key=lambda s: len(s["chars"]))
                    lines.append({"y": body[0]["origin"][1], "x": body[0]["origin"][0], "text": text,
                                  "font": span["font"], "size": round(span["size"], 1),
                                  "bold": bool(span["flags"] & 16) or "bold" in span["font"].lower()})

    out_tables = []
    for ti, t in enumerate(tables):
        rows = []
        for ri, row in enumerate(t.rows):
            cells = []
            for ci, cb in enumerate(row.cells):
                if cb is None:  # merged with the cell to its left
                    cells.append(None)
                    continue
                got = cells_chars.get((ti, ri, ci), [])
                segs, cur, cur_id = [], [], None
                for lid, c in got + [(None, None)]:
                    if (lid != cur_id or c is None) and cur:
                        segs.append({"y": cur[0]["origin"][1], "x": cur[0]["origin"][0], "text": clean_chars(cur, stats).strip()})
                        cur = []
                    if c is None:
                        break
                    cur_id = lid
                    cur.append(c)
                rows_in_cell = merge_rows([s for s in segs if s["text"]])
                if len(rows_in_cell) >= 4 or any("\t" in r["text"] for r in rows_in_cell):
                    # an unruled list inside one ruled cell (e.g. branch directory): keep its rows and columns
                    cells.append("\n".join(r["text"] for r in rows_in_cell))
                else:
                    cells.append(join_cell_lines([r["text"] for r in rows_in_cell]))
            rows.append(cells)
        out_tables.append({"bbox": [round(v, 1) for v in t.bbox], "rows": rows})
        stats["tables"] += 1
    return lines, out_tables


def merge_rows(lines: list[dict]) -> list[dict]:
    """Lines on the same baseline are one row (e.g. term | หมายถึง | definition); join by tab."""
    lines = sorted(lines, key=lambda l: (round(l["y"], 1), l["x"]))
    rows: list[list[dict]] = []
    for l in lines:
        if rows and abs(rows[-1][0]["y"] - l["y"]) <= SAME_BASELINE:
            rows[-1].append(l)
        else:
            rows.append([l])
    merged = []
    for r in rows:
        r.sort(key=lambda l: l["x"])
        text = "\t".join(s["text"].strip("\t ") for s in r if s["text"].strip())
        row = {"y": r[0]["y"], "x": r[0]["x"], "text": re.sub(r"\t{2,}", "\t", text)}
        for k in ("font", "size", "bold"):
            if k in r[0]:
                row[k] = r[0][k]
        merged.append(row)
    return merged


def signature(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", text)).strip()


def strip_running(pages: list[dict], heights: list[float]) -> Counter:
    """Drop page numbers and lines repeated in the top/bottom band of many pages."""
    freq = Counter()
    for p, h in zip(pages, heights):
        for l in p["_rows"]:
            if l["y"] < h * BAND or l["y"] > h * (1 - BAND):
                freq[signature(l["text"])] += 1
    need = max(2, int(0.3 * len(pages)))
    dropped = Counter()
    for p, h in zip(pages, heights):
        keep = []
        for l in p["_rows"]:
            sig = signature(l["text"])
            in_band = l["y"] < h * BAND or l["y"] > h * (1 - BAND)
            if in_band and (freq[sig] >= need or re.fullmatch(r"[#\s/\-–]*", sig)):
                p["dropped"].append(l["text"])
                dropped[sig] += 1
                continue
            keep.append(l)
        p["_rows"] = keep
    return dropped


def render_table_md(t: dict) -> str:
    rows = t["rows"]
    width = max(len(r) for r in rows)
    fix = lambda s: (s or "").replace("|", "\\|").replace("\t", " · ").replace("\n", "<br>")
    out = []
    for i, r in enumerate(rows):
        r = r + [None] * (width - len(r))
        out.append("| " + " | ".join(fix(c) for c in r) + " |")
        if i == 0:
            out.append("|" + "---|" * width)
    return "\n".join(out)


def extract(doc_meta: dict, src_dir: Path, out_dir: Path) -> dict:
    path = src_dir / doc_meta["file"]
    pdf = fitz.open(path)
    stats = Counter()
    pages, heights = [], []
    for pno in range(len(pdf)):
        page = pdf[pno]
        lines, tables = page_items(page, stats)
        pages.append({"page": pno + 1, "_rows": merge_rows(lines), "tables": tables, "dropped": []})
        heights.append(page.rect.height)
    dropped = strip_running(pages, heights)

    for p in pages:
        items = [(l["y"], "line", l["text"]) for l in p["_rows"]]
        items += [(t["bbox"][1], "table", i) for i, t in enumerate(p["tables"])]
        items.sort(key=lambda x: (x[0], x[1] == "line"))
        text_lines = []
        for _, kind, v in items:
            text_lines.append(f"[[TABLE {v + 1}]]" if kind == "table" else v)
        p["text"] = "\n".join(text_lines)
        # layout hints for phase 2 (structure parsing): indent, font, bold
        p["lines"] = [{"text": l["text"], "x": round(l["x"], 1), "y": round(l["y"], 1),
                       "font": l.get("font"), "size": l.get("size"), "bold": l.get("bold", False)} for l in p["_rows"]]
        del p["_rows"]

    first = "\n".join(p["text"] for p in pages[:2])
    m = re.search(r"มีผลบังคับใช้\s*(\d{1,2}\s*\S+\s*25\d\d)", first)
    result = {
        **doc_meta,
        "pages_count": len(pages),
        "effective": re.sub(r"\s+", " ", m.group(1)) if m else None,
        "edition": re.search(r"25\d\d", m.group(1)).group(0) if m else None,
        "page_size": [round(pdf[0].rect.width), round(pdf[0].rect.height)],
        "repair": dict(stats),
        "running_lines_dropped": sum(dropped.values()),
        "pages": pages,
    }
    (out_dir / "pages").mkdir(parents=True, exist_ok=True)
    (out_dir / "pages" / f"{doc_meta['id']}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")

    md = [f"# {doc_meta['title']}", "",
          f"ไฟล์ `{doc_meta['file']}` · {len(pages)} หน้า · มีผลบังคับใช้ {result['effective'] or 'ไม่พบ'}", ""]
    for p in pages:
        md.append(f"## หน้า {p['page']}")
        md.append("")
        body = p["text"]
        for i, t in enumerate(p["tables"]):
            body = body.replace(f"[[TABLE {i + 1}]]", "\n" + render_table_md(t) + "\n")
        md.append(body)
        md.append("")
    (out_dir / "pages" / f"{doc_meta['id']}.md").write_text("\n".join(md), encoding="utf-8")
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default=str(HERE / "sources.json"))
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--only")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    cfg = json.loads(Path(a.sources).read_text(encoding="utf-8"))
    src_dir = ROOT / cfg["source_dir"]
    for d in cfg["documents"]:
        if a.only and d["id"] != a.only:
            continue
        r = extract(d, src_dir, Path(a.out))
        rep = ", ".join(f"{k}={v}" for k, v in sorted(r["repair"].items()))
        print(f"{d['id']:15s} {r['pages_count']:3d} หน้า  มีผล {r['effective']}  {rep}  header/footer={r['running_lines_dropped']}")


if __name__ == "__main__":
    main()
