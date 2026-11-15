// Reads the answer-feedback log written by server.mjs (POST /api/feedback) and summarises it.
//   node ingest/feedback_report.mjs              -> ingest/out/feedback.md (+ short summary on stdout)
//   node ingest/feedback_report.mjs --to-eval    also drafts test cases from thumbs-down into ingest/eval/candidates.json
//   node ingest/feedback_report.mjs --log <path> read another log (default feedback/feedback.jsonl)
// The log is append-only: each line is a snapshot of one rating; the last line per fb_id wins, and rating null means withdrawn.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const logArg = args.indexOf('--log');
const LOG = logArg >= 0 ? args[logArg + 1] : new URL('../feedback/feedback.jsonl', import.meta.url);
const OUT = new URL('out/feedback.md', import.meta.url);
const CAND = new URL('eval/candidates.json', import.meta.url);
const REASON = { wrong_fact: 'ข้อมูลผิด', off_topic: 'ไม่ตอบสิ่งที่ถาม', bad_cite: 'อ้างข้อในกรมธรรม์ไม่ตรง', incomplete: 'ตอบไม่ครบ', unclear: 'เข้าใจยากหรือยาวเกินไป', other: 'อื่น ๆ' };
const KIND = { llm: 'AI', preset: 'คำตอบตั้งต้น', oos: 'นอกขอบเขต' };

const js = new URL('../public/js/', import.meta.url);
const D = new Function(readFileSync(new URL('data.js', js), 'utf8') + ';return DATA')();
const planName = id => (D.plans.find(p => p.id === id) || { name: id }).name;
const covName = id => (D.coverages.find(c => c.id === id) || { name: id }).name;
const evtName = id => ((D.events || []).find(e => e.id === id) || (D.factors || []).find(f => f.id === id) || { name: id }).name;
const LOG_NAME = logArg >= 0 ? LOG : 'feedback/feedback.jsonl';
if (!existsSync(LOG)) { console.log('ยังไม่มี feedback (ไม่พบ ' + LOG_NAME + ')'); process.exit(0); }


