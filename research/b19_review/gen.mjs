// Builds the B19 review page: injects the 42 interpretation items (with their policy clauses) from data.js into page.tpl.html
import { readFileSync, writeFileSync } from 'node:fs';
const [dataJs, tpl, out] = process.argv.slice(2);
const D = new Function(readFileSync(dataJs, 'utf8') + ';return DATA')();
const DOC = { T1: 'ประเภท 1', T2: 'ประเภท 2', T3: 'ประเภท 3', T5: '2+/3+', T4: 'ประเภท 4', T4SG: 'ประเภท 4 ป้องกันภัย', EV1: 'EV ประเภท 1', EV2: 'EV ประเภท 2', EV3: 'EV ประเภท 3', CMI: 'พ.ร.บ.' };
const PRIORITY = new Set(['flood_t1', 'flood_ev1', 'evt_tree_fall', 'evt_rollover', 'fault_shared', 'ds_expired_license', 'ds_gross_negligence']);
const GROUP = { detail: 'เงื่อนไขในตาราง', events: 'เหตุการณ์', factors: 'ปัจจัย', definitions: 'คำนิยาม' };
const clause = k => { const c = D.clauses[k]; return { id: k, doc: DOC[c.doc] || c.doc, ref: c.ref, text: c.text.replace(/\s+\n/g, '\n').trim() }; };
// one clause per document wording is enough for the reviewer: the same text repeats across plans
function pick(ids) {
  const seen = new Set(), outIds = [];
  for (const k of ids) { const c = D.clauses[k]; const key = c.ref + '|' + c.text.slice(0, 60); if (seen.has(key)) continue; seen.add(key); outIds.push(k); }
  return outIds.slice(0, 6).map(clause);
}
const items = [];
Object.entries(D.details).filter(([, d]) => d.interp).forEach(([id, d]) =>
  items.push({ id, group: GROUP.detail, name: d.name + ' (' + [...new Set(d.clauses.map(k => DOC[D.clauses[k].doc]))].join(', ') + ')', answer: d.desc.replace(/ \(ตีความ ต้องยืนยันกับฝ่ายสินไหม\)$/, ''), why: d.interp, status: d.interp_status, note: d.interp_note || '', clauses: pick(d.clauses), more: Math.max(0, d.clauses.length - 6) }));
['events', 'factors', 'definitions'].forEach(g => D[g].filter(n => n.interp).forEach(n =>
  items.push({ id: n.id, group: GROUP[g], name: n.name || n.term, answer: n.desc, why: n.interp, status: n.interp_status, note: n.interp_note || '', clauses: pick(n.clauses), more: 0 })));
items.forEach(x => { x.priority = PRIORITY.has(x.id); });
items.sort((a, b) => (b.priority - a.priority));
const json = JSON.stringify(items).replace(/</g, '\\u003c');
writeFileSync(out, readFileSync(tpl, 'utf8').replace('__ITEMS__', json).replace('__BUILT__', D.meta.built));
console.log(items.length, 'items', items.filter(x => x.priority).length, 'priority', items.filter(x => x.status === 'keep').length, 'keep', (json.length / 1024).toFixed(0) + ' KB');
