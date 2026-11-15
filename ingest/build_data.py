"""Phase 2: ingest/out/pages/*.json + ingest/graph.py -> public/js/data.js

    python -I ingest/build_data.py            # writes public/js/data.js and ingest/out/structure.md
    python -I ingest/build_data.py --check    # validate only, write nothing

Every clause reference, highlight phrase and question path in graph.py is checked against the
parsed text. Any failure stops the build with a list of what to fix.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import graph  # noqa: E402
from structure import chunks, parse  # noqa: E402

ROOT = HERE.parent
PAGES = HERE / "out" / "pages"
OUT_JS = ROOT / "public" / "js" / "data.js"
OUT_REPORT = HERE / "out" / "structure.md"


# app.js truncates clause text sent to Claude at this length (CLAUSE_CHAR_LIMIT there); keep the two equal
CLAUSE_CHAR_LIMIT = 1000

KINDS = ("cond", "ded", "excl", "exc", "why", "note", "ben")   # must match KIND in public/js/app.js


class BuildError(Exception):
    pass


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


def load_corpus(sources: dict) -> tuple[dict, dict, list]:
    docs, clauses, report = {}, {}, []
    for meta in sources["documents"]:
        path = PAGES / f"{meta['id']}.json"
        if not path.exists():
            raise BuildError(f"ไม่พบ {path.relative_to(ROOT)} ให้รัน python -I ingest/extract.py ก่อน")
        page_doc = json.loads(path.read_text(encoding="utf-8"))
        sections, parsed, rejected = parse(page_doc, meta["title"])
        part = chunks(parsed, meta["prefix"], meta["key"])
        clash = set(part) & set(clauses)
        if clash:
            raise BuildError(f"clause id ซ้ำ: {sorted(clash)[:5]}")
        clauses.update(part)
        docs[meta["key"]] = {
            "title": meta["title"], "file": meta["file"], "pages": page_doc["pages_count"],
            "effective": page_doc.get("effective") or "", "edition": page_doc.get("edition") or "",
            "product": meta["product"],
        }
        report.append({"meta": meta, "sections": sections, "clauses": parsed, "chunks": part, "rejected": rejected})
    return docs, clauses, report


class Resolver:
    """Turns graph.py references into chunk ids."""

    def __init__(self, clauses: dict):
        self.clauses = clauses
        self.errors: list[str] = []

    def parts(self, base: str) -> list[str]:
        if base in self.clauses:
            return [base]
        out, k = [], 1
        while f"{base}_p{k}" in self.clauses:
            out.append(f"{base}_p{k}")
            k += 1
        return out

    def find(self, base: str, phrase: str) -> list[str]:
        p = squash(phrase)
        return [k for k in self.parts(base) if p in squash(self.clauses[k]["text"])]

    def ref(self, ref: str, where: str) -> str | None:
        base, _, phrase = ref.partition("@")
        parts = self.parts(base)
        if not parts:
            self.errors.append(f"{where}: ไม่มีข้อ {base}")
            return None
        if not phrase:
            return parts[0]
        hit = self.find(base, phrase)
        if not hit:
            self.errors.append(f"{where}: ไม่พบ \"{phrase[:40]}\" ใน {base}")
            return None
        return hit[0]


def apply_annotations(clauses: dict, res: Resolver) -> None:
    for base, ann in graph.annotations().items():
        parts = res.parts(base)
        if not parts:
            res.errors.append(f"annotation: ไม่มีข้อ {base}")
            continue
        for ph in ann.get("hl", []):
            hit = res.find(base, ph)
            if not hit:
                res.errors.append(f"annotation {base}: ไม่พบคำที่ไฮไลต์ \"{ph[:40]}\"")
            for k in hit:
                if ph not in clauses[k]["hl"]:
                    clauses[k]["hl"].append(ph)
        hl = ann.get("hl") or []
        home = (res.find(base, hl[0]) or parts)[0] if hl else parts[0]
        clauses[home]["plain"] = ann.get("plain")
        clauses[home]["ex"] = hl[0] if hl else None


def build_graph(clauses: dict, docs: dict) -> dict:
    res = Resolver(clauses)
    apply_annotations(clauses, res)
    plans, covs = graph.PLANS, graph.COVERAGES
    plan_ids, cov_ids = {p["id"] for p in plans}, {c["id"] for c in covs}
    for p in plans:
        if p["doc"] not in docs:
            res.errors.append(f"plan {p['id']}: ไม่มีเอกสาร {p['doc']}")

    details = graph.details()
    for did, d in details.items():
        if d["kind"] not in KINDS:
            res.errors.append(f"detail {did}: ชนิด {d['kind']} ใช้ไม่ได้ (ใช้ได้: {', '.join(KINDS)})")
        d["clauses"] = list(dict.fromkeys(k for k in (res.ref(r, f"detail {did}") for r in d["clauses"]) if k))
        if d.get("exceptionOf") and d["exceptionOf"] not in details:
            res.errors.append(f"detail {did}: exceptionOf {d['exceptionOf']} ไม่มีอยู่")

    grants = graph.grants()
    used_details = set()
    for p in plans:
        g = grants.get(p["id"])
        if g is None:
            res.errors.append(f"grants: ไม่มีแผน {p['id']}")
            continue
        missing = cov_ids - set(g)
        if missing:
            res.errors.append(f"grants {p['id']}: ไม่มีความคุ้มครอง {sorted(missing)}")
        for cid, x in g.items():
            where = f"grant {p['id']}/{cid}"
            if x["s"] not in ("C", "K", "N"):
                res.errors.append(f"{where}: สถานะ {x['s']} ใช้ไม่ได้")
            x["clauses"] = [k for k in (res.ref(r, where) for r in x["clauses"]) if k]
            for d in x["details"]:
                if d not in details:
                    res.errors.append(f"{where}: ไม่มี detail {d}")
                used_details.add(d)
            if x["s"] == "N" and not any(details.get(d, {}).get("kind") == "why" for d in x["details"]):
                res.errors.append(f"{where}: ไม่คุ้มครองแต่ไม่มีเหตุผล (detail ชนิด why)")
            if x["s"] != "N" and not x["clauses"] and not x["details"]:
                res.errors.append(f"{where}: ไม่มีข้อในกรมธรรม์รองรับ")
    unused = sorted(set(details) - used_details)
    if unused:
        res.errors.append(f"details ที่ไม่มี grant ใช้: {unused}")

    topics = graph.TOPICS
    topic_ids = {t["id"] for t in topics}
    terms = graph.terms()
    for pid, by_topic in terms.items():
        if pid not in plan_ids:
            res.errors.append(f"terms: ไม่มีแผน {pid}")
        for tid, x in by_topic.items():
            where = f"term {pid}/{tid}"
            if tid not in topic_ids:
                res.errors.append(f"{where}: ไม่มีเรื่อง {tid}")
            x["clauses"] = list(dict.fromkeys(k for k in (res.ref(r, where) for r in x["clauses"]) if k))
            if not x["clauses"]:
                res.errors.append(f"{where}: ไม่มีข้อในกรมธรรม์รองรับ")
    unused_topics = sorted(topic_ids - {tid for by in terms.values() for tid in by})
    if unused_topics:
        res.errors.append(f"เรื่องทั่วไปที่ไม่มีแผนใดใช้: {unused_topics}")

    questions = json.loads(json.dumps(graph.QUESTIONS))
    for q in questions:
        where = f"question {q['id']}"
        for p, c in q["grants"]:
            if p not in plan_ids or c not in cov_ids:
                res.errors.append(f"{where}: grant {p}/{c} ไม่มีอยู่")
        q["cite"] = [k for k in (res.ref(r, where) for r in q["cite"]) if k]
        new_paths = []
        for path in q["paths"]:
            p, c, *rest = path
            if p not in plan_ids or c not in cov_ids:
                res.errors.append(f"{where}: path เริ่มที่ {p}/{c} ไม่มีอยู่")
                continue
            g = grants[p][c]
            nodes = [p, c]
            for i, node in enumerate(rest):
                if node in details:
                    if node not in g["details"]:
                        res.errors.append(f"{where}: {node} ไม่ได้อยู่ใน {p}/{c}")
                    nodes.append(node)
                    continue
                k = res.ref(node, where)
                if not k:
                    continue
                prev = nodes[-1]
                ok = (prev in details and k in details[prev]["clauses"]) or (prev == c and k in g["clauses"])
                if not ok:
                    res.errors.append(f"{where}: {prev} ไม่ได้อ้าง {k}")
                nodes.append(k)
            new_paths.append(nodes)
        q["paths"] = new_paths
    if res.errors:
        raise BuildError("\n".join(res.errors))

    return {"plans": plans, "coverages": covs, "details": details, "grants": grants, "questions": questions,
            "topics": topics, "terms": terms}


def build_nodes(clauses: dict, g: dict) -> dict:
    """graph_ext.nodes(): events, factors, definitions, deadlines, recovery -> resolved clause ids.

    Synonyms are matched by route.js (lowercase, no spaces, longest first) per group, so they must be unique within
    events and within factors."""
    res, errs = Resolver(clauses), []
    out = graph.graph_ext.nodes(set(g["details"]))
    topic_ids, cov_ids = {t["id"] for t in g["topics"]}, {c["id"] for c in g["coverages"]}
    for group in ("events", "factors", "definitions", "deadlines", "recovery"):
        owner = {}   # synonyms unique within a group (an event and a factor may share one: both fire)
        for n in out[group]:
            where = f"{group} {n['id']}"
            n["clauses"] = list(dict.fromkeys(k for k in (res.ref(r, where) for r in n.pop("refs")) if k))
            if not n["clauses"]:
                errs.append(f"{where}: ไม่มีข้อในกรมธรรม์รองรับ")
            for s in n.get("syn", []):
                k = squash(s.lower())
                if len(k) < 2:
                    errs.append(f"{where}: คำพ้อง {s!r} สั้นเกินไป")
                elif owner.setdefault(k, n["id"]) != n["id"]:
                    errs.append(f"{where}: คำพ้อง {s!r} ซ้ำกับ {owner[k]}")
            n["syn"] = [squash(s.lower()) for s in n.get("syn", [])] if "syn" in n else n.get("syn")
            errs += [f"{where}: ไม่มีความคุ้มครอง {c}" for c in n.get("covs", []) if c not in cov_ids]
            errs += [f"{where}: ไม่มีเรื่อง {t}" for t in n.get("topics", []) if t not in topic_ids]
    errs += res.errors
    if errs:
        raise BuildError("\n".join(errs))
    return out


INTERP_SUFFIX = " (ตีความ ต้องยืนยันกับฝ่ายสินไหม)"


def apply_interp_review(g: dict, ext: dict) -> dict:
    """B19: every detail/node with `interp` gets `interp_status` from interp_review.REVIEW. Only "keep" details carry the
    "ต้องยืนยัน" wording in their description (route.js / app.js send needs_confirmation only for "keep" too).
    Returns counts per status for the build summary."""
    import interp_review as ir
    errs, seen, counts = [], set(), {}
    rows = [("detail", did, d) for did, d in g["details"].items()] + \
           [(grp, n["id"], n) for grp in ("events", "factors", "definitions") for n in ext[grp]]
    for grp, nid, n in rows:
        if not n.get("interp"):
            continue
        seen.add(nid)
        if nid not in ir.REVIEW:
            errs.append(f"{grp} {nid}: เป็นการตีความแต่ยังไม่มีการตัดสินใน ingest/interp_review.py")
            continue
        status, note = ir.REVIEW[nid]
        if status not in ir.STATUSES:
            errs.append(f"interp_review {nid}: สถานะ {status!r} ใช้ไม่ได้")
        if status == "rejected":
            errs.append(f"{grp} {nid}: ฝ่ายสินไหมไม่ยืนยัน ต้องแก้ node ก่อน build")
        n["interp_status"] = status
        if note:
            n["interp_note"] = note
        if grp == "detail" and status == "keep":
            n["desc"] += INTERP_SUFFIX
        counts[status] = counts.get(status, 0) + 1
    stale = sorted(set(ir.REVIEW) - seen)
    if stale:
        errs.append(f"interp_review: ไม่มี node ที่เป็นการตีความชื่อ {stale} แล้ว ให้ลบออก")
    if errs:
        raise BuildError("\n".join(errs))
    return counts


def build_oos(g: dict, ext: dict) -> list:
    """graph_ext.OUT_OF_SCOPE -> DATA.out_of_scope (B17). Synonyms are matched like event synonyms, so they are stored
    lowercase without spaces, must be unique, and must not equal an event, factor or topic synonym (both would fire)."""
    errs, owner, out = [], {}, []
    topic_ids = {t["id"] for t in g["topics"]}
    taken = {s: f"{grp} {n['id']}" for grp in ("events", "factors") for n in ext[grp] for s in n.get("syn") or []}
    taken.update({squash(s.lower()): f"topic {t['id']}" for t in g["topics"] for s in t.get("syn", [])})
    for o in graph.graph_ext.OUT_OF_SCOPE:
        where = f"out_of_scope {o['id']}"
        if o.get("kind") not in graph.graph_ext.OOS_KINDS:
            errs.append(f"{where}: ชนิด {o.get('kind')!r} ใช้ไม่ได้ (ใช้ได้: {', '.join(graph.graph_ext.OOS_KINDS)})")
        if not (o.get("reply") or "").strip():
            errs.append(f"{where}: ไม่มีคำตอบมาตรฐาน")
        errs += [f"{where}: ไม่มีเรื่อง {t}" for t in o.get("unless_topics", []) if t not in topic_ids]
        syn = []
        for s in o.get("syn", []):
            k = squash(s.lower())
            if len(k) < 4:
                errs.append(f"{where}: คำพ้อง {s!r} สั้นเกินไป")
            elif owner.setdefault(k, o["id"]) != o["id"]:
                errs.append(f"{where}: คำพ้อง {s!r} ซ้ำกับ {owner[k]}")
            elif k in taken:
                errs.append(f"{where}: คำพ้อง {s!r} ซ้ำกับ {taken[k]}")
            else:
                syn.append(k)
        if not syn:
            errs.append(f"{where}: ไม่มีคำพ้อง")
        out.append({"id": o["id"], "kind": o["kind"], "name": o["name"], "syn": syn, "reply": o["reply"],
                    "unless_topics": o.get("unless_topics", [])})
    if errs:
        raise BuildError("\n".join(errs))
    return out


POWERTRAINS = ("BEV", "PHEV", "EREV", "HEV", "ICE", "ambiguous")   # must match route.js
GENERIC_ALIASES = {"ev", "bev", "phev", "hev", "erev", "hybrid", "electric", "ไฟฟ้า", "รถไฟฟ้า", "รถยนต์ไฟฟ้า", "ไฮบริด", "รถ", "รถยนต์"}


def build_vehicles(clauses: dict) -> dict | None:
    """ingest/vehicles.py -> DATA.vehicles: brand/model aliases with powertrain, for the router in route.js.

    The matcher lowercases, removes whitespace and takes the longest alias first, so aliases are stored that way
    and must be unique across entries. The EV definition clause is resolved here so the router can cite it."""
    try:
        import vehicles
    except ModuleNotFoundError:
        print("เตือน: ไม่มี ingest/vehicles.py ระบบจะไม่รู้จักยี่ห้อ/รุ่นรถ")
        return None
    res, errs, owner, ids = Resolver(clauses), [], {}, set()
    brand_ids = {b["id"] for b in vehicles.BRANDS}
    out = {"brands": [], "models": []}
    for kind, rows in (("brands", vehicles.BRANDS), ("models", vehicles.MODELS)):
        for v in rows:
            vid = v.get("id", "")
            if not vid or vid in ids:
                errs.append(f"vehicles: id ว่างหรือซ้ำ: {vid!r}")
            ids.add(vid)
            if v.get("powertrain") not in POWERTRAINS:
                errs.append(f"vehicles {vid}: powertrain {v.get('powertrain')!r} ไม่อยู่ใน {POWERTRAINS}")
            if kind == "models" and v.get("brand") not in brand_ids:
                errs.append(f"vehicles {vid}: ไม่มียี่ห้อ {v.get('brand')!r} ใน BRANDS")
            aliases = []
            for a in v.get("alias", []):
                n = squash(a.lower())
                if len(n) < 3 or n in GENERIC_ALIASES or re.fullmatch(r"[\d\W_]+", n):
                    errs.append(f"vehicles {vid}: ชื่อเรียก {a!r} สั้นหรือกว้างเกินไป")
                elif owner.setdefault(n, vid) != vid:
                    errs.append(f"vehicles {vid}: ชื่อเรียก {a!r} ซ้ำกับ {owner[n]}")
                elif n not in aliases:
                    aliases.append(n)
            if not aliases:
                errs.append(f"vehicles {vid}: ไม่มีชื่อเรียกที่ใช้ได้")
            row = {"id": vid, "name": v.get("name", vid), "powertrain": v.get("powertrain"), "alias": aliases,
                   "source": v.get("source", "")}
            if kind == "models":
                row["brand"] = v["brand"]
            if v.get("variants"):
                row["variants"] = [{"name": x["name"], "powertrain": x["powertrain"]} for x in v["variants"]]
            if v.get("unverified"):
                row["unverified"] = True
            out[kind].append(row)
    out["definition"] = {p: res.ref(f"{p}_s1_2@{graph.EV_ONLY}", "vehicles: นิยามรถยนต์ไฟฟ้า") for p in ("ev1", "ev2", "ev3")}
    errs += res.errors
    if errs:
        raise BuildError("\n".join(errs))
    return out


def write_report(report: list, clauses: dict) -> None:
    lines = ["# โครงสร้างเอกสารหลังแยกหมวด/ข้อ (ระยะ 2)", "",
             f"สร้างโดย `ingest/build_data.py` · {len(clauses)} ช่วงข้อความ (chunk)", "",
             "| เอกสาร | หมวด/เอกสารแนบท้าย | ข้อ | chunk | ยาวสุด (ตัวอักษร) | บรรทัดที่ดูเหมือนหัวข้อแต่ไม่ใช่ |", "|---|---|---|---|---|---|"]
    for r in report:
        longest = max((len(c["text"]) for c in r["chunks"].values()), default=0)
        lines.append(f"| {r['meta']['key']} `{r['meta']['id']}` | {len(r['sections'])} | {len(r['clauses'])} | "
                     f"{len(r['chunks'])} | {longest} | {len(r['rejected'])} |")
    for r in report:
        lines += ["", f"## {r['meta']['key']} · {r['meta']['title']}", ""]
        for s in r["sections"]:
            keys = [c.key.split("_", 1)[1] for c in r["clauses"] if c.key.startswith(s.key + "_")]
            lines.append(f"- **{s.title}** (`{s.key}`): {' '.join(keys)}")
        for x in r["rejected"]:
            lines.append(f"- ตรวจ: หน้า {x['page']} `{x['text']}` ({x['why']})")
    OUT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate only")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sources = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    try:
        docs, clauses, report = load_corpus(sources)
        g = build_graph(clauses, docs)
        veh = build_vehicles(clauses)
        ext = build_nodes(clauses, g)
        oos = build_oos(g, ext)
        interp_counts = apply_interp_review(g, ext)
    except BuildError as e:
        print("build ไม่ผ่าน:\n" + str(e), file=sys.stderr)
        sys.exit(1)

    plan_docs = {p["doc"] for p in g["plans"]}
    editions = sorted({docs[k]["edition"] for k in plan_docs if docs[k]["edition"]})
    data = {
        "meta": {
            "built": date.today().isoformat(),
            "editions": editions,
            "summary": "เงื่อนไขกรมธรรม์ประกันภัยรถยนต์ของวิริยะประกันภัย ประเภท 1, 2, 3, 5 และรถยนต์ไฟฟ้าประเภท 1–3 ฉบับมีผลบังคับใช้ "
                       "1 มกราคม 2568 กับประเภท 4, ประเภท 4 ป้องกันภัย และ พ.ร.บ. ฉบับ 1 เมษายน 2563",
            "corpus_only": graph.CORPUS_ONLY,
        },
        "docs": docs, "plans": g["plans"], "coverages": g["coverages"], "clauses": clauses,
        "details": g["details"], "grants": g["grants"], "questions": g["questions"],
        "topics": g["topics"], "terms": g["terms"],
        **ext,
        "out_of_scope": oos,
    }
    print(f"node ระยะ B: {len(ext['events'])} เหตุการณ์ · {len(ext['factors'])} ปัจจัย · {len(ext['definitions'])} คำนิยาม · "
          f"{len(ext['deadlines'])} กำหนดเวลา/หน้าที่ · {len(ext['recovery'])} การไล่เบี้ย")
    print("การตีความ (B19): " + " · ".join(f"{k} {v}" for k, v in sorted(interp_counts.items())))
    if veh:
        data["vehicles"] = veh
        print(f"รถ: {len(veh['brands'])} ยี่ห้อ · {len(veh['models'])} รุ่น")
    n_plan_clauses = sum(1 for c in clauses.values() if c["doc"] in plan_docs)
    print(f"{len(docs)} เอกสาร · {len(clauses)} chunk ({n_plan_clauses} จากเอกสารของแผนในกราฟ) · "
          f"{len(g['plans'])} แผน · {len(g['details'])} detail · {len(g['questions'])} คำถามตัวอย่าง")
    too_long = sorted((k for k, c in clauses.items() if len(c["text"]) > CLAUSE_CHAR_LIMIT),
                      key=lambda k: -len(clauses[k]["text"]))
    if too_long:
        print(f"เตือน: {len(too_long)} chunk ยาวเกิน {CLAUSE_CHAR_LIMIT} ตัวอักษร ท้ายข้อความจะถูกตัดก่อนส่งให้ Claude "
              f"(เพิ่ม CLAUSE_CHAR_LIMIT ที่นี่และใน public/js/app.js หรือแยก chunk): "
              + ", ".join(f"{k} ({len(clauses[k]['text'])})" for k in too_long[:10]))
    if args.check:
        return
    header = ("// Built by ingest/build_data.py from ingest/out/pages/*.json (phase 1) and ingest/graph.py (hand-reviewed graph).\n"
              "// Do not edit by hand: change the rules in ingest/ and rebuild.\n")
    OUT_JS.write_text(header + "const DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8", newline="\n")
    write_report(report, clauses)
    print(f"เขียน {OUT_JS.relative_to(ROOT)} ({OUT_JS.stat().st_size // 1024} KB) และ {OUT_REPORT.relative_to(ROOT)}")
    # the "text search alone" notes depend on the app's BM25, which is JavaScript
    if shutil.which("node"):
        r = subprocess.run(["node", str(HERE / "check_bm25.mjs"), "--verify"], capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip() or r.stderr.strip())
        if r.returncode:
            sys.exit(1)
        # B12: which clauses no node cites yet (report only, never fails the build)
        r = subprocess.run(["node", str(HERE / "gap_report.mjs"), "--summary"], capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip() or r.stderr.strip())
    else:
        print("ข้ามการตรวจ textOnly และรายงานช่องว่าง: ไม่พบ node")


if __name__ == "__main__":
    main()