let bad = 0;
const last = new Map();
readFileSync(LOG, 'utf8').split('\n').forEach(line => {
  if (!line.trim()) return;
  try { const r = JSON.parse(line); if (r.fb_id) last.set(r.fb_id, r); } catch { bad++; }
});
const rows = [...last.values()].filter(r => r.rating);
const up = rows.filter(r => r.rating === 'up'), down = rows.filter(r => r.rating === 'down');
const count = (xs, key) => { const m = new Map(); xs.forEach(x => key(x).forEach(k => m.set(k, (m.get(k) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1]); };
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
const md = s => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { s = md(s); return s.length > n ? s.slice(0, n) + '…' : s; };

const L = [];
L.push('# Feedback ของคำตอบ', '');
L.push(`สร้างจาก \`${LOG_NAME}\` · ${rows.length} คำตอบที่มีคะแนน · 👍 ${up.length} · 👎 ${down.length} (${pct(down.length, rows.length)} ของที่ให้คะแนน)` + (bad ? ` · ข้ามบรรทัดเสีย ${bad}` : ''), '');
L.push('## แยกตามชนิดคำตอบ', '', '| ชนิด | 👍 | 👎 | สัดส่วน 👎 |', '|---|---|---|---|');
Object.keys(KIND).forEach(k => { const u = up.filter(r => r.kind === k).length, d = down.filter(r => r.kind === k).length; if (u + d) L.push(`| ${KIND[k]} | ${u} | ${d} | ${pct(d, u + d)} |`); });
L.push('', '## เหตุผลของ 👎', '');
const reasons = count(down, r => r.reasons && r.reasons.length ? r.reasons : ['(ไม่ได้เลือก)']);
L.push(reasons.length ? reasons.map(([k, n]) => `- ${REASON[k] || k}: ${n}`).join('\n') : '- ยังไม่มี');
L.push('', '## แผนและเรื่องที่โดน 👎 บ่อย', '', 'นับจากผลของตัวแยกคำถาม (route) ตอนให้คะแนน', '');
const byPlan = count(down, r => (r.route && r.route.plans && r.route.plans.length ? r.route.plans : ['(ไม่ระบุแผน)']).map(p => p.startsWith('(') ? p : planName(p)));
const byCov = count(down, r => [...(r.route && r.route.covs || []).map(covName), ...(r.route && r.route.topics || []), ...(r.route && r.route.events || []).map(evtName), ...(r.route && r.route.factors || []).map(evtName)]);
L.push('- แผน: ' + (byPlan.map(([k, n]) => `${k} ${n}`).join(' · ') || '–'));
L.push('- เรื่อง/เหตุการณ์: ' + (byCov.map(([k, n]) => `${k} ${n}`).join(' · ') || '–'));
L.push('', '## รายการ 👎 (ใหม่สุดก่อน)', '');
down.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).forEach(r => {
  L.push(`### ${clip(r.question, 90)}`, '');
  L.push(`- เวลา ${String(r.ts || '').slice(0, 16).replace('T', ' ')} · ${KIND[r.kind] || r.kind} · ข้อมูลรุ่น ${r.data_built || '?'} · fb_id \`${r.fb_id}\``);
  L.push(`- เหตุผล: ${(r.reasons || []).map(k => REASON[k] || k).join(', ') || '(ไม่ได้เลือก)'}`);
  if (r.comment) L.push(`- ความเห็น: ${md(r.comment)}`);
  if (r.route) L.push(`- route: แผน [${(r.route.plans || []).join(', ')}] เรื่อง [${(r.route.covs || []).join(', ')}] flags [${(r.route.flags || []).join(', ')}] qtype [${(r.route.qtype || []).join(', ')}]`);
  if (r.cited && r.cited.length) L.push(`- ข้อที่อ้าง: ${r.cited.join(', ')}`);
  L.push(`- คำตอบ: ${clip(r.answer, 400)}`, '');
});
if (!down.length) L.push('ยังไม่มี');
mkdirSync(new URL('out/', import.meta.url), { recursive: true });
writeFileSync(OUT, L.join('\n') + '\n');
console.log(`feedback: ${rows.length} คำตอบ · 👍 ${up.length} · 👎 ${down.length} → ingest/out/feedback.md`);

// draft E1 cases from thumbs-down: the router's output at the time is the starting point; a person decides what is right
if (args.includes('--to-eval')) {
  const known = new Set(JSON.parse(readFileSync(new URL('eval/questions.json', import.meta.url), 'utf8')).questions.map(q => q.q.trim()));
  let prev = { _doc: [], candidates: [] };
  if (existsSync(CAND)) prev = JSON.parse(readFileSync(CAND, 'utf8'));
  const have = new Set(prev.candidates.map(c => c.from_feedback));
  const fresh = down.filter(r => r.question && !known.has(r.question.trim()) && !have.has(r.fb_id)).map(r => ({
    id: 'fb-' + r.fb_id.slice(-6), tag: 'feedback', from_feedback: r.fb_id, q: r.question,
    plans: r.route ? r.route.plans : undefined, covs: r.route && r.route.covs.length ? r.route.covs : undefined,
    _why: [(r.reasons || []).map(k => REASON[k] || k).join(', '), r.comment].filter(Boolean).join(' — '),
    _todo: 'ตรวจ plans/covs ให้ถูกตามที่ควรเป็น เพิ่ม clauses/flags/qtype ถ้าต้องการ แล้วย้ายไป questions.json (ลบ from_feedback และฟิลด์ที่ขึ้นต้นด้วย _)'
  }));
  prev._doc = ['ร่างข้อสอบ E1 จาก 👎 (node ingest/feedback_report.mjs --to-eval) ค่า plans/covs คือผลของ router ตอนนั้น ซึ่งอาจผิด ต้องแก้ด้วยมือก่อนย้ายเข้า questions.json'];
  prev.candidates.push(...fresh);
  writeFileSync(CAND, JSON.stringify(prev, null, 2) + '\n');
  console.log(`ร่างข้อสอบใหม่ ${fresh.length} ข้อ (รวม ${prev.candidates.length}) → ingest/eval/candidates.json`);
}
