# หน้าตรวจการตีความ (B19)

หน้าเว็บให้ฝ่ายสินไหมตรวจจุดที่ระบบตอบจากการตีความ: https://claude.ai/artifact/TviCLLCWwj7YvAFAwQqA3C
(ส่วนตัว: เจ้าของต้องกด Share ให้ฝ่ายสินไหมเป็น Contributor ก่อน จึงบันทึกคำตอบได้)

- `page.tpl.html` ตัวหน้า `gen.mjs` ใส่รายการจาก `public/js/data.js` (ทุก node/detail ที่มี `interp`) พร้อมถ้อยคำในเล่ม
- สร้างใหม่หลัง build: `node research/b19_review/gen.mjs public/js/data.js research/b19_review/page.tpl.html <out.html>` แล้ว publish ไป URL เดิม
- คำตอบเก็บใน db ของหน้า: `reviews/<user id>` = `{answers: {<node id>: {v: ok|wrong|unsure, fix, at}}}` ทุกคนอ่านได้ แก้ได้เฉพาะของตัวเอง
- เมื่อได้คำตอบแล้ว ปรับ `ingest/interp_review.py` (ok → confirmed, wrong → แก้ node แล้ว confirmed) แล้ว build ใหม่
