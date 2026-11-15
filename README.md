# แผนที่ความรู้ความคุ้มครองประกันรถยนต์ (GraphRAG)

Port ของ Claude artifact (`claude.ai/artifact/25KjfFXeYpqBHDLXbTHnYi`) มาเป็นโปรเจกต์ที่รันบนเครื่องได้

## วิธีรัน

```bash
npm install
cp .env.example .env      # แล้วใส่ ANTHROPIC_API_KEY
npm start                 # เปิด http://localhost:5173
```

ถ้าไม่ใส่ key กราฟและปุ่มคำถามตัวอย่างยังใช้ได้ทั้งหมด (คำตอบตั้งไว้ล่วงหน้า ไม่ใช้ LLM) แต่ช่องพิมพ์ถาม AI จะตอบเป็น error

## โครงสร้าง

```
server.mjs                        Node server: เสิร์ฟ public/, proxy POST /api/messages ไป Claude API (streaming), รับ POST /api/feedback
public/index.html                 markup ของหน้า
public/css/style.css              สไตล์ของแอป
public/css/fonts.css + fonts/     IBM Plex Sans Thai, Sarabun (แยกออกจาก base64 ที่ฝังไว้เดิม)
public/vendor/cytoscape-3.35.0.min.js   Cytoscape.js (ไม่ได้แก้)
public/js/data.js                 const DATA = {...} กราฟ + ข้อในกรมธรรม์ (สร้างโดย ingest/build_data.py ห้ามแก้มือ)
public/js/app.js                  ตัวแอป: วาดกราฟ, BM25, retrieval, tools, แชท
public/js/route.js                ตัวแยกคำถาม: แผน ความคุ้มครอง เรื่องทั่วไป รุ่นรถ (EV หรือไม่) เหตุการณ์ ปัจจัย ชนิดคำถาม คำถามนอกขอบเขต (ไม่มี DOM ทดสอบนอกเบราว์เซอร์ได้)
public/js/claude-local.js         ตัวแทน window.claude.use('sample') ของ claude.ai
```

## สิ่งที่เปลี่ยนจาก artifact

- บน claude.ai ช่องแชทเรียก Claude ผ่าน `window.claude.use('sample')` ซึ่งมีเฉพาะใน artifact runtime
  ตอนนี้ `claude-local.js` ทำ interface เดียวกัน (`sample(messages, { signal, onText, tools })` → `{ text }`)
  โดยส่งแต่ละ turn ไปที่ `server.mjs` ซึ่งเรียก Claude API ด้วย `@anthropic-ai/sdk`
