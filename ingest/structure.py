"""Phase 2a: clean pages (ingest/out/pages/<id>.json) -> sections -> clauses -> chunks.

No I/O here so the rules can be unit tested. build_data.py does the reading and writing.

Structure of the policy wordings
  section   หมวดที่ N (2568) / หมวดเงื่อนไขทั่วไป (2563) / เอกสารแนบท้าย ... (endorsements)
  clause    ข้อ N.            numbered from 1 inside each section
  sub       N.M               only when N is the current ข้อ and M is the next number
  item      การคุ้มครองข้อ N :  the numbered benefits inside ร.ย.01 / ร.ย.ฟ.01
Deeper levels (1.1.1, (1), ก.) stay inside their clause text.

A line that looks like a heading but breaks the numbering sequence (for example a wrapped
cross reference such as "ข้อ 3.1.5 มาใช้บังคับโดยอนุโลม") is kept as body text and listed in
`rejected` so a person can check it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

MAX_CHARS = 700        # a chunk longer than this is split
MIN_TAIL = 160         # do not leave a tiny last part; merge it back instead
HEADING_MAX = 40       # a bold row shorter than this that ends a bold run is a clause title

THAI = re.compile(r"[฀-๿]")

RE_SECTION_NUM = re.compile(r"^หมวดที่\s*(\d+)\s*(.*)$")
RE_SECTION_GENERAL = re.compile(r"^หมวดเงื่อนไขทั่วไป\s*$")
RE_ENDORSE = re.compile(r"^เอกสาร(?:แนบท้าย)?(?:\t|\s{2,}|\s*$)(.*)$")
RE_ENDORSE_2563 = re.compile(r"^(?:เอกสารแนบท้าย(\S.*)|การชำระเบี้ยประกันภัยกรณีผู้เอาประกันภัยเป็นนิติบุคคล)$")
RE_CODE = re.compile(r"\(\s*(ร\.ย\.[^)]*?)\s*\)")
RE_TOP = re.compile(r"^ข้อ\s*(\d+)\s*\.?(?=[\s\t]|$)(.*)$")
RE_SUB = re.compile(r"^(\d+)\.(\d+)(?![.\d])\s*(.*)$")
RE_ITEM = re.compile(r"^การคุ้มครองข้อ\s*(\d+)\s*:\s*(.*)$")
RE_STOP = re.compile(r"^(ศูนย์ฯ\s*สาขา|สำนักงานใหญ่\s*$)")
# a new visual line inside a clause. List markers only count when the line sits right of the
# clause's base x: a wrapped "(ข) และ (ค)" at the left margin is a continuation, not an item.
RE_ENUM = re.compile(r"^(\(\d+\)|\d+(\.\d+)+\.?(\s|$)|[ก-ฮ]\.\s|\([ก-ฮ]\)|ขั้นที่\s*\d)")
RE_BREAK = re.compile(r"^(“|•|\d+\s?%|ข้อจำกัด|หมายเหตุ|การยกเว้น\s*:|เงื่อนไข(อื่น)?\s*:)")
RE_PCT_ITEM = re.compile(r"^\d+\s?%")          # "100 % ของจำนวนเงินเอาประกันภัย ..." rows in ร.ย.01
RE_TABLE_TITLE = re.compile(r"^(ตาราง|อัตรา)")
INDENT = 5.0           # points; smaller x differences are the same column
# a definition row: "<term> <tab> หมายถึง <tab> <meaning>" (the keyword must touch a tab, so an
# ordinary sentence that says "หมายถึง" is not taken for a table row). Phase 1 sometimes splits
# the keyword itself ("ห<tab>มายถึง"), which is mended before matching.
RE_DEF = re.compile(r"^(?P<term>[^\t]+?)\s*(?:\t\s*(?P<k1>หมายถึง|หมายความว่า|ให้รวมถึง)\s*\t?|(?P<k2>หมายถึง|หมายความว่า)\s*\t)\s*(?P<body>.*)$")
# where a long paragraph may be cut when no paragraph break is near: before these words
RE_PHRASE = re.compile(r" (?=ทั้งนี้|ในกรณี|กรณี|หาก|ถ้า|เว้นแต่|แต่|โดย|เมื่อ|ซึ่ง|และ|หรือ|บริษัท|ผู้เอาประกันภัย)")


@dataclass
class Line:
    text: str
    page: int
    x: float = 0.0
    size: float = 12.0
    font: str = ""
    bold: bool = False
    table: bool = False
    brk: bool = False        # always starts a new line (set when rows are merged)


@dataclass
class Clause:
    key: str                 # e.g. s2_1_2, rp10_3, ry01_2, g_11
    ref: str                 # e.g. หมวดที่ 2 ข้อ 1.2, ร.ย.ภ.10 ข้อ 3
    sec: str                 # section title shown in the UI
    lines: list = field(default_factory=list)


@dataclass
class Section:
    key: str                 # s1, s2, g, rp10, ry01, jur ...
    label: str               # short label used in refs: หมวดที่ 2, ร.ย.ภ.10, ร.ย.01
    title: str               # full title
    kind: str                # section / endorsement
    head: list = field(default_factory=list)


# ---------- reading the page stream ----------

def table_lines(table: dict, page: int) -> list[Line]:
    out = []
    for row in table["rows"]:
        cells = [re.sub(r"\s*\n\s*", " ", c).strip() for c in row if c]
        cells = [c for c in cells if c]
        if cells:
            out.append(Line(" | ".join(cells), page, table=True))
    return out


def stream(doc: dict) -> list[Line]:
    """All body lines of a document in reading order, tables placed by their y position,
    stopping at the branch directory that closes the 2568 booklets."""
    out = []
    for p in doc["pages"]:
        items = [(l["y"], 0, Line(l["text"], p["page"], l["x"], l.get("size", 12.0), l.get("font", ""), l.get("bold", False)))
                 for l in p["lines"]]
        for t in p.get("tables", []):
            items.append((t["bbox"][1], 1, table_lines(t, p["page"])))
        items.sort(key=lambda it: (it[0], it[1]))
        for _, kind, v in items:
            if kind == 0:
                if RE_STOP.match(v.text.strip()):
                    return out
                out.append(v)
            else:
                out.extend(v)
    return out


def is_header_font(l: Line) -> bool:
    return "Sathorn" in l.font and l.size >= 13.5


def header_start(l: Line) -> bool:
    t = l.text.strip()
    if is_header_font(l):
        return bool(RE_SECTION_NUM.match(t) or RE_ENDORSE.match(t))
    if l.bold:
        return bool(RE_SECTION_NUM.match(t) or RE_SECTION_GENERAL.match(t) or RE_ENDORSE_2563.match(t))
    return False


# ---------- ids and labels ----------

def code_key(code: str) -> str:
    """ร.ย.01 -> ry01, ร.ย.ภ.10 -> rp10, ร.ย.ฟ.01 -> ryf01, ร.ย.30 -> ry30"""
    c = code.replace(" ", "")
    m = re.match(r"^ร\.ย\.(?:(ภ|ฟ)\.)?(\d+)$", c)
    if not m:
        return "e_" + re.sub(r"\W", "", c)
    return {"ภ": "rp", "ฟ": "ryf", None: "ry"}[m.group(1)] + m.group(2)


def join_title(texts: list[str]) -> str:
    """Header rows wrap mid-word; join Thai to Thai directly, anything else with a space."""
    out = ""
    for t in (re.sub(r"\s+", " ", t.replace("\t", " ")).strip() for t in texts):
        if not t:
            continue
        out = out + t if out and THAI.match(out[-1]) and THAI.match(t[0]) else (out + " " + t).strip()
    return out


def make_section(header: list[Line], used: set) -> Section:
    texts = [h.text.strip() for h in header]
    m = RE_SECTION_NUM.match(texts[0])
    if m:
        n = m.group(1)
        title = join_title([m.group(2), *texts[1:]])
        return Section("s" + n, "หมวดที่ " + n, f"หมวดที่ {n} : {title}", "section", header)
    if RE_SECTION_GENERAL.match(texts[0]):
        return Section("g", "", "หมวดเงื่อนไขทั่วไป", "section", header)
    # endorsement. 2568: "เอกสารแนบท้าย\t<title>"; EV: "เอกสาร\t<title>" then "แนบท้าย\t(<code>)";
    # 2563: "เอกสารแนบท้าย<title>" on one bold row
    if texts[0].startswith("เอกสารแนบท้าย"):
        texts[0] = texts[0][len("เอกสารแนบท้าย"):]
    elif texts[0].startswith("เอกสาร"):
        texts[0] = texts[0][len("เอกสาร"):]
        if len(texts) > 1 and texts[1].startswith("แนบท้าย"):
            texts[1] = texts[1][len("แนบท้าย"):]
    body = join_title(texts)
    cm = RE_CODE.search(body)
    if cm:
        code = cm.group(1).replace(" ", "")
        name = body[:cm.start()].strip()
        key, label = code_key(code), code
        title = f"เอกสารแนบท้าย : {name} ({code})"
    elif "นิติบุคคล" in body:
        key, label, title = "jur", "เอกสารแนบท้าย การชำระเบี้ย (นิติบุคคล)", "เอกสารแนบท้าย : " + body
    else:
        key, label, title = "e", "เอกสารแนบท้าย", "เอกสารแนบท้าย : " + body
    base, n = key, 2
    while key in used:
        key, n = f"{base}{n}", n + 1
    return Section(key, label, title, "endorsement", header)


def ref_of(sec: Section, top: int | None, sub: int | None, item: bool) -> str:
    if top is None:
        return sec.label or sec.title
    if item:
        num = f"การคุ้มครองข้อ {top}"
    else:
        num = f"ข้อ {top}" + (f".{sub}" if sub else "")
    return f"{sec.label} {num}".strip()


# ---------- the parser ----------

def parse(doc: dict, implicit_title: str = "") -> tuple[list[Section], list[Clause], list[dict]]:
    """Returns sections, clauses (in order) and rejected heading candidates."""
    lines = stream(doc)
    sections: list[Section] = []
    clauses: list[Clause] = []
    rejected: list[dict] = []
    used: set = set()

    sec: Section | None = None
    cur: Clause | None = None
    top = sub = 0
    item_mode = False
    i = 0

    def open_section(s: Section):
        nonlocal sec, cur, top, sub, item_mode
        sec, top, sub, item_mode = s, 0, 0, False
        used.add(s.key)
        sections.append(s)
        cur = Clause(f"{s.key}_0", ref_of(s, None, None, False), s.title)
        clauses.append(cur)

    def open_clause(t: int, s: int | None, item: bool):
        nonlocal cur
        key = f"{sec.key}_{t}" + (f"_{s}" if s else "")
        cur = Clause(key, ref_of(sec, t, s, item), sec.title)
        clauses.append(cur)

    while i < len(lines):
        l = lines[i]
        t = l.text.strip()
        if not t:
            i += 1
            continue
        if not l.table and header_start(l):
            header = [l]
            j = i + 1
            while j < len(lines) and is_header_font(lines[j]) and not header_start(lines[j]):
                header.append(lines[j])
                j += 1
            open_section(make_section(header, used))
            i = j
            continue
        if not l.table:
            m_top, m_sub, m_item = RE_TOP.match(t), RE_SUB.match(t), RE_ITEM.match(t)
            if sec is None and (m_top and int(m_top.group(1)) == 1):
                # 2563 พ.ร.บ.: no หมวด heading, the clauses start right after the title
                open_section(Section("g", "", implicit_title or "เงื่อนไขทั่วไป", "section", []))
            if sec is not None:
                if m_top and not item_mode:
                    n = int(m_top.group(1))
                    if n == top + 1:
                        top, sub = n, 0
                        open_clause(top, None, False)
                        cur.lines.append(l)
                        i += 1
                        continue
                    rejected.append({"page": l.page, "text": t[:80], "why": f"ข้อ {n} หลังข้อ {top}"})
                elif m_item:
                    n = int(m_item.group(1))
                    if n == top + 1:
                        item_mode, top, sub = True, n, 0
                        open_clause(top, None, True)
                        cur.lines.append(l)
                        i += 1
                        continue
                    rejected.append({"page": l.page, "text": t[:80], "why": f"การคุ้มครองข้อ {n} หลังข้อ {top}"})
                elif m_sub and top and not item_mode:
                    a, b = int(m_sub.group(1)), int(m_sub.group(2))
                    if a == top and b == sub + 1:
                        sub = b
                        open_clause(top, sub, False)
                        cur.lines.append(l)
                        i += 1
                        continue
                    if a == top or (a == top + 1 and b == 1):
                        rejected.append({"page": l.page, "text": t[:80], "why": f"{a}.{b} หลังข้อ {top}.{sub}"})
        if cur is not None:
            cur.lines.append(l)
        i += 1

    clauses = [c for c in clauses if any(x.text.strip() for x in c.lines)]
    return sections, clauses, rejected


# ---------- text and chunks ----------

def clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.replace("\t", " ")).strip()


def line_breaks(body: list[Line]) -> list[bool]:
    """For each row of a clause: does it start a new line (paragraph, list item, table row,
    definition) rather than continue the row before? Uses the layout of the whole clause."""
    xs = [l.x for l in body if not l.table and l.x > 0]
    base = min(xs) if xs else 0.0
    out = []
    prev_bold, prev_len = False, 0
    for i, l in enumerate(body):
        t = clean(l.text)
        # a short bold row followed by plain text is a clause title ("ข้อ 1. ข้อตกลงคุ้มครอง");
        # a full-width bold row is a sentence that wraps on, so no break there
        heading_ended = prev_bold and not l.bold and prev_len < HEADING_MAX
        prev_bold, prev_len = l.bold, len(t)
        # first-line indent: further right than the next row, and not the last row of a
        # hanging-indent block (those share the x of the row before)
        prev_x = body[i - 1].x if i else None
        next_x = body[i + 1].x if i + 1 < len(body) and not body[i + 1].table else None
        prev_t = body[i - 1].text.strip() if i else ""
        prev_item = i > 0 and bool(RE_ENUM.match(prev_t) or RE_PCT_ITEM.match(prev_t))
        hanging = prev_item and l.x > body[i - 1].x
        # after a one-row list item the paragraph start shares the item's x
        moved = prev_x is not None and (abs(l.x - prev_x) > 2 or prev_item)
        paragraph = (l.x > 0 and next_x is not None and not hanging and moved and l.x > next_x + INDENT)
        item = bool(RE_ENUM.match(t)) and l.x > base + INDENT
        # "ตารางอัตรา..." right above a table; other rows there are the end of a sentence
        table_title = not l.table and i + 1 < len(body) and body[i + 1].table and bool(RE_TABLE_TITLE.match(t))
        out.append(i > 0 and (l.table or l.brk or heading_ended or paragraph or item or table_title
                              or bool(RE_BREAK.match(t)) or body[i - 1].table))
    return out


def render_map(body: list[Line], breaks: list[bool]) -> tuple[str, list[int]]:
    """Thai has no spaces between words, so a wrap between two Thai characters is joined
    directly; anything else joins with a space, and a break starts a new line. Also returns
    where each row starts in the text, so parts of the text can be traced back to pages."""
    out, starts = "", []
    for l, br in zip(body, breaks):
        t = clean(l.text)
        if out:
            if br:
                out = out.rstrip() + "\n"
            elif not (THAI.match(out[-1]) and THAI.match(t[0])):
                out += " "
        starts.append(len(out))
        out += t
    return out, starts


def render(body: list[Line], breaks: list[bool]) -> str:
    return render_map(body, breaks)[0].strip()


def thai_join(a: str, b: str) -> str:
    if a and b and THAI.match(a[-1]) and THAI.match(b[0]):
        return a + b
    return (a + " " + b).strip()


def merge_definitions(body: list[Line]) -> list[Line]:
    """Definition tables are two columns: the term (which may wrap inside its column) and its
    meaning (which wraps in a column further right). Each definition becomes one row:
    "<term> หมายถึง <meaning>"."""
    out: list[Line] = []
    cur = None                     # [term, keyword, meaning, page]
    def_x = None

    def flush():
        nonlocal cur
        if cur:
            out.append(Line(f"{cur[0]} {cur[1]} {cur[2]}".strip(), cur[3], def_x, brk=True))
        cur = None

    for l in body:
        raw = re.sub(r"ห\t+มายถึง", "หมายถึง", l.text.strip())
        m = None if l.table else RE_DEF.match(raw)
        if m and len(m.group("term")) <= 40 and (cur is None or abs(l.x - def_x) <= 3):
            flush()
            def_x = l.x
            cur = [clean(m.group("term")), m.group("k1") or m.group("k2"), clean(m.group("body")), l.page]
            continue
        if cur is not None and not l.table:
            if "\t" in raw and abs(l.x - def_x) <= 3:          # the term wraps in the left column
                left, _, right = raw.partition("\t")
                cur[0], cur[2] = thai_join(cur[0], clean(left)), thai_join(cur[2], clean(right))
                continue
            if l.x > def_x + 20:                                 # the meaning wraps in the right column
                cur[2] = thai_join(cur[2], clean(raw))
                continue
        if cur is not None:
            flush()
            def_x = None
            l = Line(l.text, l.page, l.x, l.size, l.font, l.bold, l.table, brk=True)
        out.append(l)
    flush()
    return out


def prepare(lines: list[Line]) -> list[Line]:
    return merge_definitions([l for l in lines if l.text.strip()])


def join_lines(lines: list[Line]) -> str:
    body = prepare(lines)
    return render(body, line_breaks(body))


def pages_of(lines: list[Line]) -> str:
    ps = sorted({l.page for l in lines})
    if not ps:
        return ""
    return str(ps[0]) if ps[0] == ps[-1] else f"{ps[0]}–{ps[-1]}"


def phrase_cut(text: str, start: int, max_chars: int) -> int:
    """Where to cut a paragraph that is too long by itself: before a connecting word
    (ทั้งนี้, ในกรณี, หาก, เว้นแต่ ...) late in the window, else at the last space, else hard."""
    lo, hi = start + int(max_chars * 0.55), start + max_chars
    window = text[lo:hi]
    hits = [m.start() for m in RE_PHRASE.finditer(window)]
    if hits:
        return lo + hits[-1]
    sp = window.rfind(" ")
    return lo + sp if sp >= 0 else hi


def plan_parts(text: str, bounds: list[int], max_chars: int = MAX_CHARS) -> list[tuple[int, int]]:
    """Cut a clause's text into parts. `bounds` are the offsets where a paragraph, item or
    definition starts (never inside a table). A part ends at such a boundary once it is
    reasonably full; a paragraph that alone is far too long is cut at a phrase boundary."""
    n = len(text)
    if n <= max_chars * 1.15:              # slightly over is better than two half-clauses
        return [(0, n)]
    target = n / -(-n // max_chars)
    edges = [0] + [b for b in bounds if 0 < b < n] + [n]
    parts, cur = [], 0
    for s, e in zip(edges, edges[1:]):
        size = s - cur
        if size > 0 and (size >= target * 0.6 or e - cur > max_chars * 1.3):
            parts.append((cur, s))
            cur = s
        while e - cur > max_chars * 1.3:
            c = phrase_cut(text, cur, max_chars)
            parts.append((cur, c))
            cur = c
    parts.append((cur, n))
    if len(parts) > 1 and parts[-1][1] - parts[-1][0] < MIN_TAIL and parts[-1][1] - parts[-2][0] <= max_chars * 1.3:
        last = parts.pop()
        parts[-1] = (parts[-1][0], last[1])
    return parts


def chunks(clauses: list[Clause], prefix: str, doc_key: str, max_chars: int = MAX_CHARS) -> dict:
    """Clauses -> the DATA.clauses shape used by the app."""
    out = {}
    for c in clauses:
        body = prepare(c.lines)
        breaks = line_breaks(body)
        text, starts = render_map(body, breaks)
        bounds = [starts[i] for i in range(1, len(body)) if breaks[i] and not body[i].table]
        parts = plan_parts(text, bounds, max_chars)
        ends = [starts[i] + len(clean(body[i].text)) for i in range(len(body))]
        for k, (a, b) in enumerate(parts, 1):
            many = len(parts) > 1
            cid = f"{prefix}_{c.key}" + (f"_p{k}" if many else "")
            rows = [body[i] for i in range(len(body)) if starts[i] < b and ends[i] > a]
            out[cid] = {
                "doc": doc_key,
                "ref": c.ref + (f" (ส่วนที่ {k}/{len(parts)})" if many else ""),
                "page": pages_of(rows),
                "text": text[a:b].strip(),
                "hl": [], "plain": None, "ex": None,
                "sec": c.sec,
            }
    return out
