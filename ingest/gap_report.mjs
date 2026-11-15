// B12 (PLAN.md): which policy clauses no graph node cites yet, per document.
//   node ingest/gap_report.mjs              full report -> ingest/out/gap_report.md, summary on stdout
//   node ingest/gap_report.mjs --summary    one summary line (build_data.py runs this after every build)
//   node ingest/gap_report.mjs --doc T1     also list that document's gaps on stdout
// A chunk counts as cited when any node points at it: a coverage cell (grant), a detail, a general term, an event,
// factor, definition, deadline or recovery node, a preset question, or the EV definition used by the car router.
// Annotations (highlight + plain meaning) are explanations, not nodes, so they do not count.
// "ส่วนต่อ" marks a chunk whose clause has another part that is cited (often the tail of a long clause);
// "หัวข้อ" marks a short chunk that is only a heading. Both usually need no node of their own.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const D = new Function(readFileSync(new URL('../public/js/data.js', import.meta.url), 'utf8') + ';return DATA')();
const args = process.argv.slice(2);
const docArg = args.includes('--doc') ? args[args.indexOf('--doc') + 1] : null;

const cited = new Map();   // chunk id -> set of node kinds that cite it
const cite = (ids, kind) => (ids || []).forEach(k => { if (!cited.has(k)) cited.set(k, new Set()); cited.get(k).add(kind); });
Object.values(D.grants).forEach(byCov => Object.values(byCov).forEach(g => cite(g.clauses, 'grant')));
Object.values(D.details).forEach(d => cite(d.clauses, 'detail'));
Object.values(D.terms || {}).forEach(byTopic => Object.values(byTopic).forEach(t => cite(t.clauses, 'term')));
['events', 'factors', 'definitions', 'deadlines', 'recovery'].forEach(g => (D[g] || []).forEach(n => cite(n.clauses, g)));
(D.questions || []).forEach(q => { cite(q.cite, 'question'); (q.paths || []).forEach(p => cite(p.filter(k => D.clauses[k]), 'question')); });
if (D.vehicles && D.vehicles.definition) cite(Object.values(D.vehicles.definition).filter(Boolean), 'vehicle');

const base = k => k.replace(/_p\d+$/, '');
const citedBase = new Set([...cited.keys()].map(base));
const HEADING = 60;   // characters: shorter chunks are headings such as "ข้อ 7. ข้อยกเว้น ..."

const docs = Object.keys(D.docs);
const rows = docs.map(doc => {
  const ks = Object.keys(D.clauses).filter(k => D.clauses[k].doc === doc);
  const gaps = ks.filter(k => !cited.has(k)).map(k => {
    const c = D.clauses[k], t = c.text.replace(/\s+/g, ' ').trim();
    const why = citedBase.has(base(k)) ? 'ส่วนต่อ' : t.length < HEADING ? 'หัวข้อ' : '';
    return { k, ref: c.ref, page: c.page, why, text: t.slice(0, 90) + (t.length > 90 ? '…' : '') };
  });
  const real = gaps.filter(x => !x.why).length;
  return { doc, title: D.docs[doc].title, n: ks.length, cited: ks.length - gaps.length, gaps, real };
});

const tot = rows.reduce((a, r) => ({ n: a.n + r.n, cited: a.cited + r.cited, real: a.real + r.real }), { n: 0, cited: 0, real: 0 });
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
const lines = [`# ข้อในกรมธรรม์ที่ยังไม่มี node อ้างถึง (${D.meta.built})`, '',
  'สร้างโดย `node ingest/gap_report.mjs` (build_data.py รันให้ทุกครั้ง) นับระดับ chunk',
  '"ส่วนต่อ" = ข้อเดียวกันมีส่วนอื่นที่มี node แล้ว · "หัวข้อ" = chunk สั้นที่เป็นแค่หัวข้อ · ช่องว่างจริง = ไม่ใช่ทั้งสองแบบ', '',
  `รวม ${tot.cited}/${tot.n} chunk มี node อ้าง (${pct(tot.cited, tot.n)}) · ช่องว่างจริง ${tot.real}`, '',
  '| เอกสาร | chunk | มี node อ้าง | ไม่มี | ช่องว่างจริง |', '|---|---|---|---|---|',
  ...rows.map(r => `| ${r.doc} ${r.title} | ${r.n} | ${r.cited} (${pct(r.cited, r.n)}) | ${r.gaps.length} | ${r.real} |`)];
rows.filter(r => r.gaps.length).forEach(r => {
  lines.push('', `## ${r.doc} · ${r.title}`, '', '| chunk | ข้อ | หน้า | หมายเหตุ | ข้อความ |', '|---|---|---|---|---|');
  r.gaps.forEach(x => lines.push(`| \`${x.k}\` | ${x.ref} | ${x.page ?? ''} | ${x.why} | ${x.text.replace(/\|/g, '/')} |`));
});
mkdirSync(new URL('out/', import.meta.url), { recursive: true });
writeFileSync(new URL('out/gap_report.md', import.meta.url), lines.join('\n') + '\n');

const short = rows.map(r => `${r.doc} ${r.real}`).join(' · ');
if (args.includes('--summary')) {
  console.log(`ช่องว่าง (ข้อที่ยังไม่มี node อ้าง ไม่นับส่วนต่อ/หัวข้อ): ${short} · รวม ${tot.real} · รายงาน ingest/out/gap_report.md`);
} else {
  rows.forEach(r => console.log(`${r.doc.padEnd(5)} ${String(r.cited).padStart(3)}/${String(r.n).padEnd(3)} มี node อ้าง · ไม่มี ${r.gaps.length} (ช่องว่างจริง ${r.real})`));
  console.log(`\nรวม ${tot.cited}/${tot.n} (${pct(tot.cited, tot.n)}) · ช่องว่างจริง ${tot.real} · รายงาน ingest/out/gap_report.md`);
}
if (docArg) {
  const r = rows.find(x => x.doc === docArg);
  if (!r) { console.error('ไม่มีเอกสาร ' + docArg + ' ใช้ได้: ' + docs.join(', ')); process.exit(2); }
  r.gaps.forEach(x => console.log(`  ${x.k.padEnd(16)} ${x.why.padEnd(7)} ${x.ref}  ${x.text}`));
}