- tool loop (search_chunks, get_coverage, compare_plans ฯลฯ) ยังรันในหน้าเว็บเหมือนเดิม เพราะ tools ไปขยับกราฟบนจอ
- UI ปรับตามแนวทาง [Impeccable](https://impeccable.style/) ให้พร้อมนำเสนอ: หน้าแรกเป็นตารางความคุ้มครอง (แผน × เรื่อง)
  คลิกช่องเพื่อดูเงื่อนไขและข้อที่อ้างอิง, แผนที่ความรู้ (กราฟ) เปิดเองเมื่อถามคำถาม, โหนดความคุ้มครองใช้สีตามสถานะ,
  คำอธิบายสัญลักษณ์พับเก็บได้, รองรับมือถือ ส่วน logic การค้น ตัว tools และ prompt ยังเหมือน artifact
- ค่าเริ่มต้น: model `claude-sonnet-5-5`, effort `medium` (เปลี่ยนได้ใน `.env` ผ่าน `GRAPHRAG_MODEL`, `GRAPHRAG_EFFORT`) และเปิด server-side refusal fallback
  (`fallbacks: "default"`) ไว้ ถ้าโมเดลปฏิเสธ คำขอจะถูกรันซ้ำบนโมเดลสำรองในคำขอเดียวกัน

## แชท: ประวัติและ feedback

- **ประวัติแชท** เก็บในเบราว์เซอร์ (localStorage) ค้นหาได้ด้วย Ctrl+K เปิดแชทใหม่ด้วย Ctrl+Shift+O และปักหมุด เปลี่ยนชื่อ หรือลบได้จากเมนู ⋯ ของแต่ละแชท
  ในโหมดแชทเต็มจอ ประวัติเป็นแถบด้านซ้ายที่พับเหลือแถบไอคอนได้ บนจอเล็กเป็นแผ่นเลื่อนจากซ้าย
- **แก้คำถาม:** กดไอคอนดินสอใต้คำถามของเรา แล้วถามใหม่จากจุดนั้น คำตอบเดิมที่ตามมาจะถูกตัดออก
- **Feedback:** 👍/👎 ใต้ทุกคำตอบ กด 👎 แล้วเลือกเหตุผลและพิมพ์ความเห็นได้ (ไม่บังคับ)
  server เขียนต่อท้ายใน `feedback/feedback.jsonl` บรรทัดละหนึ่งครั้งที่กด (เปลี่ยนใจก็เป็นบรรทัดใหม่ fb_id เดิม)
  แต่ละบรรทัดเก็บคำถาม คำตอบ ข้อที่อ้าง ผลของตัวแยกคำถาม และรุ่นข้อมูล ไม่เก็บชื่อผู้กด
  ถ้าส่งไม่ได้ เบราว์เซอร์จะเก็บไว้แล้วส่งใหม่เอง
  ย้ายที่เก็บได้ด้วย `GRAPHRAG_FEEDBACK_LOG=/path/to/file.jsonl`

```bash
node ingest/feedback_report.mjs             # สรุป → ingest/out/feedback.md
node ingest/feedback_report.mjs --to-eval   # ร่างข้อสอบจาก 👎 → ingest/eval/candidates.json (ตรวจแล้วย้ายเข้า questions.json เอง)
```

## Pipeline นำเข้าข้อมูล (`ingest/`)

`build_data.py` ตัวเดิมไม่ได้อยู่ใน artifact จึงเขียนใหม่ใน [ingest/](ingest/README.md):
ระยะ 1 (เสร็จแล้ว) อ่าน PDF ใน `doc/` ซ่อมอักษรไทยที่เพี้ยน ดึงตาราง และวัดคุณภาพ
ระยะ 2 (เสร็จแล้ว) แยกหมวด/ข้อ ตัด chunk ผูกกราฟที่ตรวจด้วยมือ (`ingest/graph.py`) และเขียน `public/js/data.js`

```bash
pip install -r ingest/requirements.txt
python -I ingest/extract.py && python -I ingest/build_data.py
node ingest/eval_route.mjs          # ชุดทดสอบ E1 → ingest/out/eval.md (--strict ไว้กัน regression)
```

`ingest/out/` ไม่ได้อยู่ใน repo เพราะสร้างใหม่ได้จาก `doc/*.pdf` ด้วย `extract.py` (ต้องรันก่อน `build_data.py`)
ส่วน `public/js/data.js` อยู่ใน repo แล้ว จึงรันแอปได้เลยโดยไม่ต้องมี Python

ข้อมูลชุดปัจจุบัน: 10 เอกสาร 901 chunk, 11 แผน (ประเภท 1, 2+, 3+, 2, 3, 4, 4 ป้องกันภัย, EV ประเภท 1–3 และ พ.ร.บ.) × 8 เรื่องความคุ้มครอง,
213 node เงื่อนไข/ข้อยกเว้น/ส่วนแรก/สิทธิที่ได้รับ และเงื่อนไขทั่วไปของกรมธรรม์ 10 เรื่อง (ส่วนลดประวัติดี การยกเลิกและคืนเบี้ย
การโอนรถ การแจ้งเคลม ฯลฯ) เงื่อนไขฉบับ 1 มกราคม 2568 ยกเว้นประเภท 4 ที่ยังเป็นฉบับ 2563

ในแอป เงื่อนไขทั่วไปแสดงเป็นการ์ดใต้ตารางความคุ้มครอง ในหน้ารายละเอียดของแผน และในแผนที่ความรู้ (แผน → เรื่อง → ข้อในกรมธรรม์)
ส่วนแชทเรียกผ่านเครื่องมือ `get_policy_terms` หรือดึงให้เองเมื่อคำถามพูดถึงเรื่องเหล่านี้

## ข้อจำกัด

- ประเภท 4, ประเภท 4 ป้องกันภัย และ พ.ร.บ. ยังเป็นเงื่อนไขฉบับ 2563 (ไม่มีฉบับใหม่กว่าใน `doc/`)
- คำถามนอกขอบเขต (ประกันประเภทอื่น ราคาเบี้ย ให้เลือกบริษัท) ตอบด้วยข้อความมาตรฐาน ไม่มีข้อมูลเหล่านี้ในระบบ
- คำถามที่ไม่เกี่ยวกับประกันหรือรถเลย ไม่ขยับกราฟ ถ้าเป็นข้อความแรกของแชท ตอบด้วยข้อความมาตรฐาน
  ถ้าอยู่กลางบทสนทนา (อาจเป็น "อธิบายเพิ่มหน่อย") AI ตอบจากบทสนทนาก่อนหน้าโดยไม่ค้นใหม่
- วงเงินและค่าเสียหายส่วนแรกที่ "ระบุไว้ในตาราง" ของแต่ละกรมธรรม์ยังไม่มีในข้อมูล
- กราฟตรวจเทียบข้อความแล้ว จุดที่เป็นการตีความ 42 จุด (เช่น น้ำท่วมในประเภท 1) เจ้าของโปรเจกต์ยอมรับชั่วคราว 35 จุด ([ingest/interp_review.py](ingest/interp_review.py))
  แชทจึงตอบตรง ๆ ทั้งที่ฝ่ายสินไหมยังไม่ได้ยืนยัน ดูสถานะการตรวจที่ [research/b19_review/](research/b19_review/README.md)
