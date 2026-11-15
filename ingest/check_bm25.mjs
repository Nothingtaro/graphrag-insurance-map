// Runs the app's own BM25 (copied out of public/js/app.js at run time) on the preset question
// labels, so the `textOnly` notes in ingest/graph.py can be checked against the real corpus.
//   node ingest/check_bm25.mjs            top 3 per question, restricted to the plans' documents (as the app does)
//   node ingest/check_bm25.mjs --verify   check each question's `bm25` expectations; exit 1 on a mismatch
//   node ingest/check_bm25.mjs "query"    any query over the whole corpus
//
// Expectations (question.bm25 in graph.py), all against the top 3 hits the app shows:
//   top: [clause ids]   each must be among the first `within` hits (a split clause matches any part)
//   first: clause id    must be hit 1
//   none_contain: text  no hit's text may contain it
import { readFileSync } from 'node:fs';
const root = new URL('../public/js/', import.meta.url);
const D = new Function(readFileSync(new URL('data.js', root), 'utf8') + ';return DATA')();
const app = readFileSync(new URL('app.js', root), 'utf8');
const start = app.indexOf('const SEG'), end = app.indexOf('function markHits');
if (start < 0 || end < 0) throw new Error('BM25 code not found in app.js');
const bm25 = new Function('D', app.slice(start, end) + ';return bm25;')(D);

const show = (label, r) => {
  console.log(`\n${label}\n  terms: ${r.terms.join(', ')}`);
  r.hits.forEach((h, i) => console.log(`  ${i + 1}. ${h.k}  ${D.clauses[h.k].ref}  score ${h.score.toFixed(2)}  [${h.matched.join(' ')}]`));
  if (!r.hits.length) console.log('  (no hits)');
};
const asApp = q => bm25(q.label, { docs: [...new Set(q.grants.map(g => D.plans.find(p => p.id === g[0]).doc))], top: 3 });
const same = (hit, id) => hit === id || hit.startsWith(id + '_p');

function verify(q) {
  const e = q.bm25, hits = asApp(q).hits.map(h => h.k), bad = [];
  if (!e) return q.textOnly ? ['มี textOnly แต่ไม่มี bm25 expectation ให้ตรวจ'] : [];
  (e.top || []).forEach(id => { if (!hits.slice(0, e.within || 3).some(h => same(h, id))) bad.push(`${id} ไม่อยู่ใน ${e.within || 3} อันดับแรก`); });
  if (e.first && !(hits[0] && same(hits[0], e.first))) bad.push(`อันดับ 1 คือ ${hits[0] || '-'} ไม่ใช่ ${e.first}`);
  if (e.none_contain) hits.forEach(h => { if (D.clauses[h].text.includes(e.none_contain)) bad.push(`${h} มีคำว่า "${e.none_contain}"`); });
  return bad.map(b => `${b} (ได้: ${hits.join(', ') || 'ไม่มี'})`);
}

const arg = process.argv[2];
if (arg === '--verify') {
  let failed = 0;
  D.questions.forEach(q => {
    const bad = verify(q);
    if (bad.length) { failed++; console.log(`${q.id}: textOnly ไม่ตรงกับผลค้นจริง\n  - ${bad.join('\n  - ')}`); }
  });
  console.log(failed ? `\n${failed} คำถามต้องแก้ textOnly หรือ bm25 ใน ingest/graph.py` : `textOnly ของ ${D.questions.length} คำถามตรงกับผลค้น BM25`);
  process.exit(failed ? 1 : 0);
} else if (arg) show(arg, bm25(arg, { top: 8 }));
else D.questions.forEach(q => {
  show(`${q.id}: ${q.label}`, asApp(q));
  if (q.textOnly) console.log('  textOnly: ' + q.textOnly);
});
