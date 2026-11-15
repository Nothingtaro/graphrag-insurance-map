# ingest: policy PDFs → `public/js/data.js`

The data pipeline behind the app. It turns the policy wordings in [`doc/`](../doc) into the knowledge graph and clause index that the web app loads.

| Phase | What it does |
|---|---|
| **1. Extract** | Read the PDFs, repair corrupted Thai text, recover tables, and measure quality |
| **2. Build** | Split pages into sections, clauses and chunks, attach the hand-reviewed coverage graph, and write `public/js/data.js` |

## Usage

Use Python 3.11+ in a fresh virtual environment. The versions in `requirements.txt` are pinned on purpose:
PyMuPDF 2.x extracts some Thai lines differently, and `build_data.py` then refuses to build because quoted phrases no longer match.

```bash
pip install -r ingest/requirements.txt       # pymupdf, pythainlp (pinned)
python -I ingest/extract.py                  # phase 1: every document in sources.json (or --only ev-t1-2568)
python -I ingest/quality.py                  # quality report → ingest/out/quality.md
python -I ingest/build_data.py               # phase 2: → public/js/data.js + ingest/out/structure.md (--check = validate only)
                                             #   also runs check_bm25.mjs --verify (requires node)
node ingest/check_bm25.mjs                   # what full-text search (the app's own BM25) finds for the example questions
python -I -m unittest discover -s ingest/tests -v
```

Everything under `ingest/out/` is generated and is not committed.

## Files

| File | Purpose |
|---|---|
| `sources.json` | Document registry: id, in-app key (`T1`, `EV1`, …), clause-id prefix, file name, product, type |
| `thai_fix.py` | Glyph-level Thai text repair (no I/O, unit-testable) |
| `extract.py` | PDF → per-page text + tables + layout data |
| `quality.py` | Before/after repair metrics and a manual review list |
| `tests/` | Unit tests built from real samples in the files |
| `structure.py` | Phase 2: page text → sections → clauses → chunks (no I/O, unit-testable) |
| `graph.py` | Phase 2: the hand-reviewed graph layer: plans, coverages, grants, conditions/exclusions, clause descriptions, example questions |
| `graph_ext.py` | Phase B nodes: events, factors, definitions, deadlines, recovery, and Compulsory Motor Insurance as a plan (`interp` = needs confirmation) |
| `interp_review.py` | Review status of each interpretive reading |
| `vehicles.py` | Car brands/models sold in Thailand + powertrain (BEV/PHEV/EREV/HEV/ICE/ambiguous), so `route.js` can choose EV or standard wordings. `python -I -X utf8 ingest/vehicles.py` runs a self-check |
| `build_data.py` | Phase 2: merges both layers, validates every reference, and writes `public/js/data.js` |
| `eval/questions.json`, `eval_route.mjs` | E1 eval set: runs the app's `route.js` + BM25 on test questions and writes `out/eval.md` |
| `check_bm25.mjs` | Runs the BM25 from `public/js/app.js` on the example questions, to check the "text search only" comparisons |
| `gap_report.mjs` | Lists policy clauses that no graph node cites yet |
| `feedback_report.mjs` | Summarises answer feedback and drafts eval cases from 👎 |

### Outputs (`out/`, generated)

| File | Contents |
|---|---|
| `out/pages/<id>.json` | Machine-readable: `pages[].text`, `pages[].tables[].rows`, `pages[].lines[]` (x, y, font, bold) |
| `out/pages/<id>.md` | Human-readable, to compare against the PDF |
| `out/quality.md` | Quality table, review list, and counts of each repair type |
| `out/structure.md` | Section/clause split per document, to compare against the PDF |

## Phase 1: problems found in the source files, and the fixes

**2025 edition (made in InDesign with the DB Thai font):** tone marks and upper/lower vowels are drawn twice at the same position, with glyphs that have no Unicode mapping or a wrong one (`� Æ Ç Ã Ä Ê Ë`, `³` after sara am, zero-width `n`/`h`) layered on top.
Raw text therefore comes out as `ภายใต้้การคุ้้�มครอง เงื่่Æอนไข`. Checking every case showed that the stray glyphs are always **added** on top of a real tone mark and never replace a missing character, so they can be removed without losing information.

**2020 edition (made in Word):** sara am is stored as "zero-width space + า" (`ท า`, `ต ่า`). It is fixed by looking at glyph widths, so real spaces are not affected.

**Tables:** PyMuPDF's table text extraction orders characters along the x axis, which detaches tone marks (`สญหาย ุ`).
So `find_tables()` is used only to find cell boundaries, and the cell text is extracted in stream order instead.
Cells holding a multi-column list without separating lines (the customer service centre directory) are kept as tab-separated rows.

**Other:** headers, footers and page numbers repeated on every page are removed (kept in `pages[].dropped`),
and lines on the same baseline are merged into one tab-separated row (e.g. `“บริษัท”	หมายถึง	...`).

### Results

See `out/quality.md` for the latest figures. At the time of writing:

- Dictionary coverage, 2025 edition: **~76% → ~99.6%**
- Dictionary coverage, 2020 edition: **~98.3% → ~99.9%**
- Stray glyphs and malformed vowel/tone clusters: **0** in every file
- **21 tables** recovered (premium refund rates, EV battery compensation, service centre directory)

### Known limitations

- Typos in the source are not auto-corrected but listed for review in `quality.md` (currently one: `ผูเอาประกันภัย`, Type 5, page 12). Doubled vowels in the source (`ซึี่ง`) are fixed automatically and counted in the report.
- Some phone numbers in the service centre directory carry a range suffix (`0 2910 0710 9` probably means 0710-9); the source stores this as a space.
- Tables without ruling lines (e.g. the no-claim discount steps) remain tab-separated text lines; phase 2 converts them into structure.

