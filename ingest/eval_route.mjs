// E1 (PLAN.md): runs the page's own router (public/js/route.js) and BM25 (sliced out of public/js/app.js,
// as check_bm25.mjs does) on ingest/eval/questions.json and reports what passes.
//   node ingest/eval_route.mjs               table + summary, writes ingest/out/eval.md
//   node ingest/eval_route.mjs --fail        list only the failing questions
//   node ingest/eval_route.mjs --strict      exit 1 if a question without `target` fails (regression guard)
// `clauses` passes when one of them is in what retrieve() sends: BM25 top 5 + clauses of matched events/factors and their details.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const js = new URL('../public/js/', import.meta.url);
const D = new Function(readFileSync(new URL('data.js', js), 'utf8') + ';return DATA')();
const R = new Function(readFileSync(new URL('route.js', js), 'utf8') + ';return makeRouter')()(D);
const app = readFileSync(new URL('app.js', js), 'utf8');
const s = app.indexOf('const SEG'), e = app.indexOf('function markHits');
if (s < 0 || e < 0) throw new Error('BM25 code not found in app.js');
const bm25 = new Function('D', app.slice(s, e) + ';return bm25;')(D);
const Q = JSON.parse(readFileSync(new URL('eval/questions.json', import.meta.url), 'utf8')).questions;

const same = (hit, id) => hit === id || hit.startsWith(id + '_p');
const known = id => Object.keys(D.clauses).some(k => same(k, id));
const bad = Q.flatMap(q => (q.clauses || []).filter(id => !known(id)).map(id => `${q.id}: ไม่มี clause ${id}`));
if (bad.length) { console.error(bad.join('\n')); process.exit(2); }

const args = process.argv.slice(2);
const rows = Q.map(q => {
  const r = R.route(q.q), flags = r.flags || [];
  // as retrieve() in app.js: named plans -> search only their documents
  const pd = r.plans.map(id => D.plans.find(p => p.id === id)).filter(Boolean).map(p => p.doc);
  const docs = pd.length ? [...new Set(pd)] : null;
  const hits = bm25(q.q, { docs, top: 5 }).hits.map(h => h.k);
  // what retrieve() also sends: clauses of matched events/factors and their related details (in the named plans' documents)
  const inDocs = k => !docs || docs.includes(D.clauses[k].doc);
  const nodes = [...(r.events || []).map(id => D.events.find(x => x.id === id)), ...(r.factors || []).map(id => D.factors.find(x => x.id === id))];
  const sent = [...new Set([...hits, ...nodes.flatMap(n => [...n.clauses, ...n.details.flatMap(d => (D.details[d] || { clauses: [] }).clauses)]).filter(inDocs)])];
  const fails = [];
  if (q.plans) { const a = [...r.plans].sort().join(','), b = [...q.plans].sort().join(','); if (a !== b) fails.push(`plans ได้ [${a}] ต้องการ [${b}]`); }
  (q.covs || []).forEach(c => { if (!r.covs.includes(c)) fails.push(`cov ${c} ไม่ถูกจับ (ได้ [${r.covs}])`); });
  (q.topics || []).forEach(t => { if (!r.topics.includes(t)) fails.push(`topic ${t} ไม่ถูกจับ (ได้ [${r.topics}])`); });
  (q.flags || []).forEach(f => { if (!flags.includes(f)) fails.push(`flag ${f} ไม่ขึ้น (ได้ [${flags}])`); });
  (q.noflags || []).forEach(f => { if (flags.includes(f)) fails.push(`flag ${f} ไม่ควรขึ้น`); });
  (q.qtype || []).forEach(t => { if (!(r.qtype || []).includes(t)) fails.push(`qtype ${t} ไม่ถูกจับ (ได้ [${r.qtype}])`); });
  if (q.oos) { const got = !r.oos ? 'none' : r.oos.partial ? 'partial' : 'full'; if (got !== q.oos) fails.push(`oos ได้ ${got} ต้องการ ${q.oos}`); }
  // offtopic: true only where the question says so; every other question must be recognised as being about insurance or cars
  if (!!r.offtopic !== !!q.offtopic) fails.push(q.offtopic ? 'ควรเป็นคำถามนอกเรื่อง (offtopic) แต่ไม่ใช่' : 'ถูกจับเป็นคำถามนอกเรื่อง (offtopic) กราฟจะไม่ทำงาน');
  if (q.clauses && !sent.some(h => q.clauses.some(id => same(h, id)))) fails.push(`ข้อที่ส่งให้ AI ไม่มี ${q.clauses.join('/')} (BM25 ได้ ${hits.join(', ') || '-'})`);
  return { q, r, flags, hits, fails };
});

const tags = [...new Set(Q.map(q => q.tag))];
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
const sum = tags.map(t => { const g = rows.filter(x => x.q.tag === t), ok = g.filter(x => !x.fails.length).length; return { t, ok, n: g.length }; });
const okAll = rows.filter(x => !x.fails.length).length;
const regress = rows.filter(x => x.fails.length && !x.q.target);

const lines = [`# ผลชุดทดสอบ E1 (${new Date().toISOString().slice(0, 10)})`, '', `ผ่าน ${okAll}/${rows.length} (${pct(okAll, rows.length)})`, '',
  '| กลุ่ม | ผ่าน |', '|---|---|', ...sum.map(x => `| ${x.t} | ${x.ok}/${x.n} (${pct(x.ok, x.n)}) |`), '',
  '| id | ผล | แผนที่จับได้ | flags | ปัญหา |', '|---|---|---|---|---|',
  ...rows.map(x => `| ${x.q.id} | ${x.fails.length ? 'ไม่ผ่าน' + (x.q.target ? ` (รอ ${x.q.target})` : '') : 'ผ่าน'} | ${x.r.plans.join(', ') || '-'} | ${x.flags.join(', ') || '-'} | ${x.fails.join('; ').replace(/\|/g, '/') || ''} |`)];
mkdirSync(new URL('out/', import.meta.url), { recursive: true });
writeFileSync(new URL('out/eval.md', import.meta.url), lines.join('\n') + '\n');

const show = args.includes('--fail') ? rows.filter(x => x.fails.length) : rows;
show.forEach(x => console.log(`${x.fails.length ? '✗' : '✓'} ${x.q.id.padEnd(7)} ${x.q.q}\n    plans [${x.r.plans}] covs [${x.r.covs}] topics [${x.r.topics}] flags [${x.flags}] qtype [${x.r.qtype || []}]${x.fails.length ? '\n    - ' + x.fails.join('\n    - ') : ''}`));
console.log('\n' + sum.map(x => `${x.t.padEnd(13)} ${x.ok}/${x.n}`).join('\n'));
console.log(`\nรวม ${okAll}/${rows.length} (${pct(okAll, rows.length)}) · ไม่ผ่านโดยไม่มี target (regression): ${regress.length} · รายงาน ingest/out/eval.md`);
if (args.includes('--strict') && regress.length) process.exit(1);