## Phase 2: sections, clauses and the graph

**Structure (`structure.py`):** section and endorsement headings are detected from the font (DB Sathorn ≥ 14 pt in the 2025 edition, bold in the 2020 edition).
Multi-line headings are merged, and endorsement codes become ids (`ร.ย.ภ.10` → `rp10`, `ร.ย.ฟ.01` → `ryf01`).
A clause (`ข้อ N.`) or sub-clause (`N.M`) only counts as a heading if its number follows the previous one,
so a line such as `ข้อ 3.1.5 มาใช้บังคับโดยอนุโลม` (a cross-reference that happens to start a new line) is not split off as a new clause.
Lines that look like headings but skip the numbering are reported in `out/structure.md` for review (currently 0).
Tables are inserted at their vertical position as `|`-separated rows, and the service centre directory pages at the back are dropped.

**Text joining:** Thai has no spaces between words, so wrapped lines are joined without a space. A new line is started only for
a new paragraph (a line indented further than the next), a list item (`(ก)`, `(1)`, `1.1.1`) indented past the clause's left margin, a table row, a definition, or after a bold clause title.
That way `(ข) และ (ค)` wrapping onto a new line at the left margin stays part of the same sentence.
Two-column definition tables (`term<tab>หมายถึง<tab>meaning`, where both the term and the meaning may wrap within their column)
are merged into one definition per line, including cases where phase 1 produced `ห<tab>มายถึง`.

**Chunks:** clauses longer than ~800 characters are split into parts (`_p1`, `_p2`, … cited as "part k/n"), cutting at the start of a paragraph, list item or definition,
and never separating a table from its heading. If a single paragraph is too long, it is cut at the space before a connective (ทั้งนี้, ในกรณี, หาก, เว้นแต่, …)
rather than mid-sentence.

**Graph (`graph.py`):** every relationship has been checked against the 2025 wording. Clauses are cited by clause id (`t1_s4_4`),
or `id@phrase` to point at the part containing that phrase (e.g. the battery table in `ev1_s4_2_2`). `build_data.py` refuses to write output if
any reference cannot be found, a highlight phrase is not in the text, an example question's path is not actually connected,
or a "not covered" cell has no stated reason. **If a new edition renumbers clauses or changes wording, you get a build error, not a wrong answer.**

Changes from the 2020 graph: Section 2 exclusions moved from 7.x to 8.x and special conditions from clause 8 to clause 9;
Section 4's use exclusion moved to clause 10; the drunk-driving exclusion in ร.ย.ภ.10 became 10.3; Type 2 gained the third-party drunk-driving exclusion like the other plans;
and three EV plans were added (battery paid by age: 100%, minus 10% a year down to 50%; the wall charger is excluded but the portable charging cable is included).

### What the graph contains

- **Coverage:** 8 topics × 11 plans (`grants`). Each cell has its conditions, exclusions, deductibles and **entitlements** (`kind: "ben"`),
  for example a 500,000 THB/person minimum, loss of use of 500/700/1,000 THB/day, the insurer defending the case, advance payment when the car's software fails,
  full sum insured for a total loss (≥ 70%), towing capped at 20%, a 30-day choice to take back or give up a recovered stolen car, and per-clause ร.ย.01–03 benefits.
- **General policy terms** (`topics` × `terms`): 10 topics not tied to any one coverage: premium payment, claim notice,
  wrongful claim denial (15% interest), arbitration, no-claim discount, claims-history surcharge, vehicle transfer/sale, cancellation and refund,
  fraud, and general exclusions. Each plan has its own summary; Type 4 (2020) lacks some topics and words others differently.
- **Example questions**, each with a `bm25` expectation of what full-text search should find (as described in `textOnly`). `build_data.py` checks these on every build.

**Type 4 Protection** (`T4SG`, plan `p4sg`): clauses 0–16 are word-for-word identical to Type 4 (checked chunk by chunk), plus clause 17 (no-claim discount)
and clause 18 (claims-history surcharge). `graph.py` builds the nodes of both documents from one template (`T4_DOCS`), and `graph_ext._mirror_t4()`
creates a T4SG twin for every node that cites Type 4. The build still validates every reference against the real T4SG text.

**Out-of-scope questions** (`graph_ext.OUT_OF_SCOPE` → `DATA.out_of_scope`): other insurance types, premium prices, and choosing an insurer or garage.
If the whole question is out of scope, the app replies with a standard message without calling Claude. If only part is, Claude answers the motor insurance part and says the rest is not in the data.

```bash
node ingest/gap_report.mjs           # clauses no node cites yet → ingest/out/gap_report.md (run on every build)
node ingest/gap_report.mjs --doc T1  # gaps for one document
```

### Known limitations

- Type 4 still uses the 2020 wording, because no 2025 edition is in `doc/`.
- Some very long paragraphs are still cut at a space between phrases rather than at a sentence start, and where a new paragraph is not indented, the text stays joined as one line.
- Flood under Type 1 is an interpretation (the cover is all-risks and has no flood exclusion). It is provisionally accepted in `interp_review.py` pending claims-team confirmation.
- The 3+ plan does not include the theft/fire section as listed in its policy schedule, which is not in the dataset yet.
- Summaries of new nodes (`desc`, `sum`) are written from the policy wording, and the build checks that they cite a clause containing that phrase, but the wording of each summary is not verified. They should be reviewed by the claims team.
