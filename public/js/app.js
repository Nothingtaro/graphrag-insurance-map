(function () {
  const D = DATA;
  const C = { ink: '#1B2B48', ink2: '#4A5872', paper: '#F4F6F8', cov: '#0F7B6C', cond: '#A86A12', no: '#B5412E', ev: '#6B7685',
    nodeCov: '#2F6DB5', nodeCond: '#C2860F', nodeDed: '#7A5AA6', nodeExcl: '#B5412E', nodeExc: '#0F7B6C', nodeNote: '#8A94A3',
    nodeBen: '#2F7FA6', nodeTopic: '#55627A', nodeVehicle: '#334155', nodeEvent: '#0E7490', nodeFactor: '#7C3AED' };
  const FONT = 'IBM Plex Sans Thai, sans-serif';
  const STATUS = { C: 'คุ้มครอง', K: 'คุ้มครองแบบมีเงื่อนไข', N: 'ไม่คุ้มครอง' };
  const STATUS_EDGE = { C: 'คุ้มครอง', K: 'มีเงื่อนไข', N: 'ไม่คุ้มครอง' };
  const KIND = { cond: 'เงื่อนไข', ded: 'ค่าเสียหายส่วนแรก', excl: 'ข้อยกเว้น', exc: 'ข้อยกเว้นใช้ไม่ได้เมื่อ', why: 'เหตุที่ไม่คุ้มครอง', note: 'หมายเหตุ', ben: 'สิทธิที่ได้รับ' };
  const KIND_EDGE_TH = { cond: 'ต้องเป็นไปตาม', ded: 'มีส่วนแรก', excl: 'ยกเว้น', why: 'เพราะ', note: 'หมายเหตุ', ben: 'ได้สิทธิ', exc: 'ข้อยกเว้นใช้ไม่ได้เมื่อ' };
  const KIND_EDGE = { cond: 'REQUIRES', ded: 'SUBJECT_TO', excl: 'EXCLUDED_BY', why: 'NOT_COVERED_BECAUSE', note: 'ANNOTATED_BY', ben: 'ENTITLES', exc: 'HAS_EXCEPTION' };
  const KIND_COLOR = { cond: C.nodeCond, ded: C.nodeDed, excl: C.nodeExcl, why: C.nodeExcl, exc: C.nodeExc, note: C.nodeNote, ben: C.nodeBen };
  const KIND_VIA = { cond: 'เงื่อนไข: ', ded: 'ส่วนแรก: ', excl: 'ข้อยกเว้น: ', exc: 'ข้อยกเว้นใช้ไม่ได้เมื่อ: ', why: 'เหตุที่ไม่คุ้มครอง: ', note: 'หมายเหตุ: ', ben: 'สิทธิ: ' };
  const META = D.meta || {};
  const SOURCE_NOTE = META.summary || 'เงื่อนไขกรมธรรม์ประกันภัยรถยนต์ของวิริยะประกันภัย';
  // general terms of a policy (payment, discounts, cancellation ...), per plan
  const TOPICS = D.topics || [], TERMS = D.terms || {};
  const topic = id => TOPICS.find(t => t.id === id);
  const termOf = (pid, tid) => (TERMS[pid] || {})[tid];
  const topicsFor = pid => TOPICS.filter(t => termOf(pid, t.id));
  // reverse index: clause -> where it is used in the graph
  const LINKS = {};
  const link = (k, l) => { (LINKS[k] = LINKS[k] || []); if (!LINKS[k].some(x => x.plan === l.plan && x.cov === l.cov && x.topic === l.topic && x.via === l.via)) LINKS[k].push(l); };
  D.plans.forEach(p => D.coverages.forEach(c => {
    const g = D.grants[p.id][c.id];
    g.clauses.forEach(k => link(k, { plan: p.id, cov: c.id, via: 'ข้อตกลงคุ้มครอง' }));
    g.details.forEach(d => D.details[d].clauses.forEach(k => link(k, { plan: p.id, cov: c.id, via: (KIND_VIA[D.details[d].kind] || '') + D.details[d].name })));
  }));
  D.plans.forEach(p => topicsFor(p.id).forEach(t => termOf(p.id, t.id).clauses.forEach(k => link(k, { plan: p.id, topic: t.id, via: 'เงื่อนไขทั่วไป' }))));
  const hitRank = {};

  const svgUri = s => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
  const ICON_CLAUSE = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M2 2h20l8 8v28H2z" fill="#fff" stroke="#6B7685" stroke-width="2" stroke-linejoin="round"/><path d="M22 2v8h8" fill="none" stroke="#6B7685" stroke-width="2" stroke-linejoin="round"/><path d="M7 17h18M7 22h18M7 27h18M7 32h11" stroke="#9AA3AF" stroke-width="2" stroke-linecap="round"/></svg>');
  const ICON_DOC = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="46" height="56" viewBox="0 0 46 56"><path d="M2 2h30l12 12v40H2z" fill="#3F4B5E" stroke="#3F4B5E" stroke-width="2" stroke-linejoin="round"/><path d="M32 2v12h12" fill="#6B7685" stroke="#3F4B5E" stroke-width="2" stroke-linejoin="round"/><text x="22" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#fff">PDF</text></svg>');

  const plan = id => D.plans.find(p => p.id === id);
  const cov = id => D.coverages.find(c => c.id === id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  // UI icons: Lucide outlines (ISC licence), one 24-unit grid, 2-unit stroke, round caps; drawn at 16-18px
  const LUCIDE = {
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    retry: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    up_thumb: '<path d="M7 10v12"/><path class="fillable" d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    down_thumb: '<path d="M17 14V2"/><path class="fillable" d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    newchat: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    unpin: '<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    collapse: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    chevdown: '<path d="m6 9 6 6 6-6"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
    graph: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
    details: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>'
  };
  const icon = (name, size = 16, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${LUCIDE[name]}</svg>`;
  document.querySelectorAll('[data-i]').forEach(el => {
    const t = document.createElement('template');
    t.innerHTML = icon(el.dataset.i, +el.dataset.s || 16, el.className);
    el.replaceWith(t.content.firstChild);
  });
  const RAD = Math.PI / 180;
  const lerp = (a, b, t) => ({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) });
  const polar = (r, a) => ({ x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) });
  const R_IN = 140, R1 = 285, R2 = 490, R3 = 700, R4 = 860;
  const baseAngle = cid => (-90 + D.coverages.findIndex(c => c.id === cid) * 45) * RAD;
  let ROT = 0;
  const covAngle = cid => baseAngle(cid) + ROT;
  function setRotation() {
    if (!state.drills.length) { ROT = 0; return; }
    const cs = [...new Set(state.drills.map(d => d[1]))].map(baseAngle);
    const mean = Math.atan2(cs.reduce((a, x) => a + Math.sin(x), 0), cs.reduce((a, x) => a + Math.cos(x), 0));
    ROT = -mean;
  }

  const state = { plans: ['p2p'], drills: [], focus: null, question: null, tech: false, topic: null, open: new Set() };
  let timers = [];
  let chatTrace = null, traceSeq = 0;
  const getQ = id => id === 'chat' ? chatTrace : D.questions.find(q => q.id === id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- labels ----------
  const planLabel = p => 'ประเภท\n' + p.name.replace('ประเภท ', '');
  const covLabel = c => state.tech ? c.name + '\n' + c.tech : c.name;
  const detailLabel = id => { const d = D.details[id]; return state.tech ? d.tech + '\n' + d.name : d.name; };
  const clauseLabel = id => (state.tech ? 'Clause ' + id : D.clauses[id].ref) + (hitRank[id] ? '\nค้นเจออันดับ ' + hitRank[id] : '');
  const lab = (th, tech) => state.tech ? tech : th;

  // ---------- core elements ----------
  const els = [];
  D.plans.forEach(p => els.push({ group: 'nodes', data: { id: p.id, label: planLabel(p) }, position: { x: 0, y: 0 }, classes: 'plan' }));
  D.coverages.forEach(c => els.push({ group: 'nodes', data: { id: 'cv_' + c.id, label: covLabel(c) }, position: polar(R1, covAngle(c.id)), classes: 'cov' }));
  D.plans.forEach(p => D.coverages.forEach(c => {
    const s = D.grants[p.id][c.id].s;
    els.push({ group: 'edges', data: { id: 'g-' + p.id + '-' + c.id, source: p.id, target: 'cv_' + c.id, th: STATUS_EDGE[s], tech: s === 'N' ? 'NOT_COVERED' : 'GRANTS {' + s + '}' }, classes: 'grant g' + s });
  }));

  // ---------- style ----------
  const style = [
    { selector: 'node', style: { 'font-family': FONT, 'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 150, 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 7, 'color': C.ink, 'font-size': 15, 'line-height': 1.3,
      'text-background-color': C.paper, 'text-background-opacity': 0.95, 'text-background-padding': 2, 'text-background-shape': 'round-rectangle',
      'border-width': 0, 'z-index-compare': 'manual', 'z-index': 10 } },
    { selector: 'node.plan', style: { 'shape': 'ellipse', 'width': 78, 'height': 78, 'background-color': C.ink, 'color': '#fff', 'text-valign': 'center', 'text-margin-y': 0, 'font-size': 15, 'font-weight': 600, 'text-background-opacity': 0, 'line-height': 1.15 } },
    { selector: 'node.plan.other', style: { 'width': 58, 'height': 58, 'background-color': '#fff', 'border-width': 2, 'border-color': C.ink, 'color': C.ink, 'font-size': 12.5 } },
    { selector: 'node.cov', style: { 'shape': 'ellipse', 'width': 46, 'height': 46, 'background-color': C.nodeCov, 'border-width': 3, 'border-color': '#fff' } },
    { selector: 'node.cov.st-C', style: { 'background-color': C.cov } },
    { selector: 'node.cov.st-K', style: { 'background-color': C.cond } },
    { selector: 'node.cov.st-N', style: { 'background-color': C.no } },
    { selector: 'node.cov.drilled', style: { 'width': 56, 'height': 56, 'font-weight': 600 } },
    { selector: 'node.detail', style: { 'width': 42, 'height': 42, 'background-color': 'data(color)' } },
    { selector: 'node.k-cond', style: { 'shape': 'diamond', 'width': 50, 'height': 50 } },
    { selector: 'node.k-ded', style: { 'shape': 'hexagon', 'width': 46, 'height': 42 } },
    { selector: 'node.k-excl', style: { 'shape': 'octagon' } },
    { selector: 'node.k-why', style: { 'shape': 'octagon', 'background-color': '#fff', 'border-width': 4, 'border-color': C.nodeExcl } },
    { selector: 'node.k-exc', style: { 'shape': 'ellipse', 'width': 38, 'height': 38 } },
    { selector: 'node.k-note', style: { 'shape': 'ellipse', 'width': 36, 'height': 36 } },
    { selector: 'node.k-ben', style: { 'shape': 'round-rectangle', 'width': 46, 'height': 32 } },
    // collapsed group of details of one kind in a crowded coverage cell (click to open/close)
    { selector: 'node.grp', style: { 'shape': 'round-rectangle', 'width': 58, 'height': 30, 'background-color': 'data(color)', 'border-width': 3, 'border-color': '#fff', 'border-style': 'double', 'font-weight': 600 } },
    { selector: 'node.grp.open', style: { 'background-opacity': 0.4 } },
    // where the question entered the graph: the car, the event, a factor (who drove, how the car was used ...)
    { selector: 'node.entry', style: { 'shape': 'round-tag', 'width': 52, 'height': 34, 'background-color': 'data(color)', 'font-weight': 600, 'text-max-width': 170 } },
    { selector: 'node.topic', style: { 'shape': 'round-rectangle', 'width': 54, 'height': 38, 'background-color': C.nodeTopic, 'font-weight': 600, 'text-max-width': 190 } },
    { selector: 'node.clause', style: { 'shape': 'rectangle', 'width': 32, 'height': 40, 'background-opacity': 0, 'background-image': ICON_CLAUSE, 'background-fit': 'contain', 'font-size': 14 } },
    { selector: 'node.doc', style: { 'shape': 'rectangle', 'width': 46, 'height': 56, 'background-opacity': 0, 'background-image': ICON_DOC, 'background-fit': 'contain', 'font-weight': 500, 'text-max-width': 170 } },
    { selector: 'node.clause.hit', style: { 'underlay-color': '#C2860F', 'underlay-opacity': 0.28, 'underlay-padding': 10, 'underlay-shape': 'ellipse', 'font-weight': 600 } },
    { selector: 'node.dim', style: { 'opacity': 0.3 } },
    { selector: 'node.faded', style: { 'opacity': 0.12 } },
    { selector: 'node.hl, node.sel', style: { 'opacity': 1, 'underlay-color': C.ink, 'underlay-opacity': 0.16, 'underlay-padding': 9, 'underlay-shape': 'ellipse' } },
    { selector: 'node.clause.hit.hl, node.clause.hit.sel', style: { 'underlay-color': '#C2860F', 'underlay-opacity': 0.35 } },

    { selector: 'edge', style: { 'curve-style': 'bezier', 'width': 1.2, 'line-color': '#AEB8C4', 'opacity': 0.16, 'target-arrow-shape': 'none', 'arrow-scale': 1.05,
      'font-family': FONT, 'font-size': 12.5, 'color': C.ink2, 'text-rotation': 'autorotate', 'text-background-color': '#fff', 'text-background-opacity': 0.95, 'text-background-padding': 2, 'text-background-shape': 'round-rectangle',
      'z-index-compare': 'manual', 'z-index': 2 } },
    { selector: 'edge.grant.on', style: { 'width': 2.6, 'opacity': 1, 'target-arrow-shape': 'triangle', 'label': 'data(lab)', 'z-index': 5 } },
    { selector: 'edge.grant.on.gC', style: { 'line-color': C.cov, 'target-arrow-color': C.cov } },
    { selector: 'edge.grant.on.gK', style: { 'line-color': C.cond, 'target-arrow-color': C.cond } },
    { selector: 'edge.grant.on.gN', style: { 'line-color': C.no, 'target-arrow-color': C.no, 'line-style': 'dashed', 'line-dash-pattern': [7, 5] } },
    { selector: 'edge.drill', style: { 'width': 1.8, 'opacity': 0.95, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'label': 'data(lab)', 'z-index': 6 } },
    { selector: 'edge.exc', style: { 'width': 1.8, 'opacity': 0.95, 'line-color': C.nodeExc, 'target-arrow-color': C.nodeExc, 'target-arrow-shape': 'triangle', 'label': 'data(lab)', 'z-index': 6 } },
    { selector: 'edge.ev', style: { 'width': 1.6, 'opacity': 0.9, 'line-color': C.ev, 'target-arrow-color': C.ev, 'target-arrow-shape': 'triangle', 'line-style': 'dashed', 'line-dash-pattern': [2, 4], 'label': 'data(lab)', 'z-index': 6 } },
    { selector: 'edge.entry', style: { 'width': 2, 'opacity': 0.95, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'target-arrow-shape': 'triangle', 'label': 'data(lab)', 'z-index': 6 } },
    { selector: 'edge.part', style: { 'width': 1, 'opacity': 0.55, 'line-color': '#8A94A3', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#8A94A3', 'arrow-scale': 0.8, 'z-index': 4 } },
    { selector: 'edge.part.techlab', style: { 'label': 'data(lab)' } },
    { selector: 'edge.dim', style: { 'opacity': 0.1, 'label': '' } },
    { selector: 'edge.faded', style: { 'opacity': 0.05, 'label': '' } },
    { selector: 'edge.hl, edge.selx', style: { 'opacity': 1, 'width': 3.4, 'z-index': 8, 'label': 'data(lab)' } },
    // answer trace: everything off the path recedes, the path is ink on white with numbered steps,
    // and the only colour left is the coverage status (node + the grant edge into it)
    { selector: 'node.faded', style: { 'opacity': 0.07, 'text-opacity': 0 } },
    { selector: 'edge.faded', style: { 'opacity': 0.03 } },
    { selector: 'node.qpath', style: { 'label': 'data(numlabel)', 'font-weight': 600, 'z-index': 10 } },
    { selector: 'node.qpath.entry', style: { 'color': C.ink } },
    { selector: 'node.qpath.detail, node.qpath.topic', style: { 'background-color': '#fff', 'border-width': 2.5, 'border-color': C.ink, 'color': C.ink } },
    { selector: 'node.qpath.clause.hit', style: { 'underlay-opacity': 0 } },
    { selector: 'node.qpath.pend', style: { 'opacity': 0.22 } },
    { selector: 'node.qpath.hl', style: { 'opacity': 1, 'underlay-opacity': 0 } },
    { selector: 'node.qpath.cur', style: { 'outline-width': 3, 'outline-color': C.ink, 'outline-offset': 5, 'outline-opacity': 1 } },
    { selector: 'edge.qpath.pend', style: { 'opacity': 0.15, 'label': '' } },
    { selector: 'edge.qpath.hl', style: { 'opacity': 1, 'width': 2.8, 'line-color': C.ink, 'target-arrow-color': C.ink, 'target-arrow-shape': 'triangle', 'label': 'data(lab)', 'z-index': 9 } },
    { selector: 'edge.qpath.hl.grant.gC', style: { 'line-color': C.cov, 'target-arrow-color': C.cov } },
    { selector: 'edge.qpath.hl.grant.gK', style: { 'line-color': C.cond, 'target-arrow-color': C.cond } },
    { selector: 'edge.qpath.hl.grant.gN', style: { 'line-color': C.no, 'target-arrow-color': C.no } }
  ];

  const cy = cytoscape({
    container: document.getElementById('cy'), elements: els, style, layout: { name: 'preset' },
    boxSelectionEnabled: false, autounselectify: true, minZoom: 0.25, maxZoom: 2.2
  });

  // ---------- layout ----------
  function corePositions() {
    const pos = {};
    const center = state.plans[0];
    pos[center] = { x: 0, y: 0 };
    const extra = state.plans.slice(1);
    const near = state.drills.length ? covAngle(state.drills[0][1]) - 55 * RAD : 0;
    extra.forEach(id => { pos[id] = polar(R_IN, near); });
    // between-coverage angles, so plan nodes sit clear of the center plan's edges
    const slots = [-67.5, 22.5, 112.5, 202.5, 157.5, -22.5, 67.5, 247.5].map(a => a * RAD + ROT).filter(a => !extra.length || Math.abs(Math.atan2(Math.sin(a - near), Math.cos(a - near))) > 40 * RAD);
    D.plans.filter(p => p.id !== center && !extra.includes(p.id)).forEach((p, i) => { pos[p.id] = polar(i < slots.length ? R_IN : R_IN + 50, i < slots.length ? slots[i] : (i * 90 + 45) * RAD); });
    D.coverages.forEach(c => { pos['cv_' + c.id] = polar(R1, covAngle(c.id)); });
    return pos;
  }

  function orderDetails(ids) {
    const out = [];
    ids.filter(id => !(D.details[id].exceptionOf && ids.includes(D.details[id].exceptionOf))).forEach(id => {
      out.push(id);
      ids.filter(x => D.details[x].exceptionOf === id).forEach(x => out.push(x));
    });
    return out;
  }

  // documents sit on the outer ring, at the mean angle of their clauses
  function placeDocs(placedCl, clAngle, add, target, deep) {
    const byDoc = {};
    [...placedCl].forEach(k => { (byDoc[D.clauses[k].doc] = byDoc[D.clauses[k].doc] || []).push(k); });
    Object.entries(byDoc).forEach(([doc, ks]) => {
      const a = ks.reduce((s, k) => s + clAngle[k], 0) / ks.length;
      target['doc_' + doc] = polar(R4 + (deep ? 120 : 0), a);
      add.push({ group: 'nodes', data: { id: 'doc_' + doc, label: D.docs[doc].title, doc }, position: polar(R1, a), classes: 'doc' });
      ks.forEach(k => add.push({ group: 'edges', data: { id: 'pt-' + k, source: 'k_' + k, target: 'doc_' + doc, th: '', tech: 'PART_OF' }, classes: 'part' }));
    });
  }
  // many nodes on one ring would overlap: past a count, alternate between two rings
  const ring = (n, limit, r, wide, narrow, i, gap) => ({ r: n > limit && i % 2 ? r + gap : r, step: (n > limit ? narrow : wide) / r });
  const TOPIC_ANGLE = 22.5 * RAD;     // between two coverage spokes
  function buildTopic(target) {
    const { plan: pid, id } = state.topic, x = termOf(pid, id), add = [], placedCl = new Set(), clAngle = {};
    const th = TOPIC_ANGLE + ROT, tid = 'tp_' + id;
    target[tid] = polar(R2 - 110, th);
    add.push({ group: 'nodes', data: { id: tid, label: topic(id).name }, position: polar(R_IN, th), classes: 'topic' });
    add.push({ group: 'edges', data: { id: 'pt-' + pid + '-' + id, source: pid, target: tid, color: C.nodeTopic, th: 'เงื่อนไขทั่วไป', tech: 'HAS_TERM' }, classes: 'drill' });
    const n = x.clauses.length;
    x.clauses.forEach((k, i) => {
      const { r, step } = ring(n, 8, R3, 150, 92, i, 120);
      clAngle[k] = th + (i - (n - 1) / 2) * step;
      placedCl.add(k);
      target['k_' + k] = polar(r, clAngle[k]);
      add.push({ group: 'nodes', data: { id: 'k_' + k, label: clauseLabel(k) }, position: polar(R2 - 110, th), classes: 'clause' + (hitRank[k] ? ' hit' : '') });
      add.push({ group: 'edges', data: { id: 'ev-' + id + '-' + k, source: tid, target: 'k_' + k, th: 'อ้างอิง', tech: 'EVIDENCED_BY' }, classes: 'ev' });
    });
    placeDocs(placedCl, clAngle, add, target, n > 8);
    add.forEach(a => { if (a.group === 'edges') a.data.lab = lab(a.data.th, a.data.tech); });
    cy.add(add);
    return target;
  }

  // returns map id -> target position for drill nodes
  function buildDrill() {
    cy.remove('.detail, .clause, .doc, .drill, .ev, .exc, .part, .topic, .grp, .entry');
    const target = {};
    if (!state.drills.length) return state.topic && !state.question ? buildTopic(target) : target;
    const add = [], placedDet = new Set(), placedCl = new Set(), clAngle = {};
    let deep = false;
    const byCov = {};
    state.drills.forEach(([p, c]) => { (byCov[c] = byCov[c] || []).push(p); });
    Object.entries(byCov).forEach(([c, plans]) => {
      const th = covAngle(c), from = polar(R1, th);
      let dets = [], prim = [];
      plans.forEach(p => { const g = D.grants[p][c]; g.details.forEach(d => { if (!dets.includes(d)) dets.push(d); }); g.clauses.forEach(k => { if (!prim.includes(k)) prim.push(k); }); });
      const allow = state.question ? new Set(getQ(state.question).paths.flat()) : null;
      if (allow) { dets = dets.filter(d => allow.has(d)); prim = prim.filter(k => allow.has(k)); }
      dets = orderDetails(dets).filter(d => !placedDet.has(d));
      // crowded cell (and no answer trace): fold each kind into one group node; why-not reasons and small kinds stay out
      const kindOf = id => { const d = D.details[id]; return d.exceptionOf && dets.includes(d.exceptionOf) ? D.details[d.exceptionOf].kind : d.kind; };
      const counts = {}; dets.forEach(id => { counts[kindOf(id)] = (counts[kindOf(id)] || 0) + 1; });
      const folds = k => !allow && dets.length > GROUP_AT && k !== 'why' && counts[k] >= 3;
      const slots = [], grpOf = {};
      dets.forEach(id => {
        const k = kindOf(id);
        if (!folds(k)) { slots.push({ id }); return; }
        const gk = c + '|' + k;
        if (!slots.some(x => x.grp === gk)) slots.push({ grp: gk, kind: k, n: counts[k] });
        if (state.open.has(gk)) { slots.push({ id }); grpOf[id] = gk; }
      });
      dets = slots.filter(x => x.id).map(x => x.id);
      slots.forEach((x, i) => {
        const { r, step } = ring(slots.length, 7, R2, 155, 92, i, 105);
        const pos = polar(r, th + (i - (slots.length - 1) / 2) * step);
        if (x.grp) {
          const gid = 'grp_' + x.grp.replace('|', '_'), open = state.open.has(x.grp);
          target[gid] = pos;
          add.push({ group: 'nodes', data: { id: gid, gkey: x.grp, label: KIND[x.kind] + ' ' + x.n + ' ข้อ\n' + (open ? '(คลิกเพื่อยุบ)' : '(คลิกเพื่อดู)'), color: KIND_COLOR[x.kind] },
            position: lerp(from, pos, 0.3), classes: 'grp k-' + x.kind + (open ? ' open' : '') });
          add.push({ group: 'edges', data: { id: 'dg-' + gid, source: 'cv_' + c, target: gid, color: KIND_COLOR[x.kind], th: KIND_EDGE_TH[x.kind] || '', tech: KIND_EDGE[x.kind] || 'GROUP' }, classes: 'drill' });
          return;
        }
        const d = D.details[x.id];
        placedDet.add(x.id);
        target['d_' + x.id] = pos;
        add.push({ group: 'nodes', data: { id: 'd_' + x.id, label: detailLabel(x.id), color: KIND_COLOR[d.kind] }, position: lerp(from, pos, 0.3), classes: 'detail k-' + d.kind });
      });
      const cls = [];
      prim.forEach(k => { if (!cls.includes(k)) cls.push(k); });
      dets.forEach(id => D.details[id].clauses.forEach(k => { if (!cls.includes(k) && (!allow || allow.has(k))) cls.push(k); }));
      const newCls = cls.filter(k => !placedCl.has(k));
      if (newCls.length > 8) deep = true;
      newCls.forEach((k, i) => {
        placedCl.add(k);
        const { r, step } = ring(newCls.length, 8, R3, 150, 92, i, 120);
        const a = th + (i - (newCls.length - 1) / 2) * step;
        clAngle[k] = a;
        target['k_' + k] = polar(r, a);
        add.push({ group: 'nodes', data: { id: 'k_' + k, label: clauseLabel(k) }, position: lerp(from, target['k_' + k], 0.3), classes: 'clause' + (hitRank[k] ? ' hit' : '') });
      });
      // edges
      dets.forEach(id => {
        const d = D.details[id];
        if (d.exceptionOf && dets.includes(d.exceptionOf)) {
          add.push({ group: 'edges', data: { id: 'x-' + id, source: 'd_' + d.exceptionOf, target: 'd_' + id, th: 'ใช้ไม่ได้เมื่อ', tech: 'HAS_EXCEPTION' }, classes: 'exc' });
        } else if (grpOf[id]) {
          const gid = 'grp_' + grpOf[id].replace('|', '_');
          add.push({ group: 'edges', data: { id: 'dr-' + c + '-' + id, source: gid, target: 'd_' + id, color: KIND_COLOR[d.kind], th: KIND_EDGE_TH[d.kind], tech: KIND_EDGE[d.kind] }, classes: 'drill' });
        } else {
          add.push({ group: 'edges', data: { id: 'dr-' + c + '-' + id, source: 'cv_' + c, target: 'd_' + id, color: KIND_COLOR[d.kind], th: KIND_EDGE_TH[d.kind], tech: KIND_EDGE[d.kind] }, classes: 'drill' });
        }
        d.clauses.filter(k => placedCl.has(k)).forEach(k => add.push({ group: 'edges', data: { id: 'ev-' + id + '-' + k, source: 'd_' + id, target: 'k_' + k, th: 'อ้างอิง', tech: 'EVIDENCED_BY' }, classes: 'ev' }));
      });
      prim.forEach(k => add.push({ group: 'edges', data: { id: 'ev-' + c + '-' + k, source: 'cv_' + c, target: 'k_' + k, th: 'อ้างอิง', tech: 'EVIDENCED_BY' }, classes: 'ev' }));
    });
    if (state.question) {
      const q = getQ(state.question), placedE = new Set(), back = covAngle(state.drills[0][1]) + Math.PI;
      let ei = 0;
      (q.paths || []).forEach(path => {
        const eid = String(path[0]);
        if (!eid.startsWith('en:') || path.length < 2) return;
        const gid = graphId(eid), next = path[1], tgt = graphId(next), type = ENTRY[eid.split(':')[1]];
        if (!placedE.has(eid)) {
          placedE.add(eid);
          let pos;
          if (plan(next)) pos = polar(R_IN + 40, back + (ei - 0.5) * 0.45);
          else if (cov(next)) pos = polar((R_IN + R1) / 2 + 30, covAngle(next) + 0.42 + 0.2 * ei);
          else { const t = target[tgt] || { x: 1, y: 0 }; pos = polar((R1 + R2) / 2 + 20, Math.atan2(t.y, t.x) + 0.3 + 0.12 * ei); }
          ei++;
          target[gid] = pos;
          add.push({ group: 'nodes', data: { id: gid, label: nodeName(eid), color: type.color }, position: pos, classes: 'entry' });
        }
        add.push({ group: 'edges', data: { id: 'en-' + gid + '-' + tgt, source: gid, target: tgt, color: type.color, th: type.th, tech: type.tech }, classes: 'entry' });
      });
    }
    placeDocs(placedCl, clAngle, add, target, deep);
    add.forEach(a => { if (a.group === 'edges') a.data.lab = lab(a.data.th, a.data.tech); });
    cy.add(add);
    return target;
  }
  const GROUP_AT = 7;   // a coverage cell with more details than this folds them by kind

  let tweenId = 0;
  function tweenTo(pos, dur, done) {
    const id = ++tweenId;
    const nodes = cy.nodes().filter(n => pos[n.id()]);
    const from = {};
    nodes.forEach(n => { const p = n.position(); from[n.id()] = { x: p.x, y: p.y }; });
    const finish = () => { if (id === tweenId && done) done(); };
    if (reduceMotion || !dur) { cy.batch(() => nodes.forEach(n => n.position({ x: pos[n.id()].x, y: pos[n.id()].y }))); finish(); return; }
    const t0 = performance.now();
    const step = now => {
      if (id !== tweenId) return;
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      cy.batch(() => nodes.forEach(n => {
        if (n.removed()) return;
        const a = from[n.id()], b = pos[n.id()];
        n.position({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
      }));
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
  }
  function moveTo(pos, animate) {
    Object.entries(pos).forEach(([id, p]) => {
      const n = cy.getElementById(id);
      if (!n.length) return;
      if (animate && !reduceMotion) n.animate({ position: p }, { duration: 420, easing: 'ease-out-cubic' });
      else n.position(p);
    });
  }
  function fitTo(eles, animate, maxZ) {
    if (!eles || !eles.length) eles = cy.nodes();
    const bb = eles.boundingBox({ includeLabels: true, includeOverlays: false });
    // a phone has no width to spare for a margin
    const W = cy.width(), Hh = cy.height(), pad = W < 600 ? 24 : 70;
    let z = Math.min((W - 2 * pad) / Math.max(bb.w, 1), (Hh - 2 * pad) / Math.max(bb.h, 1), maxZ || 1.2);
    z = Math.max(z, cy.minZoom());
    const pan = { x: W / 2 - z * (bb.x1 + bb.w / 2), y: Hh / 2 - z * (bb.y1 + bb.h / 2) };
    cy.stop(true, false);
    if (animate && !reduceMotion) cy.animate({ zoom: z, pan }, { duration: 380, easing: 'ease-out-cubic' });
    else { cy.zoom(z); cy.pan(pan); }
  }
  function focusEles() {
    if (state.question) return cy.elements('.qpath').nodes();
    if (state.drills.length || state.topic) return cy.nodes().not('.dim').not('.other');
    return cy.nodes();
  }
  function fitView(animate) { fitTo(focusEles(), animate); }

  // ---------- apply state ----------
  let lastLayoutKey = '', currentLayout = null;
  function applyGraph(opts) {
    opts = opts || {};
    // a general-terms view belongs to one plan with nothing drilled; anything else ends it
    if (state.topic && (state.drills.length || state.question || state.topic.plan !== state.plans[0])) state.topic = null;
    // a detail picked from the panel must be on screen: open its group
    const fid = state.focus && (state.focus.type === 'detail' ? state.focus.id : state.focus.from);
    if (fid && D.details[fid]) state.drills.forEach(([p, c]) => {
      const ds = D.grants[p][c].details, d = D.details[fid];
      if (ds.includes(fid)) state.open.add(c + '|' + (d.exceptionOf && ds.includes(d.exceptionOf) ? D.details[d.exceptionOf].kind : d.kind));
    });
    const key = (state.question || '') + ':' + traceSeq + '|' + state.plans.join(',') + '|' + state.drills.map(d => d.join(':')).join(',')
      + '|' + (state.topic ? state.topic.id : '') + '|' + [...state.open].sort().join(',');
    const relayout = key !== lastLayoutKey || opts.force;
    lastLayoutKey = key;
    let target = {};
    cy.batch(() => {
      if (relayout) { setRotation(); target = buildDrill(); }
      const center = state.plans[0];
      const drilled = state.drills.map(d => d[1]);
      cy.nodes('.plan').forEach(n => {
        n.toggleClass('other', n.id() !== center && !state.plans.includes(n.id()));
        n.toggleClass('dim', !state.plans.includes(n.id()) && drilled.length > 0);
      });
      cy.nodes('.cov').forEach(n => {
        const c = n.id().slice(3);
        n.removeClass('st-C st-K st-N drilled dim');
        n.addClass('st-' + D.grants[center][c].s);
        n.data('label', covLabel(cov(c)));
        if (drilled.length) n.addClass(drilled.includes(c) ? 'drilled' : 'dim');
        else if (state.topic) n.addClass('dim');
      });
      cy.edges('.grant').forEach(e => {
        const on = state.plans.includes(e.source().id());
        e.toggleClass('on', on);
        e.toggleClass('dim', on && ((drilled.length > 0 && !drilled.includes(e.target().id().slice(3))) || !!state.topic));
        e.data('lab', lab(e.data('th'), e.data('tech')));
      });
      cy.edges('.part').toggleClass('techlab', state.tech);
      cy.elements().removeClass('faded hl sel selx pend cur');
      if (!state.question) { cy.elements().removeClass('qpath'); viewGraph.classList.remove('tracing'); }
      if (state.focus) {
        const n = cy.getElementById(state.focus.type === 'detail' ? 'd_' + state.focus.id : 'k_' + state.focus.id);
        n.addClass('sel'); n.connectedEdges().addClass('selx');
      }
    });
    if (relayout) {
      const pos = Object.assign(corePositions(), target);
      cy.stop(true, false);
      tweenTo(pos, 420, () => fitView(true));
    }
  }

  // ---------- question trace ----------
  const ENTRY = {
    veh: { color: C.nodeVehicle, th: 'ใช้เงื่อนไข', tech: 'USES_WORDING' },
    evt: { color: C.nodeEvent, th: 'จัดเป็น', tech: 'MAPS_TO' },
    fac: { color: C.nodeFactor, th: 'เกี่ยวกับ', tech: 'APPLIES' }
  };
  const VEH_ALL = D.vehicles ? [...D.vehicles.models, ...D.vehicles.brands] : [];
  const entryName = id => {
    const [, t, x] = id.split(':');
    const n = t === 'veh' ? VEH_ALL.find(v => v.id === x) : t === 'evt' ? (D.events || []).find(v => v.id === x) : (D.factors || []).find(v => v.id === x);
    return n ? n.name : x;
  };
  const graphId = id => String(id).startsWith('en:') ? 'en_' + id.slice(3).replace(':', '_') : plan(id) ? id : cov(id) ? 'cv_' + id : D.details[id] ? 'd_' + id : 'k_' + id;
  const nodeName = id => String(id).startsWith('en:') ? entryName(id) : plan(id) ? plan(id).name : cov(id) ? cov(id).name : D.details[id] ? D.details[id].name : D.clauses[id].ref;
  const stepMark = n => n <= 20 ? String.fromCharCode(0x245F + n) : '(' + n + ')';
  function pathOrder(paths) {
    const order = new Map();
    paths.forEach(p => p.forEach(id => { if (!order.has(id)) order.set(id, order.size + 1); }));
    return order;
  }
  // the same numbered path, written out for the chat trace
  function pathListHtml(paths) {
    const order = pathOrder(paths);
    return '<ol class="gpath">' + paths.map(p => '<li>' + p.map(id =>
      `<span class="gstep"><span class="gn" aria-hidden="true">${order.get(id)}</span>${esc(nodeName(id))}</span>`).join('<span class="arr" aria-hidden="true">→</span>') + '</li>').join('') + '</ol>';
  }
  function runQuestion(q) {
    timers.forEach(clearTimeout); timers = [];
    state.question = q.id; state.focus = null;
    state.plans = [...new Set(q.grants.map(g => g[0]))];
    state.drills = q.grants.map(g => g.slice());
    showView('graph');
    // on a phone the path is drawn off screen: a dot on the map tab says there is something new to see
    if (isMobile() && screen !== 'graph') mnavDot.hidden = false;
    applyGraph({ force: true });
    renderPanel();
    const seq = [];
    q.paths.forEach(path => {
      const ids = path.map(graphId);
      ids.forEach((id, i) => {
        const n = cy.getElementById(id);
        if (i > 0) seq.push(n.edgesWith(cy.getElementById(ids[i - 1])));
        seq.push(n);
      });
    });
    const pathEls = seq.reduce((acc, x) => acc.union(x), cy.collection());
    cy.elements().removeClass('qpath pend cur'); pathEls.addClass('qpath pend');
    cy.elements().not(pathEls).addClass('faded');
    // number each node by first appearance; the chat trace uses the same numbers
    pathOrder(q.paths).forEach((n, raw) => {
      const el = cy.getElementById(graphId(raw));
      el.data('num', n); el.data('numlabel', stepMark(n) + el.data('label'));
    });
    viewGraph.classList.add('tracing');
    if (reduceMotion) fitView(false);
    const reveal = el => {
      el.removeClass('pend').addClass('hl');
      if (el.isNode()) { cy.nodes('.cur').removeClass('cur'); el.addClass('cur'); }
    };
    seq.forEach((el, i) => {
      if (reduceMotion) { reveal(el); return; }
      timers.push(setTimeout(() => reveal(el), 950 + i * 200));
    });
    // the ring marks the step being drawn; once the whole path is in, it goes away
    if (reduceMotion) cy.nodes('.cur').removeClass('cur');
    else timers.push(setTimeout(() => cy.nodes('.cur').removeClass('cur'), 950 + seq.length * 200 + 700));
  }

  // ---------- panel ----------
  const ctx = document.getElementById('ctx');
  const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function markText(text, phrases, from, to) {
    const ranges = [];
    (phrases || []).forEach(ph => {
      const re = new RegExp(ph.replace(/\s+/g, '').split('').map(escRe).join('\\s*'), 'g');
      let m; while ((m = re.exec(text))) { ranges.push([m.index, m.index + m[0].length]); if (!m[0].length) break; }
    });
    ranges.sort((a, b) => a[0] - b[0]);
    from = from || 0; to = to == null ? text.length : to;
    let out = '', pos = from;
    ranges.forEach(([a, b]) => {
      if (b <= pos || a >= to) return;
      a = Math.max(a, pos); b = Math.min(b, to);
      out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; pos = b;
    });
    return out + esc(text.slice(pos, to));
  }
  function snippet(c) {
    const t = c.text, ph = (c.hl || [])[0];
    let at = 0;
    if (ph) { const m = new RegExp(ph.replace(/\s+/g, '').split('').map(escRe).join('\\s*')).exec(t); if (m) at = m.index; }
    const from = Math.max(0, at - 120), to = Math.min(t.length, at + 260);
    return (from > 0 ? '…' : '') + markText(t, c.hl, from, to) + (to < t.length ? '…' : '');
  }
  function citeCard(k, full) {
    const c = D.clauses[k], doc = D.docs[c.doc];
    return `<div class="cite">
      <div class="src"><b>${esc(doc.title)}</b><span>${esc(c.ref)}, หน้า ${esc(c.page)}</span></div>
      ${full ? `<blockquote class="full">${markText(c.text, c.hl)}</blockquote>` : `<blockquote>${snippet(c)}</blockquote>`}
      ${c.plain ? `<p class="plain">${esc(c.plain)}</p>` : ''}
      <div class="tech">Clause ${esc(k)}, doc ${esc(c.doc)}, ${c.text.length} ตัวอักษร</div>
      ${full ? '' : `<button type="button" class="linkbtn" data-clause="${k}">อ่านข้อนี้ทั้งข้อ</button>`}
      <span class="file">${esc(doc.file)}</span>
    </div>`;
  }
  function crumbs() {
    const parts = [];
    if (state.question && state.focus) parts.push(`<button data-go="question">คำตอบ</button>`);
    if (!state.question && state.plans.length === 1) parts.push(`<button data-go="plan">${esc(plan(state.plans[0]).name)}</button>`);
    if (!state.question && state.drills.length === 1) parts.push(`<button data-go="grant">${esc(cov(state.drills[0][1]).name)}</button>`);
    if (!state.question && state.topic) parts.push(`<button data-go="topic">${esc(topic(state.topic.id).name)}</button>`);
    if (state.focus && state.focus.type === 'detail') parts.push(`<button data-go="detail">${esc(D.details[state.focus.id].name)}</button>`);
    if (state.focus && state.focus.type === 'clause') {
      if (state.focus.from) parts.push(`<button data-go="from">${esc(D.details[state.focus.from].name)}</button>`);
      parts.push(`<span>${esc(D.clauses[state.focus.id].ref)}</span>`);
    }
    return parts.length > 1 ? `<nav class="crumbs" aria-label="ตำแหน่งปัจจุบัน">${parts.join('<span class="sep">/</span>')}</nav>` : '';
  }
  function bindCrumbs() {
    ctx.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'question') { state.focus = null; cy.$('.sel').removeClass('sel'); renderPanel(); return; }
      if (go === 'plan') { state.drills = []; state.focus = null; state.topic = null; }
      if (go === 'grant' || go === 'topic') state.focus = null;
      if (go === 'detail') state.focus = { type: 'detail', id: state.focus.id };
      if (go === 'from') state.focus = { type: 'detail', id: state.focus.from };
      applyGraph(); renderPanel();
    }));
    ctx.querySelectorAll('[data-cov]').forEach(b => b.addEventListener('click', () => openGrant(state.plans[0], b.dataset.cov)));
    ctx.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => {
      const c = state.drills.length === 1 ? state.drills[0][1] : null;
      state.plans = [b.dataset.plan]; state.focus = null; state.question = null;
      state.drills = c ? [[b.dataset.plan, c]] : [];
      applyGraph(); renderPanel();
    }));
    ctx.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => { state.focus = { type: 'detail', id: b.dataset.detail }; state.question = null; applyGraph(); renderPanel(); }));
    ctx.querySelectorAll('[data-plan-cov]').forEach(b => b.addEventListener('click', () => { const [p, c] = b.dataset.planCov.split('|'); openGrant(p, c); }));
    ctx.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => openTopic(state.plans[0], b.dataset.topic)));
    ctx.querySelectorAll('[data-plan-topic]').forEach(b => b.addEventListener('click', () => { const [p, t] = b.dataset.planTopic.split('|'); openTopic(p, t); }));
    ctx.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
    ctx.querySelectorAll('[data-clause]').forEach(b => b.addEventListener('click', () => {
      state.focus = { type: 'clause', id: b.dataset.clause, from: state.focus && state.focus.type === 'detail' ? state.focus.id : null };
      cy.$('.sel').removeClass('sel'); cy.getElementById('k_' + b.dataset.clause).addClass('sel'); renderPanel();
    }));
  }

  function planPanel(pid) {
    const p = plan(pid), g = D.grants[pid];
    const n = { C: 0, K: 0, N: 0 }; Object.values(g).forEach(x => n[x.s]++);
    const doc = D.docs[p.doc];
    return `
      <h3>${esc(p.name)}</h3>
      <p class="meta">${esc(p.sub)}</p>
      <div class="tech">${esc(p.tech)}</div>
      <p>${esc(p.desc || '')}</p>
      <p class="tally">จาก ${D.coverages.length} เรื่อง: <span class="pill C">คุ้มครอง ${n.C}</span> <span class="pill K">มีเงื่อนไข ${n.K}</span> <span class="pill N">ไม่คุ้มครอง ${n.N}</span></p>
      <div class="sec"><h4>คลิกเพื่อดูเงื่อนไขของแต่ละเรื่อง</h4><div class="rows">
        ${D.coverages.map(c => `<button class="row" type="button" data-cov="${c.id}"><span class="dot ${g[c.id].s}"></span><span>${esc(c.name)}<span class="k">${STATUS[g[c.id].s]}</span></span></button>`).join('')}
      </div></div>
      ${topicsFor(pid).length ? `<div class="sec"><h4>เงื่อนไขทั่วไปของกรมธรรม์</h4><div class="rows">
        ${topicsFor(pid).map(t => `<button class="row" type="button" data-topic="${t.id}"><span class="dot kd-gen"></span><span>${esc(t.name)}</span></button>`).join('')}
      </div></div>` : ''}
      <div class="sec"><h4>เอกสารที่ใช้</h4>
        <div class="cite"><div class="src"><b>${esc(doc.title)}</b><span>${doc.pages} หน้า, มีผล ${esc(doc.effective)}</span></div><span class="file">${esc(doc.file)}</span></div>
      </div>
      ${aboutBlock()}`;
  }
  function aboutBlock() {
    const n = Object.keys(D.clauses).length;
    return `<div class="sec"><h4>เกี่ยวกับข้อมูลชุดนี้</h4>
      <div class="note">${esc(SOURCE_NOTE)} ตัดเป็น ${n} ช่วงข้อความตามหมวดและข้อ ใช้ทั้งเป็นหลักฐานในกราฟและเป็นคลังสำหรับค้นข้อความ</div>
      <div class="note">ข้อความดึงจาก PDF อัตโนมัติ ซ่อมอักษรไทยที่เพี้ยนด้วยกฎ และแยกหมวด/ข้อตามเลขข้อ ความสัมพันธ์ในกราฟผ่านการตรวจทีละข้อเทียบกับข้อความ แต่ยังควรให้ฝ่ายสินไหมตรวจก่อนใช้จริง</div>
      </div>
      <div class="sec"><h4>ขั้นถัดไปที่เสนอ</h4>
      <p>นำเข้าตารางกรมธรรม์ (วงเงินและค่าเสียหายส่วนแรก) ของแต่ละแผน ให้ฝ่ายสินไหมตรวจกราฟ แล้วทดลองใช้จริงกับ 1 use case เช่น ตอบคำถามความคุ้มครองใน call center</p></div>`;
  }
  function grantPanel(pid, cid) {
    const g = D.grants[pid][cid];
    const refs = g.clauses.length ? g.clauses : [...new Set(g.details.flatMap(id => D.details[id].clauses))];
    return `${crumbs()}
      <h3>${esc(cov(cid).name)}</h3>
      <p class="meta">ในแผน ${esc(plan(pid).name)}</p>
      <span class="pill ${g.s}">${STATUS[g.s]}</span>
      <div class="tech">CoverageGrant(${pid}, ${cov(cid).tech}), status ${g.s}</div>
      <p class="answer">${esc(g.sum)}</p>
      <button type="button" class="linkbtn" data-view="graph">ดูเส้นทางในแผนที่ความรู้</button>
      ${g.details.length ? `<div class="sec"><h4>เงื่อนไขที่ต้องรู้</h4><div class="rows">
        ${g.details.map(id => { const d = D.details[id]; return `<button class="row" type="button" data-detail="${id}"><span class="dot kd-${d.kind}"></span><span><span class="k">${KIND[d.kind]}</span>${esc(d.name)}</span></button>`; }).join('')}
      </div></div>` : ''}
      ${refs.length ? `<div class="sec"><h4>อ้างอิงในกรมธรรม์</h4>${refs.map(k => citeCard(k)).join('')}</div>` : ''}
      <div class="sec"><h4>เรื่องเดียวกันในแผนอื่น</h4><div class="rows">
        ${D.plans.map(p => { const s = D.grants[p.id][cid].s; return `<button class="row" type="button" data-plan="${p.id}" ${p.id === pid ? 'aria-current="true"' : ''}><span class="dot ${s}"></span><span>${esc(p.name)}${p.id === pid ? ' (กำลังดู)' : ''}<span class="k">${STATUS[s]}</span></span></button>`; }).join('')}
      </div></div>`;
  }
  function detailPanel(id) {
    const d = D.details[id];
    const exceptions = Object.entries(D.details).filter(([k, x]) => x.exceptionOf === id);
    return `${crumbs()}
      <h3>${esc(d.name)}</h3>
      <p class="meta">${KIND[d.kind]}</p>
      <div class="tech">${esc(d.tech)}, ${esc(id)}</div>
      <p>${esc(d.desc)}</p>
      ${d.exceptionOf ? `<div class="sec"><h4>เป็นข้อยกเว้นของ</h4><div class="rows"><button class="row" type="button" data-detail="${d.exceptionOf}"><span class="dot kd-excl"></span><span>${esc(D.details[d.exceptionOf].name)}</span></button></div></div>` : ''}
      ${exceptions.length ? `<div class="sec"><h4>ข้อยกเว้นนี้ใช้ไม่ได้เมื่อ</h4><div class="rows">${exceptions.map(([k, x]) => `<button class="row" type="button" data-detail="${k}"><span class="dot kd-exc"></span><span>${esc(x.name)}</span></button>`).join('')}</div></div>` : ''}
      <div class="sec"><h4>อ้างอิงในกรมธรรม์</h4>
        ${d.clauses.length ? d.clauses.map(k => citeCard(k)).join('') : '<div class="note">ยังไม่มีข้อในกรมธรรม์รองรับในชุดข้อมูลนี้ ต้องดึงจากตารางกรมธรรม์ของแผน</div>'}
      </div>`;
  }
  function topicPanel(pid, tid) {
    const t = topic(tid), x = termOf(pid, tid);
    return `${crumbs()}
      <h3>${esc(t.name)}</h3>
      <p class="meta">เงื่อนไขทั่วไปของ ${esc(plan(pid).name)}</p>
      <div class="tech">PolicyTerm(${pid}, ${esc(t.tech)})</div>
      <p class="answer">${esc(x.sum)}</p>
      <button type="button" class="linkbtn" data-view="graph">ดูในแผนที่ความรู้</button>
      <div class="sec"><h4>อ้างอิงในกรมธรรม์</h4>${x.clauses.map(k => citeCard(k)).join('')}</div>
      <div class="sec"><h4>เรื่องเดียวกันในแผนอื่น</h4><div class="rows">
        ${D.plans.map(p => {
          const y = termOf(p.id, tid), me = p.id === pid;
          const k = !y ? 'ไม่มีในเงื่อนไขของแผนนี้' : me ? 'กำลังดู' : y.sum === x.sum ? 'ถ้อยคำเหมือนกัน' : 'ถ้อยคำต่างกัน';
          return `<button class="row" type="button" data-plan-topic="${p.id}|${tid}" ${me ? 'aria-current="true"' : ''} ${y ? '' : 'disabled'}><span class="dot ${y ? 'kd-gen' : 'kd-none'}"></span><span>${esc(p.name)}<span class="k">${k}</span></span></button>`;
        }).join('')}
      </div></div>`;
  }
  function clausePanel(k) {
    const c = D.clauses[k];
    return `${crumbs()}
      <h3>${esc(c.ref)}</h3>
      <p class="meta">${esc(D.docs[c.doc].title)}</p>
      ${citeCard(k, true)}
      ${linksHtml(k)}
      <div class="note">ข้อความดึงอัตโนมัติจาก PDF ก่อนใช้งานจริงควรตรวจทานกับต้นฉบับ</div>`;
  }
  function linksHtml(k) {
    const L = LINKS[k] || [];
    if (!L.length) return '<div class="sec"><h4>เชื่อมกับกราฟ</h4><div class="note">ข้อนี้ยังไม่ได้เชื่อมกับ node ใดในกราฟ (อยู่ในคลังสำหรับค้นข้อความเท่านั้น)</div></div>';
    return `<div class="sec"><h4>ข้อนี้เชื่อมกับกราฟที่</h4><div class="rows">${L.map(l => l.topic
      ? `<button class="row" type="button" data-plan-topic="${l.plan}|${l.topic}"><span class="dot kd-gen"></span><span>${esc(plan(l.plan).name)} / ${esc(topic(l.topic).name)}<span class="k">${esc(l.via)}</span></span></button>`
      : `<button class="row" type="button" data-plan-cov="${l.plan}|${l.cov}"><span class="dot ${D.grants[l.plan][l.cov].s}"></span><span>${esc(plan(l.plan).name)} / ${esc(cov(l.cov).name)}<span class="k">${esc(l.via)}</span></span></button>`).join('')}</div></div>`;
  }
  function questionPanel(q) {
    const name = id => {
      if (String(id).startsWith('en:')) return [{ veh: 'รถ', evt: 'เหตุการณ์', fac: 'ปัจจัย' }[id.split(':')[1]], entryName(id)];
      if (plan(id)) return ['แผนประกัน', plan(id).name];
      if (cov(id)) return ['ความคุ้มครอง', cov(id).name];
      if (D.details[id]) return [KIND[D.details[id].kind], D.details[id].name];
      return ['ข้อในกรมธรรม์', D.clauses[id].ref];
    };
    return `<h3>${esc(q.label)}</h3>
      <span class="pill ${q.verdict}">${esc(q.verdictLabel)}</span>
      <p class="answer">${esc(q.answer)}</p>
      ${q.contrast ? `<div class="note">${esc(q.contrast)}</div>` : ''}
      <div class="sec"><h4>เส้นทางที่ AI ใช้หาคำตอบ</h4>
        ${q.paths.map((p, i) => `${q.paths.length > 1 ? `<p class="pathcap">เส้นทางที่ ${i + 1}: ${esc(name(p[0])[1])} / ${esc(name(p[1])[1])}</p>` : ''}<ol class="steps">${p.map(id => { const [k, v] = name(id); return `<li><span class="k">${esc(k)}</span>${esc(v)}</li>`; }).join('')}</ol>`).join('')}
      </div>
      <div class="sec"><h4>อ้างอิงในกรมธรรม์</h4>${q.cite.map(k => citeCard(k)).join('')}</div>`;
  }

  function renderPanel() {
    document.querySelectorAll('.q').forEach(b => b.setAttribute('aria-pressed', b.dataset.q === state.question ? 'true' : 'false'));
    let html;
    if (state.focus && state.focus.type === 'clause') html = clausePanel(state.focus.id);
    else if (state.question) html = questionPanel(getQ(state.question));
    else if (state.focus && state.focus.type === 'detail') html = detailPanel(state.focus.id);
    else if (state.topic && !state.drills.length) html = topicPanel(state.topic.plan, state.topic.id);
    else if (state.drills.length === 1) html = grantPanel(state.drills[0][0], state.drills[0][1]);
    else html = planPanel(state.plans[0]);
    ctx.innerHTML = html;
    bindCrumbs();
    syncMatrix();
  }

  function openGrant(pid, cid) {
    timers.forEach(clearTimeout); timers = [];
    state.question = null; state.focus = null; state.plans = [pid]; state.drills = [[pid, cid]];
    applyGraph(); renderPanel();
  }
  function openTopic(pid, tid) {
    timers.forEach(clearTimeout); timers = [];
    Object.assign(state, { question: null, focus: null, plans: [pid], drills: [], topic: { plan: pid, id: tid } });
    applyGraph(); renderPanel(); showTab('ctx');
  }


  // ---------- tabs ----------
  const tabChat = document.getElementById('tabChat'), tabCtx = document.getElementById('tabCtx');
  const chatPane = document.getElementById('chatPane'), ctxPane = document.getElementById('ctxPane');
  function showTab(t) {
    const chat = t === 'chat';
    tabChat.setAttribute('aria-selected', chat); tabCtx.setAttribute('aria-selected', !chat);
    chatPane.hidden = !chat; ctxPane.hidden = chat;
    // on a phone the panel's two tabs are screens of their own: opening details goes to that screen
    if (isMobile() && screen !== t) setScreen(t);
  }

  // ---------- phones: one screen at a time (chat, matrix, graph, details), switched from the bottom bar ----------
  const mqMobile = matchMedia('(max-width: 899px)');
  const isMobile = () => mqMobile.matches;
  const mnav = document.getElementById('mnav'), mnavDot = mnav.querySelector('.mn-dot');
  let screen = 'chat';
  function setScreen(s) {
    screen = s; document.body.dataset.screen = s;
    mnav.querySelectorAll('[data-screen]').forEach(b => { if (b.dataset.screen === s) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (s === 'chat' || s === 'ctx') showTab(s); else showView(s);
    if (s === 'graph') { mnavDot.hidden = true; requestAnimationFrame(() => { cy.resize(); fitView(false); }); }
    if (typeof hideTip === 'function') hideTip();
  }
  // a control that means "show me the matrix / the graph": on a phone that is a change of screen
  const go = v => { if (isMobile()) setScreen(v); else showView(v); };
  mnav.addEventListener('click', e => { const b = e.target.closest('[data-screen]'); if (b) setScreen(b.dataset.screen); });
  document.body.dataset.screen = screen;
  tabChat.addEventListener('click', () => showTab('chat'));
  tabCtx.addEventListener('click', () => showTab('ctx'));

  // ---------- views: coverage matrix (overview) and knowledge graph ----------
  const tabMatrix = document.getElementById('tabMatrix'), tabGraph = document.getElementById('tabGraph');
  const viewMatrix = document.getElementById('viewMatrix'), viewGraph = document.getElementById('viewGraph');
  let view = 'matrix';
  function showView(v) {
    if (v === view) return;
    view = v;
    const g = v === 'graph';
    tabMatrix.setAttribute('aria-selected', !g); tabGraph.setAttribute('aria-selected', g);
    viewMatrix.hidden = g; viewGraph.hidden = !g;
    if (g) { cy.resize(); fitView(false); }
  }
  tabMatrix.addEventListener('click', () => showView('matrix'));
  tabGraph.addEventListener('click', () => showView('graph'));
  [tabMatrix, tabGraph].forEach((t, i, all) => t.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = all[(i + 1) % all.length]; next.focus(); next.click();
  }));

  const STATUS_SHORT = { C: 'คุ้มครอง', K: 'มีเงื่อนไข', N: 'ไม่คุ้มครอง' };
  const STATUS_ICON = {
    C: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    K: '<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
    N: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  };
  const statusIcon = s => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${STATUS_ICON[s]}</svg>`;
  let pickedPlan = null;
  function renderMatrix() {
    const head = D.plans.map(p => `<th scope="col"><button type="button" class="ph" data-mplan="${p.id}"><span class="pn">${esc(p.name)}</span><span class="ps">${esc(p.sub)}</span></button></th>`).join('');
    const rows = D.coverages.map(c => `<tr><th scope="row">${esc(c.name)}</th>${D.plans.map(p => {
      const g = D.grants[p.id][c.id];
      return `<td><button type="button" class="cell ${g.s}" data-mcell="${p.id}|${c.id}" aria-label="${esc(p.name)}, ${esc(c.name)}: ${STATUS[g.s]}" title="${esc(g.sum)}">${statusIcon(g.s)}<span>${STATUS_SHORT[g.s]}</span></button></td>`;
    }).join('')}</tr>`).join('');
    const tally = D.plans.map(p => `<td>${D.coverages.filter(c => D.grants[p.id][c.id].s !== 'N').length} / ${D.coverages.length}</td>`).join('');
    document.getElementById('matrix').innerHTML = `<table class="matrix">
      <caption class="sr">สถานะความคุ้มครองของแต่ละแผนประกัน แยกตามเรื่อง</caption>
      <colgroup><col class="c-row">${D.plans.map(() => '<col>').join('')}</colgroup>
      <thead><tr><th scope="col" class="corner">เรื่อง</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th scope="row">คุ้มครอง (รวมแบบมีเงื่อนไข)</th>${tally}</tr></tfoot>
    </table>`;
    document.querySelectorAll('[data-mcell]').forEach(b => b.addEventListener('click', () => {
      const [p, c] = b.dataset.mcell.split('|');
      pickedPlan = null; openGrant(p, c); showTab('ctx');
    }));
    document.querySelectorAll('[data-mplan]').forEach(b => b.addEventListener('click', () => {
      stop();
      pickedPlan = b.dataset.mplan;
      Object.assign(state, { plans: [pickedPlan], drills: [], focus: null, question: null });
      applyGraph(); renderPanel(); showTab('ctx');
    }));
  }
  function syncMatrix() {
    const sel = !state.question && state.drills.length === 1 ? state.drills[0].join('|') : null;
    document.querySelectorAll('[data-mcell]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mcell === sel ? 'true' : 'false'));
    const colPlan = sel ? sel.split('|')[0] : (!state.question && !state.drills.length ? pickedPlan : null);
    document.querySelectorAll('[data-mplan]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mplan === colPlan ? 'true' : 'false'));
    document.querySelectorAll('[data-term]').forEach(b => b.setAttribute('aria-pressed', state.topic && state.topic.id === b.dataset.term ? 'true' : 'false'));
  }
  renderMatrix();
  // general terms as a plain-language FAQ, grouped by when a driver meets them.
  // q/a are hand-written summaries of each topic's policy wording; the full clause opens on click.
  const FAQ = {
    pay: { q: 'ประกันเริ่มคุ้มครองเมื่อไหร่', a: 'ทันทีที่จ่ายเบี้ย จ่ายผ่านตัวแทนหรือนายหน้าก็นับว่าจ่ายบริษัทแล้ว' },
    transfer: { q: 'ขายรถแล้ว ประกันไปไหน', a: 'ตามรถไปให้เจ้าของใหม่จนหมดอายุ แต่ถ้าขายให้เต็นท์รถหรืออู่ ความคุ้มครองตัวรถจบทันทีและได้เบี้ยคืนบางส่วน' },
    cancel: { q: 'ยกเลิกกลางคันได้เงินคืนไหม', a: 'ยกเลิกได้ทุกเมื่อ ยิ่งยกเลิกเร็วยิ่งได้คืนมาก ถือครบปีแล้วไม่คืน' },
    claim: { q: 'เกิดอุบัติเหตุต้องทำอะไร', a: 'แจ้งบริษัทให้เร็วที่สุด แจ้งผ่านแอปของ คปภ. หรือแอปของบริษัทก็ได้' },
    genexcl: { q: 'เหตุการณ์ไหนที่ไม่มีแผนใดจ่าย', a: 'สงคราม การกบฏ นิวเคลียร์ การก่อการร้าย และระบบควบคุมรถถูกแฮก' },
    fraud: { q: 'ถ้าเคลมเป็นเท็จจะเป็นอย่างไร', a: 'บริษัทไม่จ่าย และยกเลิกกรมธรรม์ได้ทันทีโดยไม่คืนเบี้ย' },
    ncb: { q: 'ไม่เคยเคลม ปีหน้าได้ลดเบี้ยไหม', a: 'ได้ รถส่วนบุคคลลด 20% ในปีแรก และสะสมได้ถึง 40%' },
    malus: { q: 'เคลมบ่อย เบี้ยจะขึ้นไหม', a: 'ขึ้น ถ้าปีเดียวเป็นฝ่ายผิด 2 ครั้งขึ้นไปและยอดเคลมเกิน 2 เท่าของเบี้ย' },
    deny: { q: 'บริษัทไม่ยอมจ่ายทั้งที่ควรจ่าย', a: 'ถ้าฟ้องแล้วบริษัทแพ้ บริษัทต้องจ่ายพร้อมดอกเบี้ย 15% ต่อปี' },
    dispute: { q: 'ไม่เห็นด้วยกับบริษัท ต้องขึ้นศาลไหม', a: 'ไม่จำเป็น เลือกให้คนกลางของ คปภ. (อนุญาโตตุลาการ) ตัดสินได้ และบริษัทต้องยอม' }
  };
  const FAQ_GROUPS = [
    ['ตอนซื้อ ขาย หรือยกเลิก', ['pay', 'transfer', 'cancel']],
    ['เมื่อเกิดเหตุ', ['claim', 'genexcl', 'fraud']],
    ['เบี้ยปีถัดไป', ['ncb', 'malus']],
    ['เมื่อมีปัญหากับบริษัท', ['deny', 'dispute']]
  ];
  const FAQ_CHEV = '<svg class="chev" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function renderTerms() {
    const el = document.getElementById('termGrid');
    if (!el) return;
    const ids = new Set(TOPICS.map(t => t.id));
    const placed = new Set(FAQ_GROUPS.flatMap(g => g[1]));
    const groups = FAQ_GROUPS.map(([name, list]) => [name, list.filter(id => ids.has(id))]);
    const rest = TOPICS.filter(t => !placed.has(t.id)).map(t => t.id);   // topics added to the data later still show up
    if (rest.length) groups.push(['เรื่องอื่น ๆ', rest]);
    const odd = new Set();   // plans whose wording differs: said once below the heading, not on every row
    const row = id => {
      const t = TOPICS.find(x => x.id === id);
      const have = D.plans.filter(p => termOf(p.id, id)), base = termOf(have[0].id, id);
      const missing = D.plans.filter(p => !termOf(p.id, id)).map(p => p.name);
      const differ = have.filter(p => termOf(p.id, id).sum !== base.sum).map(p => p.name);
      differ.forEach(n => odd.add(n));
      const note = missing.length ? missing.join(', ') + ' ไม่มีข้อนี้' : '';
      const f = FAQ[id] || { q: t.name, a: base.sum };
      return `<li><button type="button" class="faq-row" data-term="${id}" aria-pressed="false"><span class="fq">${esc(f.q)}</span><span class="fa">${esc(f.a)}</span>${note ? `<span class="fn">${esc(note)}</span>` : ''}${FAQ_CHEV}</button></li>`;
    };
    el.innerHTML = groups.filter(g => g[1].length).map(([name, list]) =>
      `<section class="faq-g"><h3>${esc(name)}</h3><ul>${list.map(row).join('')}</ul></section>`).join('');
    const oddNote = document.getElementById('faqOdd');
    if (oddNote) {
      const plans = D.plans.filter(p => odd.has(p.name));
      const eds = [...new Set(plans.map(p => (D.docs[p.doc] || {}).edition).filter(Boolean))];
      oddNote.hidden = !plans.length;
      oddNote.textContent = plans.length ? `${plans.map(p => p.name).join(', ')} ใช้เงื่อนไข${eds.length ? 'ฉบับปี ' + eds.join(', ') : 'ฉบับอื่น'} รายละเอียดบางข้อจึงต่างจากที่สรุปไว้ คลิกแต่ละข้อเพื่อดูถ้อยคำของแผนนั้น` : '';
    }
    el.querySelectorAll('[data-term]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.term, cur = state.plans[0];
      openTopic(termOf(cur, t) ? cur : D.plans.find(p => termOf(p.id, t)).id, t);
    }));
  }
  renderTerms();
  // fade the right edge while plan columns are hidden off to the side
  const mxEl = document.getElementById('matrix'), mxWrap = document.getElementById('matrixWrap');
  const mxMore = () => mxWrap.classList.toggle('more', mxEl.scrollLeft + mxEl.clientWidth < mxEl.scrollWidth - 2);
  mxEl.addEventListener('scroll', mxMore, { passive: true });
  window.addEventListener('resize', mxMore);
  mxMore();
  const nClauses = Object.keys(D.clauses).length;
  document.getElementById('scope').textContent = `${D.plans.length} แผน · ${D.coverages.length} เรื่องความคุ้มครอง · ${TOPICS.length} เงื่อนไขทั่วไป · ${nClauses} ข้อในกรมธรรม์ · ฉบับ ${(META.editions || []).join(' / ') || D.docs[D.plans[0].doc].effective}`;
  document.getElementById('howSearch').textContent = `หาข้อในกรมธรรม์ที่เกี่ยวกับคำถาม จากทั้งหมด ${nClauses} ข้อ`;

  // ---------- chat: GraphRAG over this page's graph ----------
  const msgsEl = document.getElementById('msgs'), form = document.getElementById('composer');
  const input = document.getElementById('chatIn'), sendBtn = document.getElementById('sendBtn');
  const offNote = document.getElementById('chatOff'), qsEl = document.getElementById('qs');
  let sample = null, busy = null;
  const history = [];

  D.questions.forEach(q => {
    const b = document.createElement('button');
    b.className = 'q'; b.type = 'button'; b.dataset.q = q.id;
    b.innerHTML = `<span>${esc(q.label)}</span>${icon('chev')}`;
    b.addEventListener('click', () => presetAnswer(q));
    qsEl.appendChild(b);
  });

  // routing lives in route.js (shared with ingest/eval_route.mjs)
  const { norm, resolvePlan, resolveCov, resolveTopic, route } = makeRouter(D);
  // cap per clause sent to Claude; keep equal to CLAUSE_CHAR_LIMIT in ingest/build_data.py (longest clause today: 910)
  const CLAUSE_CHAR_LIMIT = 1000;
  const clauseOut = k => { const c = D.clauses[k]; return { clause_id: k, document: D.docs[c.doc].title, ref: c.ref, page: c.page, text: c.text.length > CLAUSE_CHAR_LIMIT ? c.text.slice(0, CLAUSE_CHAR_LIMIT) + '…' : c.text, meaning: c.plain }; };

  // ---------- BM25 over every chunk of the policy wordings ----------
  const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const STOP = new Set(['และ', 'หรือ', 'ที่', 'ของ', 'ใน', 'การ', 'ให้', 'ได้', 'เป็น', 'จะ', 'ซึ่ง', 'นี้', 'กับ', 'โดย', 'แต่', 'ตาม', 'ไว้', 'ว่า', 'ก็', 'มี', 'ความ', 'ข้อ', 'แห่ง', 'ต่อ', 'จาก', 'เพื่อ', 'อัน', 'หาก', 'ทั้ง', 'ดังกล่าว', 'นั้น', 'ไป', 'มา', 'แก่', 'อยู่', 'เมื่อ', 'ถ้า', 'ไหม', 'อะไร', 'ยังไง', 'อย่างไร', 'บ้าง', 'คะ', 'ครับ', 'ค่ะ', 'จ่าย', 'คุ้มครอง', 'ประเภท', 'บริษัท', 'ประกันภัย', 'กรมธรรม์']);
  const QX = [['ชั้น', 'ประเภท'], ['รถหาย', 'รถยนต์สูญหาย'], ['ขโมย', 'ลักทรัพย์'], ['เมา', 'เมาสุรา แอลกอฮอล์'], ['ชนเอง', 'ชน คู่กรณี'], ['ไม่มีคู่กรณี', 'คู่กรณี'], ['ไฟไหม้', 'ไฟไหม้'], ['ใบขับขี่', 'ใบอนุญาตขับขี่'],
    ['แบต', 'แบตเตอรี่'], ['ที่ชาร์จ', 'เครื่องชาร์จ'], ['ตู้ชาร์จ', 'เครื่องชาร์จ'], ['wallbox', 'เครื่องชาร์จ'], ['สายชาร์จ', 'สายชาร์จ เครื่องชาร์จ'], ['ชาร์จ', 'ชาร์จ เครื่องชาร์จ']];
  function toks(str) {
    const s0 = String(str || '').toLowerCase().replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1');
    const out = [];
    if (SEG) { for (const g of SEG.segment(s0)) { if (!g.isWordLike) continue; const w = g.segment.trim(); if (w.length > 1 && !STOP.has(w)) out.push(w); } }
    else s0.split(/[\s,.()]+/).forEach(w => { if (w.length > 1 && !STOP.has(w)) out.push(w); });
    return out;
  }
  const IDX = (() => {
    const docs = Object.keys(D.clauses).map(k => { const c = D.clauses[k]; const tf = new Map(); const t = toks(c.ref + ' ' + c.text); t.forEach(w => tf.set(w, (tf.get(w) || 0) + 1)); return { k, tf, len: t.length }; });
    const df = new Map(); docs.forEach(d => d.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
    return { docs, df, avg, N: docs.length };
  })();
  function bm25(query, opts) {
    opts = opts || {};
    let q = String(query);
    QX.forEach(([a, b]) => { if (q.includes(a)) q += ' ' + b; });
    const terms = [...new Set(toks(q))];
    const k1 = 1.2, b = 0.75;
    const res = [];
    IDX.docs.forEach(d => {
      if (opts.docs && !opts.docs.includes(D.clauses[d.k].doc)) return;
      let sc = 0; const matched = [];
      terms.forEach(w => {
        const f = d.tf.get(w); if (!f) return;
        const n = IDX.df.get(w);
        const idf = Math.log(1 + (IDX.N - n + 0.5) / (n + 0.5));
        sc += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / IDX.avg));
        matched.push(w);
      });
      if (sc > 0) res.push({ k: d.k, score: sc, matched });
    });
    res.sort((x, y) => y.score - x.score);
    return { terms, hits: res.slice(0, opts.top || 5) };
  }
  function markHits(hits) {
    Object.keys(hitRank).forEach(k => delete hitRank[k]);
    hits.forEach((h, i) => { hitRank[h.k] = i + 1; });
  }
  function hitsHtml(r) {
    if (!r.hits.length) return '<div class="hits"><span class="hcap">ค้นข้อความ (BM25): ไม่พบข้อความที่ตรงกับคำค้น</span></div>';
    return `<div class="hits"><span class="hcap">ค้นข้อความ (BM25) คำค้น: ${esc(r.terms.join(', '))}</span>${r.hits.map((h, i) => {
      const c = D.clauses[h.k]; const linked = (LINKS[h.k] || []).length;
      return `<button type="button" class="hit" data-cite="${h.k}"><span class="hr">${i + 1}</span><span class="ht">${esc(D.docs[c.doc].title.replace('เงื่อนไข', ''))} ${esc(c.ref)}</span><span class="hs">${h.score.toFixed(1)}</span><span class="hl2">${linked ? 'เชื่อมกราฟ ' + linked + ' จุด' : 'ไม่อยู่ในกราฟ'}</span></button>`;
    }).join('')}</div>`;
  }
  const detailOut = id => { const d = D.details[id]; return { id, type: KIND[d.kind], name: d.name, description: d.desc, exception_to: d.exceptionOf || null, clause_ids: d.clauses }; };

  // live graph walk while the AI uses tools
  let walk = { grants: [], el: null, facts: null, allowed: new Set() };
  function addFact(label, st) {
    if (!walk.facts) return;
    if ([...walk.facts.querySelectorAll('.pill')].some(x => x.dataset.k === label)) return;
    walk.facts.hidden = false;
    const sp = document.createElement('span');
    sp.className = 'pill ' + st; sp.dataset.k = label; sp.textContent = label + ': ' + STATUS[st];
    walk.facts.querySelector('.fl').appendChild(sp);
  }
  const allowClauses = ids => ids.forEach(k => walk.allowed.add(k));
  function walkStep(label) {
    if (!walk.el) return;
    const s = document.createElement('span'); s.textContent = label; walk.el.appendChild(s);
    if (walk.m && walk.m.trace.classList.contains('live')) traceLabel(walk.m, label + '…');
    scrollDown();
  }
  function walkGrant(p, c) {
    if (!walk.grants.some(g => g[0] === p && g[1] === c)) walk.grants.push([p, c]);
    const recent = walk.grants.slice(-3);
    stop();
    state.question = null; state.focus = null;
    state.plans = [...new Set(recent.map(g => g[0]))];
    state.drills = recent.map(g => g.slice());
    applyGraph();
  }

  const TOOLS = [
    { name: 'search_chunks', description: 'ค้นข้อความในเงื่อนไขกรมธรรม์ทุกข้อด้วย BM25 คืนข้อที่เกี่ยวข้องที่สุดพร้อมคะแนน และบอกว่าแต่ละข้อเชื่อมกับแผน/ความคุ้มครองใดในกราฟ ใช้เป็นขั้นแรกเสมอ',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, plan: { type: 'string', description: 'ถ้าผู้ใช้ระบุแผน ให้ใส่ plan id เพื่อค้นเฉพาะเอกสารของแผนนั้น' } }, required: ['query'] },
      execute: ({ query, plan: pl, plans: pls }) => {
        const p = pl ? resolvePlan(pl) : null;
        // `plans` is internal (retrieve): several named plans -> search only their documents
        const docs = p ? [plan(p).doc] : (pls && pls.length ? [...new Set(pls.map(x => plan(x).doc))] : null);
        const r = bm25(query, { docs, top: 5 });
        walkStep('ค้นข้อความ: "' + query + '"' + (p ? ' ใน' + D.docs[plan(p).doc].title : docs ? ' ใน' + docs.map(d => D.docs[d].title).join(', ') : ''));
        if (walk.el) { const d = document.createElement('div'); d.innerHTML = hitsHtml(r); walk.el.appendChild(d.firstChild); bindCites(walk.el); }
        markHits(r.hits);
        allowClauses(r.hits.map(h => h.k));
        return { query_terms: r.terms, hits: r.hits.map(h => ({ ...clauseOut(h.k), score: +h.score.toFixed(2),
          graph_links: (LINKS[h.k] || []).map(l => l.topic ? { plan_id: l.plan, topic_id: l.topic, via: l.via } : { plan_id: l.plan, coverage_id: l.cov, via: l.via }) })) };
      } },
    { name: 'get_policy_terms', description: 'ดึงเงื่อนไขทั่วไปของกรมธรรม์ที่ไม่ได้ผูกกับความคุ้มครองเรื่องใด เช่น ส่วนลดประวัติดี การเพิ่มเบี้ย การยกเลิกและคืนเบี้ย การโอนหรือขายรถ การแจ้งเคลม การชำระเบี้ย ใส่ plan เพื่อดูของแผนเดียว ถ้าไม่ใส่จะได้ทุกแผน โดยรวมแผนที่ถ้อยคำเหมือนกันไว้ด้วยกัน',
      inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'topic id เช่น ncb หรือชื่อเรื่อง' }, plan: { type: 'string', description: 'plan id หรือชื่อแผน (ไม่บังคับ)' } }, required: ['topic'] },
      execute: ({ topic: tp, plan: pl }) => {
        const t = resolveTopic(tp), p = pl ? resolvePlan(pl) : null;
        walkStep('ดูเงื่อนไขทั่วไป: ' + topic(t).name + (p ? ' ของ' + plan(p).name : ' ทุกแผน'));
        if (p) {
          const x = termOf(p, t);
          if (!x) return { topic_id: t, topic: topic(t).name, plan_id: p, plan: plan(p).name, found: false, note: 'เงื่อนไขของแผนนี้ไม่มีเรื่องนี้' };
          allowClauses(x.clauses);
          stop(); Object.assign(state, { question: null, focus: null, plans: [p], drills: [], topic: { plan: p, id: t } }); applyGraph();
          return { topic_id: t, topic: topic(t).name, plan_id: p, plan: plan(p).name, summary: x.sum, clauses: x.clauses.map(clauseOut) };
        }
        const groups = new Map();
        D.plans.forEach(pp => { const x = termOf(pp.id, t), k = x ? x.sum : ''; if (!groups.has(k)) groups.set(k, { plans: [], x }); groups.get(k).plans.push(pp.name); });
        const by_plan = [...groups.values()].map(gp => gp.x
          ? { plans: gp.plans, summary: gp.x.sum, clauses: gp.x.clauses.slice(0, 3).map(clauseOut) }
          : { plans: gp.plans, summary: 'ไม่มีเรื่องนี้ในเงื่อนไขของแผน' });
        allowClauses(by_plan.flatMap(o => (o.clauses || []).map(c => c.clause_id)));
        return { topic_id: t, topic: topic(t).name, by_plan };
      } },
    { name: 'get_plan_overview', description: 'สรุปว่าแผนประกันหนึ่งคุ้มครองแต่ละเรื่องหรือไม่ (สถานะทุกความคุ้มครองของแผน)',
      inputSchema: { type: 'object', properties: { plan: { type: 'string', description: 'plan id เช่น p2p หรือชื่อแผน' } }, required: ['plan'] },
      execute: ({ plan: pl }) => {
        const p = resolvePlan(pl);
        walkStep('ดูภาพรวมแผน ' + plan(p).name);
        stop(); state.question = null; state.focus = null; state.plans = [p]; state.drills = []; applyGraph();
        return { plan_id: p, plan: plan(p).name, description: plan(p).desc || '', coverages: D.coverages.map(c => ({ coverage_id: c.id, name: c.name, status: STATUS[D.grants[p][c.id].s] })) };
      } },
    { name: 'get_coverage', description: 'ดึงรายละเอียดความคุ้มครองหนึ่งเรื่องของแผนหนึ่ง: สถานะ สรุป เงื่อนไข ค่าเสียหายส่วนแรก ข้อยกเว้น และข้อในกรมธรรม์ที่อ้างอิง',
      inputSchema: { type: 'object', properties: { plan: { type: 'string' }, coverage: { type: 'string', description: 'coverage id เช่น flood หรือชื่อเรื่อง' } }, required: ['plan', 'coverage'] },
      execute: ({ plan: pl, coverage: cv }) => {
        const p = resolvePlan(pl), c = resolveCov(cv), g = D.grants[p][c];
        walkStep('เดินจาก ' + plan(p).name + ' ไป ' + cov(c).name);
        walkGrant(p, c);
        addFact(plan(p).name + ' / ' + cov(c).name, g.s);
        allowClauses([...g.clauses, ...g.details.flatMap(d => D.details[d].clauses)]);
        return { plan_id: p, plan: plan(p).name, coverage_id: c, coverage: cov(c).name, status: STATUS[g.s], summary: g.sum,
          details: g.details.map(detailOut), clauses: [...new Set([...g.clauses, ...g.details.flatMap(d => D.details[d].clauses)])].map(clauseOut) };
      } },
    { name: 'compare_plans', description: 'เทียบความคุ้มครองเรื่องเดียวกันข้ามทุกแผน ใช้เมื่อผู้ใช้ไม่ระบุแผนหรือถามเปรียบเทียบ',
      inputSchema: { type: 'object', properties: { coverage: { type: 'string' } }, required: ['coverage'] },
      execute: ({ coverage: cv }) => {
        const c = resolveCov(cv);
        walkStep('เทียบเรื่อง ' + cov(c).name + ' ทุกแผน');
        D.plans.forEach(p => addFact(p.name + ' / ' + cov(c).name, D.grants[p.id][c].s));
        return { coverage_id: c, coverage: cov(c).name, plans: D.plans.map(p => ({ plan_id: p.id, plan: p.name, status: STATUS[D.grants[p.id][c].s], summary: D.grants[p.id][c].sum })) };
      } },
    { name: 'search_terms', description: 'ค้นเงื่อนไข ข้อยกเว้น หรือข้อในกรมธรรม์ด้วยคำสำคัญ เช่น แอลกอฮอล์ ใบขับขี่ ส่วนแรก เช่าซื้อ',
      inputSchema: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] },
      execute: ({ keyword }) => {
        const n = norm(keyword);
        walkStep('ค้นคำว่า "' + keyword + '"');
        const details = Object.keys(D.details).filter(id => !id.startsWith('base_') && norm(D.details[id].name + D.details[id].desc).includes(n)).slice(0, 8).map(id => ({
          ...detailOut(id),
          used_in: D.plans.flatMap(p => D.coverages.filter(c => D.grants[p.id][c.id].details.includes(id)).map(c => ({ plan_id: p.id, coverage_id: c.id })))
        }));
        const clauses = Object.keys(D.clauses).filter(k => norm(D.clauses[k].text + D.clauses[k].ref).includes(n)).slice(0, 6).map(clauseOut);
        allowClauses([...details.flatMap(d => d.clause_ids), ...clauses.map(c => c.clause_id)]);
        return { details, clauses };
      } },
    { name: 'get_clause', description: 'อ่านข้อความของข้อในกรมธรรม์ตาม clause id',
      inputSchema: { type: 'object', properties: { clause_id: { type: 'string' } }, required: ['clause_id'] },
      execute: ({ clause_id }) => {
        if (!D.clauses[clause_id]) throw new Error('ไม่พบ clause ' + clause_id);
        walkStep('อ่าน ' + D.clauses[clause_id].ref);
        allowClauses([clause_id]);
        return clauseOut(clause_id);
      } }
  ];

  const PREAMBLE = [
    'คุณคือผู้ช่วยตอบคำถามความคุ้มครองประกันรถยนต์ภาคสมัครใจ ตอบจาก knowledge graph ผ่าน tools ที่ให้มาเท่านั้น',
    'กฎ:',
    '1. ขั้นแรกเรียก search_chunks ด้วยคำถามของผู้ใช้ (ใส่ plan ถ้าผู้ใช้ระบุแผน) แล้วใช้ graph_links ที่ได้ ขยายผ่านกราฟด้วย get_coverage หรือ compare_plans ก่อนตอบ ห้ามตอบจากความรู้ทั่วไปหรือเงื่อนไขของบริษัทอื่น',
    '2. ข้อมูลมาจาก' + SOURCE_NOTE + ' ถ้าถามถึงฉบับอื่นหรือตัวเลขวงเงินในตารางกรมธรรม์ ให้บอกว่ายังไม่มีในข้อมูล ถ้าข้อความที่ค้นเจอขัดกับสถานะในกราฟ ให้ยึดกราฟและบอกข้อสังเกต',
    '3. ตอบภาษาไทย ถ้าถามเรื่องเดียว ให้ตอบสิ่งที่ถามในประโยคแรก ตามด้วยเหตุผลสั้น ๆ รวมไม่เกิน 3 ประโยค ไม่อธิบายนิยามหรือความคุ้มครองเรื่องอื่นที่ไม่ได้ถาม ถ้าผู้ใช้ถามหรือเล่าหลายประเด็น ให้ตอบครบทุกประเด็น ประเด็นละ 1-2 ประโยค ขึ้นต้นแต่ละประเด็นด้วยหัวข้อสั้น ๆ ใช้ภาษาที่คนไม่รู้เรื่องประกันเข้าใจ ห้ามอ้างข้อย่อยอย่าง (ข) (ค) หรือศัพท์เทคนิคโดยไม่อธิบาย ไม่ต้องเขียนบรรทัดสถานะ ระบบจะแสดงสถานะจากกราฟให้เอง และคำตอบต้องสอดคล้องกับ status ที่ tool ส่งกลับมา',
    '4. ทุกข้อเท็จจริงต้องอ้างอิงข้อในกรมธรรม์ด้วยรูปแบบ [[clause_id]] เช่น [[t5_rp10_1]] ใช้เฉพาะ clause_id ที่ได้จาก tool อ้าง clause_id เดียวกันไม่เกินครั้งเดียวต่อหัวข้อ (ถ้าไม่มีหัวข้อ ไม่เกินครั้งเดียวทั้งคำตอบ) และทุกหัวข้อต้องมีการอ้างอิงของตัวเองอย่างน้อยหนึ่งครั้ง',
    '5. ถ้าข้อเท็จจริงที่ผู้ใช้เล่าตรงกับเงื่อนไขชัดเจน ให้ตอบตรง ๆ ไม่ต้องใช้คำว่า "น่าจะ" ใช้คำเลี่ยงเฉพาะเมื่อข้อมูลระบุว่าเป็นการตีความ ต้องยืนยัน หรือคำตอบขึ้นกับข้อเท็จจริงที่ผู้ใช้ยังไม่ได้บอก เฉพาะเมื่อผู้ใช้เล่าเหตุการณ์ที่เกิดขึ้นจริงกับตัวเอง (ไม่ใช่ถามว่าแผนคุ้มครองอะไร) ถ้าในข้อมูลมีสิทธิ์หรือเงื่อนไขที่เกี่ยวกับเหตุการณ์นั้นโดยตรง (เช่น ไม่ไล่เบี้ยคนที่ยืมรถไปขับ ซากแบตเตอรี่ ค่าขนย้ายรถ) ให้บอกเพิ่มไม่เกิน 2 ข้อแม้ผู้ใช้ไม่ได้ถาม',
    '5.1 ใช้คำลงท้ายแบบผู้หญิงที่สุภาพตามหลักภาษาไทย: "ค่ะ" ท้ายประโยคบอกเล่าหรือรับคำ (เช่น ไม่คุ้มครองค่ะ) "คะ" ท้ายประโยคคำถามและหลังคำว่า นะ (เช่น ต้องการทราบแผนไหนคะ, ถามแยกอีกครั้งนะคะ) ห้ามใช้ "ครับ" ไม่ต้องลงท้ายทุกประโยค ใส่เฉพาะประโยคที่พูดกับผู้ใช้โดยตรงหรือประโยคปิดท้าย ไม่ใส่ใน bullet ที่เป็นข้อเท็จจริงสั้น ๆ ใช้คำแทนตัวว่า "ดิฉัน" หรือไม่ใช้คำแทนตัวเลย ห้ามใช้ "ผม" ถ้าผู้ใช้ขอให้เลือกแผน ให้บอกว่าเลือกแผนแทนผู้ใช้ไม่ได้ แล้วสรุปความต่างที่เกี่ยวกับเรื่องที่ผู้ใช้กังวลให้แทน',
    '6. ถ้าผู้ใช้ไม่ระบุแผน ให้ใช้ compare_plans หรือถามกลับสั้น ๆ',
    '7. ไม่แนะนำให้ซื้อแผนใด และไม่ตอบเรื่องที่อยู่นอกความคุ้มครองประกันรถยนต์',
    '8. เรื่องที่ไม่ใช่ความคุ้มครองเรื่องใดเรื่องหนึ่ง เช่น ส่วนลดประวัติดี การยกเลิกและคืนเบี้ย การโอนรถ การแจ้งเคลม ให้ใช้ get_policy_terms',
    'แผน (plan id): ' + D.plans.map(p => p.id + '=' + p.name).join(', '),
    'ความคุ้มครอง (coverage id): ' + D.coverages.map(c => c.id + '=' + c.name).join(', '),
    'เงื่อนไขทั่วไป (topic id): ' + TOPICS.map(t => t.id + '=' + t.name).join(', ')
  ].join('\n');

  // ---------- rendering ----------
  const VERDICT = { 'คุ้มครอง': 'C', 'คุ้มครองแบบมีเงื่อนไข': 'K', 'ไม่คุ้มครอง': 'N', 'ต่างกันตามแผน': 'K', 'ไม่มีข้อมูล': 'K' };
  function parseAnswer(text) {
    let verdict = null, body = text.replace(/^\s+/, '');
    const m = body.match(/^\**สถานะ\**\s*[:：]\s*\**([^\n*]+)\**\s*\n?/);
    if (m) { verdict = m[1].trim(); body = body.slice(m[0].length); }
    return { verdict, body };
  }
  let allowedNow = null, chipDoc = false;
  // when an answer cites several policies, the same ref (e.g. หมวดที่ 1 ข้อ 7.1) exists in each, so prefix the plan
  const DOC_SHORT = { T1: 'ประเภท 1', T2: 'ประเภท 2', T3: 'ประเภท 3', T5: '2+/3+', T4: 'ประเภท 4', T4SG: 'ประเภท 4 ป้องกันภัย', EV1: 'EV1', EV2: 'EV2', EV3: 'EV3', CMI: 'พ.ร.บ.' };
  const chipLabel = id => { const c = D.clauses[id]; return (chipDoc ? (DOC_SHORT[c.doc] || c.doc) + ' · ' : '') + c.ref; };
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\[\[\s*([a-z0-9_]+)\s*\]\]/gi, (all, id) => D.clauses[id] && (!allowedNow || allowedNow.has(id)) ? `<button type="button" class="cchip" data-cite="${id}" title="${esc(D.docs[D.clauses[id].doc].title)}">${esc(chipLabel(id))}</button>` : '')
      .replace(/\[\[[^\]]*$/, '');
  }
  // small markdown subset: headings, bullet and numbered lists, bold, inline code
  function bodyHtml(body) {
    const out = []; let list = [], kind = null;
    const flush = () => { if (list.length) { out.push(`<${kind}>` + list.map(l => `<li>${inline(l)}</li>`).join('') + `</${kind}>`); list = []; kind = null; } };
    const push = (k, t) => { if (kind && kind !== k) flush(); kind = k; list.push(t); };
    body.split(/\n/).forEach(line => {
      const t = line.trim();
      if (/^[-•*]\s+/.test(t)) push('ul', t.replace(/^[-•*]\s+/, ''));
      else if (/^\d+[.)]\s+/.test(t)) push('ol', t.replace(/^\d+[.)]\s+/, ''));
      else if (!t || /^(-{3,}|\*{3,})$/.test(t)) flush();
      else if (/^#{1,4}\s+/.test(t)) { flush(); out.push(`<h4>${inline(t.replace(/^#{1,4}\s+/, ''))}</h4>`); }
      else { flush(); out.push(`<p>${inline(t)}</p>`); }
    });
    flush();
    return out.join('');
  }
  function renderAnswer(box, text, streaming, allowed) {
    const waiting = !text || /^Thinking/i.test(text);
    box.classList.toggle('streaming', !!streaming && !waiting);
    if (waiting) { box.innerHTML = ''; return; }
    const { body } = parseAnswer(text);
    allowedNow = allowed || walk.allowed;
    chipDoc = new Set([...body.matchAll(/\[\[\s*([a-z0-9_]+)\s*\]\]/gi)].map(m => D.clauses[m[1]] && D.clauses[m[1]].doc).filter(Boolean)).size > 1;
    box.innerHTML = bodyHtml(body);
    allowedNow = null; chipDoc = false;
    bindCites(box);
    scrollDown();
  }
  function bindCites(root) {
    root.querySelectorAll('[data-cite]').forEach(b => { if (b.dataset.bound) return; b.dataset.bound = '1'; b.addEventListener('click', () => {
      state.focus = { type: 'clause', id: b.dataset.cite };
      cy.$('.sel').removeClass('sel'); cy.getElementById('k_' + b.dataset.cite).addClass('sel');
      renderPanel(); showTab('ctx');
    }); });
  }
  // follow new text only while the reader is at the bottom; otherwise offer a jump button
  const toBottom = document.getElementById('toBottom');
  // scroll events arrive after content may have grown again, so "the reader left" means they
  // moved above the last position we auto-scrolled to, not merely "not at the bottom right now"
  let stick = true, lastAuto = 0;
  msgsEl.addEventListener('scroll', () => {
    const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 48;
    stick = atBottom || msgsEl.scrollTop >= lastAuto - 4;
    toBottom.hidden = stick;
  }, { passive: true });
  toBottom.addEventListener('click', () => msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' }));
  function scrollDown(force) {
    if (force) stick = true;
    if (stick) { msgsEl.scrollTop = msgsEl.scrollHeight; lastAuto = msgsEl.scrollTop; toBottom.hidden = true; }
    else toBottom.hidden = false;
  }
  function addMsg(cls, html) {
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html;
    msgsEl.appendChild(d); msgsEl.classList.add('has-msgs'); scrollDown(true); return d;
  }

  const ICON = {
    ai: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chev: icon('chev', 13, 'chev'),
    copy: icon('copy'), check: icon('check'), retry: icon('retry'), warn: icon('alert'), graph: icon('route'),
    trash: icon('trash'), pencil: icon('pencil'), more: icon('more'), pin: icon('pin'), unpin: icon('unpin'),
    up: icon('up_thumb', 16, 'thumb'), down: icon('down_thumb', 16, 'thumb')
  };
  // ---------- tooltips: one styled tip for every [data-tip] control (hover after a pause, or keyboard focus) ----------
  const tipEl = document.getElementById('tip');
  let tipTimer = null, tipFor = null, tipHidAt = 0;
  function showTip(el) {
    if (!el.isConnected || !el.dataset.tip) return;
    if (el.hasAttribute('data-tip-rail') && !isRail()) return;
    tipFor = el; tipEl.textContent = el.dataset.tip; tipEl.hidden = false;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x, y;
    if (el.dataset.tipSide === 'right' || el.hasAttribute('data-tip-rail')) {
      x = r.right + 8; y = r.top + (r.height - h) / 2;
      if (x + w > innerWidth - 8) { x = r.left + r.width / 2 - w / 2; y = r.bottom + 6; }
    } else {
      x = r.left + r.width / 2 - w / 2; y = r.bottom + 6;
      if (y + h > innerHeight - 8) y = r.top - h - 6;
    }
    x = Math.max(8, Math.min(x, innerWidth - w - 8));
    tipEl.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  function hideTip() {
    clearTimeout(tipTimer); tipTimer = null;
    if (tipFor) tipHidAt = Date.now();
    tipFor = null; tipEl.hidden = true;
  }
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest('[data-tip]');
    if (el === tipFor) return;
    hideTip();
    // once one tip has shown, neighbouring ones follow without the pause
    if (el) tipTimer = setTimeout(() => showTip(el), Date.now() - tipHidAt < 500 ? 40 : 500);
  });
  document.addEventListener('pointerout', e => {
    const el = e.target.closest('[data-tip]');
    if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hideTip();
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    hideTip();
    if (el && el.matches(':focus-visible')) showTip(el);
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', hideTip);

  // assistant message: avatar, folded retrieval trace, graph facts, answer, source note + actions
  function aiMsg(opts) {
    const d = document.createElement('div'); d.className = 'm-ai';
    d.innerHTML = `<div class="ai-av" aria-hidden="true">${ICON.ai}</div><div class="ai-body">`
      + `<details class="trace${opts.live ? ' live' : ''}"><summary><span class="t-label" role="status">กำลังค้นข้อในกรมธรรม์…</span>${ICON.chev}</summary><div class="trace-in"></div></details>`
      + '<div class="facts" hidden><span class="fcap">สถานะจากกราฟ</span><div class="fl"></div></div>'
      + '<div class="ans"></div>'
      + `<div class="ai-foot"><span class="src-tag">${esc(opts.note)}</span><div class="acts">`
      + `<button type="button" class="icon-btn act-copy" aria-label="คัดลอกคำตอบ" data-tip="คัดลอก">${ICON.copy}</button>`
      + (opts.retry ? `<button type="button" class="icon-btn act-retry" aria-label="ถามคำถามนี้ใหม่" data-tip="ถามใหม่">${ICON.retry}</button>` : '')
      + '</div></div></div>';
    msgsEl.appendChild(d); msgsEl.classList.add('has-msgs'); scrollDown(true);
    const q = s => d.querySelector(s);
    return { el: d, body: q('.ai-body'), trace: q('.trace'), traceIn: q('.trace-in'), facts: q('.facts'), ans: q('.ans'), t0: opts.live ? Date.now() : 0 };
  }
  const traceLabel = (m, t) => { m.trace.querySelector('.t-label').textContent = t; };
  function finishTrace(m) {
    if (!m.trace.classList.contains('live') && m.trace.dataset.done) return;
    const hits = m.traceIn.querySelectorAll('.hit').length, steps = m.traceIn.querySelectorAll('.walk > span, .gpath > li').length;
    const parts = [];
    if (hits) parts.push('ค้นพบ ' + hits + ' ข้อ');
    if (steps) parts.push('เดินกราฟ ' + steps + ' ขั้น');
    m.trace.classList.remove('live'); m.trace.open = false; m.trace.dataset.done = '1';
    if (m.t0) parts.push(((Date.now() - m.t0) / 1000).toFixed(1) + ' วินาที');
    traceLabel(m, parts.length ? parts.join(' · ') : 'ขั้นตอนการค้น');
    if (!m.traceIn.textContent.trim()) m.trace.hidden = true;
  }
  // copy button: icon turns into a check for a moment
  function bindCopy(btn, getText, label) {
    btn.addEventListener('click', () => {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(getText()).then(() => {
        hideTip();
        btn.innerHTML = ICON.check; btn.classList.add('done'); btn.setAttribute('aria-label', 'คัดลอกแล้ว'); btn.dataset.tip = 'คัดลอกแล้ว';
        setTimeout(() => { btn.innerHTML = ICON.copy; btn.classList.remove('done'); btn.setAttribute('aria-label', label); btn.dataset.tip = 'คัดลอก'; }, 1600);
      }).catch(() => {});
    });
  }
  function bindActs(m, onRetry, onGraph) {
    if (onGraph) {
      const g = document.createElement('button');
      g.type = 'button'; g.className = 'icon-btn act-graph'; g.innerHTML = ICON.graph;
      g.setAttribute('aria-label', 'ดูเส้นทางคำตอบในแผนที่ความรู้'); g.dataset.tip = 'ดูเส้นทางในแผนที่';
      g.addEventListener('click', () => { if (document.body.classList.contains('chat-wide')) setWide(false); onGraph(); if (isMobile()) setScreen('graph'); });
      m.el.querySelector('.acts').prepend(g);
    }
    bindCopy(m.el.querySelector('.act-copy'), () => m.ans.innerText.trim(), 'คัดลอกคำตอบ');
    const rt = m.el.querySelector('.act-retry');
    if (rt) { if (onRetry) rt.addEventListener('click', onRetry); else rt.remove(); }
  }
  // ask again; when the turn is the latest one, replace it instead of stacking a duplicate
  function redo(text, nodes, inHistory) {
    if (busy || !sample) return;
    nodes = nodes.filter(n => n && n.isConnected);
    if (nodes.length && nodes[nodes.length - 1] === msgsEl.lastElementChild) {
      nodes.forEach(n => n.remove());
      const h = history.length;
      if (inHistory && h >= 2 && history[h - 1].role === 'assistant' && history[h - 2].content === text) {
        history.splice(-2);
        dropLastTurn(text);
      }
    }
    ask(text);
  }

  // ---------- the user's own message: copy, or edit and ask again from that point ----------
  // pos.t = index of the turn in the saved chat, pos.h = index of its entry in `history`
  function userMsg(text, pos) {
    const d = document.createElement('div'); d.className = 'm-user';
    d.dataset.t = pos.t; d.dataset.h = pos.h;
    d.innerHTML = `<div class="u-bub">${esc(text)}</div><div class="u-acts">`
      + `<button type="button" class="icon-btn u-copy" aria-label="คัดลอกคำถาม" data-tip="คัดลอก">${ICON.copy}</button>`
      + `<button type="button" class="icon-btn u-edit" aria-label="แก้คำถามแล้วถามใหม่" data-tip="แก้แล้วถามใหม่">${ICON.pencil}</button></div>`;
    bindCopy(d.querySelector('.u-copy'), () => text, 'คัดลอกคำถาม');
    d.querySelector('.u-edit').addEventListener('click', () => editUser(d, text));
    msgsEl.appendChild(d); msgsEl.classList.add('has-msgs'); scrollDown(true);
    return d;
  }
  function editUser(d, text) {
    if (busy || !sample) return;
    msgsEl.querySelectorAll('.m-user.editing').forEach(x => x._cancel && x._cancel());
    const bub = d.querySelector('.u-bub'), acts = d.querySelector('.u-acts');
    const f = document.createElement('form'); f.className = 'u-editor';
    f.innerHTML = '<label class="sr" for="uEdit">แก้คำถาม</label><textarea id="uEdit" rows="1" maxlength="4000"></textarea>'
      + '<div class="fb-btns"><button type="button" class="btn ghost">ยกเลิก</button><button type="submit" class="btn primary">ส่ง</button></div>';
    const ta = f.querySelector('textarea'); ta.value = text;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'; };
    const cancel = () => { f.remove(); bub.hidden = false; acts.hidden = false; d.classList.remove('editing'); d._cancel = null; };
    d._cancel = cancel;
    bub.hidden = true; acts.hidden = true; d.classList.add('editing'); d.appendChild(f);
    fit(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); }
      else if (e.key === 'Escape') { e.stopPropagation(); cancel(); d.querySelector('.u-edit').focus(); }
    });
    f.querySelector('.ghost').addEventListener('click', () => { cancel(); d.querySelector('.u-edit').focus(); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = ta.value.trim();
      if (!v || busy || !sample) return;
      cutFrom(d);
      ask(v);
    });
  }
  // drop a turn and everything after it: from the thread, the model's context and the saved chat
  function cutFrom(userEl) {
    const t = +userEl.dataset.t, h = +userEl.dataset.h;
    let n = userEl;
    while (n) { const nx = n.nextElementSibling; if (n.matches('.m-user, .m-ai, .m-err')) n.remove(); n = nx; }
    if (history.length > h) history.length = h;
    if (cur && cur.turns.length > t) {
      cur.turns.length = t;
      if (!t) { chats = chats.filter(c => c !== cur); cur = null; }
      persist(); renderHistory(); syncTitle();
    }
    if (!msgsEl.querySelector('.m-user, .m-ai')) msgsEl.classList.remove('has-msgs');
  }

  // ---------- answer feedback: thumbs, and a reason form on thumbs-down; logged by the server ----------
  const FB_REASONS = [['wrong_fact', 'ข้อมูลผิด'], ['off_topic', 'ไม่ตอบสิ่งที่ถาม'], ['bad_cite', 'อ้างข้อในกรมธรรม์ไม่ตรง'],
    ['incomplete', 'ตอบไม่ครบ'], ['unclear', 'เข้าใจยากหรือยาวเกินไป'], ['other', 'อื่น ๆ']];
  // records wait here until the server has them, so feedback given while it is down is not lost
  const FBQ = 'graphrag.fbqueue.v1';
  let fbQueue = [];
  try { fbQueue = JSON.parse(localStorage.getItem(FBQ) || '[]'); if (!Array.isArray(fbQueue)) fbQueue = []; } catch (e) { fbQueue = []; }
  const saveQueue = () => { try { localStorage.setItem(FBQ, JSON.stringify(fbQueue.slice(-200))); } catch (e) {} };
  let flushing = null;
  function flushFb() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (fbQueue.length) {
        let r;
        try { r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fbQueue[0]) }); }
        catch (e) { return false; }
        if (r.status >= 500) return false;
        if (!r.ok) console.warn('feedback rejected', r.status);   // a record the server refuses would block the queue forever
        fbQueue.shift(); saveQueue();
      }
      // everything is in: any "not saved yet" note left from an earlier failure is now stale
      document.querySelectorAll('.fb-status.warn').forEach(el => { el.classList.remove('warn', 'on'); el.textContent = ''; });
      return true;
    })().finally(() => { flushing = null; });
    return flushing;
  }
  const sendFb = rec => { fbQueue.push(rec); saveQueue(); return flushFb(); };
  window.addEventListener('online', () => { if (fbQueue.length) flushFb(); });
  if (fbQueue.length) flushFb();
  function routeSummary(q) {
    try {
      const r = route(q);
      return { plans: r.plans, covs: r.covs, topics: r.topics, events: r.events, factors: r.factors, flags: r.flags, qtype: r.qtype,
        oos: r.oos ? r.oos.id + (r.oos.partial ? ':partial' : ':full') : null, vehicle: r.vehicle ? r.vehicle.cars.map(c => c.id) : [] };
    } catch (e) { return null; }
  }
  function fbRecord(turn, chat, answer) {
    const fb = turn.fb || {};
    return { fb_id: turn.fid, chat_id: chat ? chat.id : null, kind: turn.k === 'preset' ? 'preset' : turn.note === NOTE_OOS ? 'oos' : 'llm',
      rating: fb.r || null, reasons: fb.reasons || [], comment: fb.comment || '',
      question: turn.q, answer, cited: [...new Set([...answer.matchAll(/\[\[\s*([a-z0-9_]+)\s*\]\]/gi)].map(x => x[1]))],
      facts: turn.facts || [], route: routeSummary(turn.q), data_built: META.built || null, client_ts: new Date().toISOString() };
  }
  let fbSeq = 0;
  function bindFb(m, turn, answer) {
    if (!turn) return;
    const chat = cur;
    if (!turn.fid) { turn.fid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); persist(); }
    const acts = m.el.querySelector('.acts');
    acts.insertAdjacentHTML('beforeend', '<span class="sep" aria-hidden="true"></span>'
      + `<button type="button" class="icon-btn fb-btn fb-up" aria-pressed="false" aria-label="ตอบถูกและตรงคำถาม" data-tip="ตอบถูกและตรงคำถาม">${ICON.up}</button>`
      + `<button type="button" class="icon-btn fb-btn fb-down" aria-pressed="false" aria-label="ตอบไม่ถูกหรือไม่ตรงคำถาม" data-tip="ตอบไม่ถูกหรือไม่ตรง">${ICON.down}</button>`);
    const up = acts.querySelector('.fb-up'), dn = acts.querySelector('.fb-down');
    const status = document.createElement('p'); status.className = 'fb-status'; status.setAttribute('role', 'status');
    m.body.appendChild(status);
    let form = null;
    const sync = () => { const r = turn.fb && turn.fb.r; up.setAttribute('aria-pressed', r === 'up'); dn.setAttribute('aria-pressed', r === 'down'); };
    const say = html => { status.innerHTML = html; status.classList.toggle('on', !!html); };
    const commit = thanks => {
      persist();
      sendFb(fbRecord(turn, chat, answer)).then(ok => {
        if (!ok) { say(`${ICON.warn}<span>ยังบันทึกไม่ได้ เพราะเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ระบบจะส่งให้อีกครั้งเอง</span>`); status.classList.add('warn'); return; }
        status.classList.remove('warn');
        if (!thanks) { say(''); return; }
        say(`${ICON.check}<span>บันทึกแล้ว ขอบคุณ</span><button type="button" class="linkbtn">แก้ไข</button>`);
        status.querySelector('.linkbtn').addEventListener('click', () => { say(''); openForm(); });
      });
    };
    function closeForm() { if (form) { form.remove(); form = null; } }
    function openForm() {
      closeForm(); say('');
      const fb = turn.fb || {}, id = 'fbh' + (++fbSeq);
      form = document.createElement('form'); form.className = 'fb-form';
      form.innerHTML = `<p class="fb-h" id="${id}">อะไรที่ไม่ถูกต้อง<span>เลือกได้หลายข้อ</span></p>`
        + `<div class="fb-chips" role="group" aria-labelledby="${id}">${FB_REASONS.map(([k, l]) => `<button type="button" class="chip" data-r="${k}" aria-pressed="${(fb.reasons || []).includes(k)}">${l}</button>`).join('')}</div>`
        + `<label class="sr" for="${id}t">รายละเอียด</label><textarea id="${id}t" rows="2" maxlength="2000" placeholder="ผิดตรงไหน หรือที่ถูกควรตอบว่าอะไร (ไม่บังคับ)"></textarea>`
        + '<div class="fb-btns"><button type="button" class="btn ghost">ข้าม</button><button type="submit" class="btn primary">ส่ง</button></div>';
      form.querySelector('textarea').value = fb.comment || '';
      form.querySelector('.fb-chips').addEventListener('click', e => {
        const c = e.target.closest('.chip'); if (c) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true');
      });
      const skip = () => { closeForm(); dn.focus(); };
      form.querySelector('.ghost').addEventListener('click', skip);
      form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); skip(); } });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const reasons = [...form.querySelectorAll('.chip[aria-pressed="true"]')].map(c => c.dataset.r);
        turn.fb = { r: 'down', reasons, comment: form.querySelector('textarea').value.trim() };
        closeForm(); dn.focus(); commit(true);
      });
      status.before(form);
      form.querySelector('.chip').focus({ preventScroll: true });
      form.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    sync();
    up.addEventListener('click', () => {
      turn.fb = turn.fb && turn.fb.r === 'up' ? null : { r: 'up' };
      closeForm(); say(''); sync(); commit(false);
    });
    dn.addEventListener('click', () => {
      if (turn.fb && turn.fb.r === 'down') { turn.fb = null; closeForm(); say(''); sync(); commit(false); return; }
      turn.fb = { r: 'down' }; sync(); commit(false); openForm();   // the rating counts even if the form is skipped
    });
  }

  // ---------- chat history: kept in this browser only ----------
  const STORE = 'graphrag.chats.v1', MAX_CHATS = 50, UI_STORE = 'graphrag.ui.v1';
  const $ = id => document.getElementById(id);
  const asideEl = $('aside'), histEl = $('hist'), histList = $('histList'), historyBtn = $('historyBtn');
  const histQ = $('histQ'), histMenu = $('histMenu'), histScrim = $('histScrim'), histToggle = $('histToggle'), chatTitleEl = $('chatTitle'), crumbEl = $('crumb');
  let chats = [], cur = null, chatGen = 0, canStore = true;
  try { chats = JSON.parse(localStorage.getItem(STORE) || '[]'); if (!Array.isArray(chats)) chats = []; } catch (e) { chats = []; canStore = false; }
  let uiPrefs = {};
  try { uiPrefs = JSON.parse(localStorage.getItem(UI_STORE) || '{}') || {}; } catch (e) { uiPrefs = {}; }
  const saveUi = () => { try { localStorage.setItem(UI_STORE, JSON.stringify(uiPrefs)); } catch (e) {} };
  function persist() {
    // pinned chats are never the ones dropped to stay under the cap
    chats.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
    chats = chats.slice(0, Math.max(MAX_CHATS, chats.filter(c => c.pinned).length));
    if (!canStore) return;
    // if the browser's quota is full, give up the oldest conversations rather than the new one
    for (;;) {
      try { localStorage.setItem(STORE, JSON.stringify(chats)); return; }
      catch (e) { if (chats.length > 1) { chats.pop(); continue; } canStore = false; return; }
    }
  }
  function saveTurn(turn) {
    if (!cur) {
      cur = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: quickTitle(turn.q), created: Date.now(), updated: 0, turns: [] };
      chats.unshift(cur);
    }
    cur.turns.push(turn); cur.updated = Date.now();
    persist(); renderHistory(); syncTitle();
    autoTitle(cur);
    return turn;
  }

  // ---------- chat titles: a short name at once, then a better one from Claude once the first answer is in ----------
  const wordSeg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  // cut at a word boundary; Thai runs words together, so a plain slice would split one in half
  function clip(s, n) {
    if (s.length <= n) return s;
    if (!wordSeg) return s.slice(0, n).trim();
    let out = '';
    for (const { segment } of wordSeg.segment(s)) { if ((out + segment).length > n) break; out += segment; }
    return out.trim() || s.slice(0, n).trim();
  }
  // the question itself, minus greetings, polite endings and punctuation
  function quickTitle(q) {
    const raw = String(q || '').replace(/\s+/g, ' ').trim();
    const s = raw.replace(/^(สวัสดี(ครับ|ค่ะ|คะ)?|ขอ(สอบ)?ถาม(หน่อย)?(ครับ|ค่ะ|คะ)?|รบกวน(สอบ)?ถาม(ครับ|ค่ะ|คะ)?)\s*/u, '')
      .replace(/(\s|ครับ|คับ|ค่ะ|คะ|จ้า|จ้ะ|นะ|หน่อย|[?？!.…])+$/u, '');
    return clip(s || raw, 36) || 'แชทใหม่';
  }
  const TITLE_PROMPT = 'ตั้งชื่อแชทนี้เป็นภาษาไทยสั้น ๆ 2–6 คำ ไม่เกิน 32 ตัวอักษร ให้อ่านแล้วรู้ทันทีว่าคุยเรื่องอะไร\n'
    + '- ถ้าคำถามระบุแผนหรือรถ ให้ใส่ไว้ เช่น "ชั้น 3", "ชั้น 2+", "EV ชั้น 1", "พ.ร.บ."\n'
    + '- ใส่เหตุการณ์หรือเรื่องหลักแบบกระชับ เช่น "ชนเสาไม่มีคู่กรณี", "น้ำท่วม", "เพื่อนยืมรถไปชน", "ยกเลิกกรมธรรม์"\n'
    + '- ตัวอย่างชื่อที่ดี: "ชั้น 3 ชนเสาไม่มีคู่กรณี", "ชั้น 2+ น้ำท่วม", "เมาแล้วขับชนคนอื่น", "EV เปลี่ยนแบตหลังชน"\n'
    + 'ห้ามมีคำลงท้าย เครื่องหมายคำถาม เครื่องหมายคำพูด หรือคำอธิบาย ตอบเป็นชื่ออย่างเดียวบรรทัดเดียว';
  function cleanTitle(t) {
    let s = String(t || '').split('\n').map(x => x.trim()).find(Boolean) || '';
    s = s.replace(/^(ชื่อ(แชท|หัวข้อ)?|หัวข้อ|title)\s*[:：]\s*/iu, '').replace(/[*_`#"“”'‘’«»]/g, '')
      .replace(/[\s?？!.。,:;]+$/u, '').trim();
    return s.length >= 2 ? clip(s, 40) : '';
  }
  // once per chat, unless the user named it; a chat that opened with a greeting waits for its first real question
  function autoTitle(c) {
    if (!sample || !c || c.named || c.titled) return;
    const t = c.turns.find(x => x.k === 'preset' || x.note !== NOTE_OOS);
    if (!t) return;
    c.titled = true;
    const ans = t.k === 'preset' ? ((D.questions.find(x => x.id === t.id) || {}).answer || '') : (t.a || '');
    const prompt = TITLE_PROMPT + '\n\nคำถาม: ' + t.q + '\n\nคำตอบ: ' + clip(ans.replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim(), 600);
    sample([{ role: 'user', content: prompt }], { effort: 'low', cache: false, modelTier: 'default' }).then(r => {
      const v = cleanTitle(r && r.text);
      // a rename in progress wins; so does one finished while we waited
      if (!v || c.named || !chats.includes(c) || document.querySelector('input.rename')) return;
      c.title = v; persist(); renderHistory(); syncTitle();
    }).catch(() => { c.titled = false; });
  }
  function dropLastTurn(q) {
    if (!cur || !cur.turns.length || cur.turns[cur.turns.length - 1].q !== q) return;
    cur.turns.pop();
    if (!cur.turns.length) { chats = chats.filter(c => c !== cur); cur = null; }
    persist(); renderHistory(); syncTitle();
  }
  const DAY = 864e5;
  function whenLabel(t) {
    const d = new Date(t), start = new Date(); start.setHours(0, 0, 0, 0);
    return t >= start.getTime() ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
  function groupOf(t) {
    const start = new Date(); start.setHours(0, 0, 0, 0); const s = start.getTime();
    return t >= s ? 'วันนี้' : t >= s - DAY ? 'เมื่อวาน' : t >= s - 7 * DAY ? '7 วันที่ผ่านมา' : 'เก่ากว่านั้น';
  }
  const hl = (s, q) => {
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
  };
  const qSnippet = (s, q) => { const a = Math.max(0, s.toLowerCase().indexOf(q.toLowerCase()) - 14); return (a ? '…' : '') + s.slice(a, a + 80); };
  function itemHtml(c, inner) {
    const on = cur && cur.id === c.id;
    return `<li class="hist-item${on ? ' on' : ''}"><button type="button" class="hist-link" data-id="${c.id}"${on ? ' aria-current="page"' : ''}`
      + ` data-tip="${c.turns.length} คำถาม · ${whenLabel(c.updated)}" data-tip-side="right">${inner}</button>`
      + `<button type="button" class="icon-btn hist-more" data-more="${c.id}" aria-haspopup="menu" aria-expanded="false" aria-label="ตัวเลือกของแชท ${esc(c.title)}">${ICON.more}</button></li>`;
  }
  function renderHistory() {
    closeMenu();
    const q = histQ.value.trim();
    if (q) {
      const res = chats.map(c => {
        if (c.title.toLowerCase().includes(q.toLowerCase())) return { c, hit: null };
        const t = c.turns.find(x => (x.q || '').toLowerCase().includes(q.toLowerCase()));
        return t ? { c, hit: t.q } : null;
      }).filter(Boolean);
      histList.innerHTML = res.length
        ? `<h3 class="hist-g">พบ ${res.length} แชท</h3><ul>` + res.map(({ c, hit }) => itemHtml(c, `<span class="hi-t">${hl(c.title, q)}</span>`
          + (hit ? `<span class="hi-s">${hl(qSnippet(hit, q), q)}</span>` : ''))).join('') + '</ul>'
        : `<p class="hist-empty">ไม่พบแชทที่มีคำว่า “${esc(q)}”</p>`;
      return;
    }
    if (!chats.length) {
      histList.innerHTML = `<p class="hist-empty">${canStore ? 'ยังไม่มีประวัติ คำถามที่ถามจะเก็บไว้ที่นี่' : 'เบราว์เซอร์นี้ไม่อนุญาตให้เก็บประวัติ แชทยังใช้ได้ตามปกติ'}</p>`;
      return;
    }
    let html = '', g = null;
    [...chats.filter(c => c.pinned), ...chats.filter(c => !c.pinned).sort((a, b) => b.updated - a.updated)].forEach(c => {
      const gg = c.pinned ? 'ปักหมุด' : groupOf(c.updated);
      if (gg !== g) { html += (g ? '</ul>' : '') + `<h3 class="hist-g">${gg}</h3><ul>`; g = gg; }
      html += itemHtml(c, `<span class="hi-t">${esc(c.title)}</span>`);
    });
    histList.innerHTML = html + '</ul>';
  }
  // the open chat's name, after the app name in the top bar (chat-only mode); it opens the same menu as the row's ⋯
  function syncTitle() {
    crumbEl.hidden = !cur;
    chatTitleEl.querySelector('.ct-t').textContent = cur ? cur.title : '';
    chatTitleEl.setAttribute('aria-label', cur ? 'ตัวเลือกของแชท ' + cur.title : '');
  }
  function resetThread() {
    msgsEl.querySelectorAll('.m-user, .m-ai, .m-err').forEach(n => n.remove());
    msgsEl.classList.remove('has-msgs');
    stick = true; lastAuto = 0; toBottom.hidden = true; msgsEl.scrollTop = 0;
    history.length = 0;
  }
  function newChat() {
    if (busy) busy.abort();
    chatGen++; cur = null;
    resetThread(); renderHistory(); syncTitle(); closeSheet(); showTab('chat');
    if (sample && !isMobile()) input.focus();
  }
  // rebuild a saved conversation; the model's context comes back with it so the chat can continue
  function openChat(id) {
    const c = chats.find(x => x.id === id);
    if (!c) return;
    if (busy) busy.abort();
    chatGen++; resetThread(); cur = c;
    c.turns.forEach((t, i) => {
      if (t.k === 'preset') {
        const q = D.questions.find(x => x.id === t.id);
        if (!q) return;
        const { m, txt } = presetTurn(q, { t: i, h: history.length });
        history.push({ role: 'user', content: q.label }, { role: 'assistant', content: txt });
        bindFb(m, t, txt);
      } else {
        restoreTurn(t, i);
        history.push({ role: 'user', content: t.q }, { role: 'assistant', content: t.a });
      }
    });
    renderHistory(); syncTitle(); closeSheet(); showTab('chat');
    scrollDown(true);
    // chats saved before titles were generated get a short one the first time they are opened
    autoTitle(c);
  }
  function restoreTurn(t, i) {
    const userEl = userMsg(t.q, { t: i, h: history.length });
    const m = aiMsg({ retry: true, note: t.note || 'สถานะและข้อที่อ้างอิงมาจากกราฟ ถ้อยคำเรียบเรียงโดย AI' });
    m.traceIn.innerHTML = t.trace || '';
    (t.facts || []).forEach(f => {
      const sp = document.createElement('span'); sp.className = 'pill ' + f.s; sp.dataset.k = f.t; sp.textContent = f.t + ': ' + STATUS[f.s];
      m.facts.querySelector('.fl').appendChild(sp); m.facts.hidden = false;
    });
    renderAnswer(m.ans, t.a, false, new Set(t.allowed || []));
    m.trace.dataset.done = '1'; traceLabel(m, t.tl || 'ขั้นตอนการค้น');
    if (!m.traceIn.textContent.trim()) m.trace.hidden = true;
    bindCites(m.el);
    bindActs(m, () => redo(t.q, [userEl, m.el], true), t.path ? () => { chatTrace = t.path; traceSeq++; runQuestion(t.path); } : null);
    bindFb(m, t, t.a);
  }
  function deleteChat(id) {
    chats = chats.filter(c => c.id !== id);
    persist();
    if (cur && cur.id === id) { if (busy) busy.abort(); chatGen++; cur = null; resetThread(); }
    renderHistory(); syncTitle();
  }

  // rename in place: the row (or the title above the thread) becomes a text field
  function startRename(c, host) {
    if (!host) return;
    const inp = document.createElement('input');
    inp.className = 'rename'; inp.value = c.title; inp.maxLength = 120; inp.setAttribute('aria-label', 'ชื่อแชท');
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (save && v && v !== c.title) { c.title = v; c.named = true; persist(); }
      const wasTitle = host === chatTitleEl;
      inp.replaceWith(host); renderHistory(); syncTitle();
      const back = wasTitle ? chatTitleEl : histList.querySelector(`.hist-link[data-id="${c.id}"]`);
      if (back) back.focus();
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    host.replaceWith(inp);
    inp.focus(); inp.select();
  }
  chatTitleEl.addEventListener('click', () => { if (cur) openMenu(chatTitleEl); });

  // the ⋯ menu of a chat row: pin, rename, delete (delete asks a second click)
  let menuChat = null, menuBtn = null;
  function openMenu(btn) {
    if (menuBtn === btn) { closeMenu(true); return; }
    closeMenu();
    const c = btn === chatTitleEl ? cur : chats.find(x => x.id === btn.dataset.more);
    if (!c) return;
    menuChat = c; menuBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    if (btn.closest('.hist-item')) btn.closest('.hist-item').classList.add('menu-on');
    const pin = histMenu.querySelector('[data-act="pin"]');
    pin.querySelector('.i').outerHTML = c.pinned ? ICON.unpin : ICON.pin;
    pin.querySelector('.mi-l').textContent = c.pinned ? 'เลิกปักหมุด' : 'ปักหมุด';
    const del = histMenu.querySelector('[data-act="delete"]');
    del.classList.remove('confirm'); del.querySelector('.mi-l').textContent = 'ลบ';
    histMenu.hidden = false;
    const r = btn.getBoundingClientRect(), w = histMenu.offsetWidth, h = histMenu.offsetHeight;
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = r.top - h - 4;
    histMenu.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    histMenu.style.top = Math.max(8, top) + 'px';
    histMenu.querySelector('.menu-item').focus();
  }
  function closeMenu(refocus) {
    if (histMenu.hidden) return;
    histMenu.hidden = true;
    const btn = menuBtn; menuChat = null; menuBtn = null;
    if (btn) { btn.setAttribute('aria-expanded', 'false'); const it = btn.closest('.hist-item'); if (it) it.classList.remove('menu-on'); if (refocus && btn.isConnected) btn.focus(); }
  }
  histMenu.addEventListener('click', e => {
    const it = e.target.closest('[data-act]'); if (!it || !menuChat) return;
    const c = menuChat, fromTitle = menuBtn === chatTitleEl;
    const row = () => histList.querySelector(`.hist-link[data-id="${c.id}"]`);
    if (it.dataset.act === 'pin') {
      c.pinned = !c.pinned; persist(); renderHistory();
      const l = fromTitle ? chatTitleEl : row(); if (l) l.focus();
    } else if (it.dataset.act === 'rename') {
      closeMenu(); startRename(c, fromTitle ? chatTitleEl : row());
    } else if (!it.classList.contains('confirm')) {
      it.classList.add('confirm'); it.querySelector('.mi-l').textContent = 'กดอีกครั้งเพื่อลบ';
    } else {
      closeMenu(); deleteChat(c.id);
      (fromTitle && sample ? input : histList.querySelector('.hist-link') || histQ).focus();
    }
  });
  histMenu.addEventListener('keydown', e => {
    const items = [...histMenu.querySelectorAll('.menu-item')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu();
  });
  document.addEventListener('pointerdown', e => { if (!histMenu.hidden && !e.target.closest('#histMenu, .hist-more, #chatTitle')) closeMenu(); });
  histList.addEventListener('scroll', () => closeMenu(), { passive: true });

  histList.addEventListener('click', e => {
    const more = e.target.closest('.hist-more');
    if (more) { hideTip(); openMenu(more); return; }
    const link = e.target.closest('.hist-link');
    if (link) openChat(link.dataset.id);
  });
  // arrow keys walk the rows; from the first row, up goes back to the search field
  histList.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = [...histList.querySelectorAll('.hist-link')], i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) histQ.focus(); else if (links[i + (e.key === 'ArrowDown' ? 1 : -1)]) links[i + (e.key === 'ArrowDown' ? 1 : -1)].focus();
  });
  histQ.addEventListener('input', renderHistory);
  histQ.addEventListener('keydown', e => {
    const first = histList.querySelector('.hist-link');
    if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
    else if (e.key === 'Enter' && first && histQ.value.trim()) { e.preventDefault(); openChat(first.dataset.id); }
    else if (e.key === 'Escape' && histQ.value) { e.stopPropagation(); histQ.value = ''; renderHistory(); }
  });
  histQ.closest('.hist-find').addEventListener('click', e => {
    if (!isRail()) return;
    e.preventDefault(); setRail(false); histQ.focus();
  });

  // where the list lives: a panel that slides out beside the chat panel, over the matrix/graph (split view);
  // a sidebar that folds to a rail (chat-only mode); a sheet from the left with a scrim (phones)
  const isWide = () => document.body.classList.contains('chat-wide');
  const isRail = () => isWide() && document.body.classList.contains('hist-rail');
  const mHist = $('mHist');
  function syncHistBtns() {
    const open = asideEl.classList.contains('hist-shown');
    historyBtn.setAttribute('aria-expanded', String(open)); mHist.setAttribute('aria-expanded', String(open));
    const lbl = open ? 'ซ่อนประวัติแชท' : 'แสดงประวัติแชท';
    historyBtn.setAttribute('aria-label', lbl); historyBtn.dataset.tip = lbl;
  }
  function setRail(on) {
    document.body.classList.toggle('hist-rail', on);
    uiPrefs.rail = on; saveUi();
    histToggle.setAttribute('aria-expanded', String(!on));
    const lbl = on ? 'กางแถบประวัติแชท' : 'พับแถบประวัติแชท';
    histToggle.setAttribute('aria-label', lbl); histToggle.dataset.tip = on ? 'กางแถบ' : 'พับแถบ';
    hideTip(); closeMenu();
  }
  setRail(!!uiPrefs.rail);
  histToggle.addEventListener('click', () => setRail(!document.body.classList.contains('hist-rail')));
  // quiet: restore the panel without moving focus; keep: hide it without forgetting that the user wants it open
  function openHist(focusSearch, quiet) {
    if (isWide()) { if (isRail()) setRail(false); }
    else {
      asideEl.classList.add('hist-shown'); histScrim.hidden = !isMobile();
      if (!isMobile() && !quiet) { uiPrefs.hist = true; saveUi(); }
      syncHistBtns();
    }
    if (quiet) return;
    const first = histList.querySelector('[aria-current="page"]') || histList.querySelector('.hist-link') || $('histNew');
    (focusSearch ? histQ : first).focus({ preventScroll: true });
  }
  function closeHist(refocus, keep) {
    closeMenu();
    if (!asideEl.classList.contains('hist-shown')) return;
    asideEl.classList.remove('hist-shown'); histScrim.hidden = true;
    if (!isMobile() && !keep) { uiPrefs.hist = false; saveUi(); }
    syncHistBtns();
    if (refocus) (isMobile() ? mHist : historyBtn).focus();
  }
  // picking or starting a chat closes the phone sheet; the panel beside the chat stays until it is put away
  function closeSheet() { if (isMobile()) closeHist(); }
  const toggleHist = () => asideEl.classList.contains('hist-shown') ? closeHist(true) : openHist();
  historyBtn.addEventListener('click', toggleHist);
  mHist.addEventListener('click', toggleHist);
  $('mNew').addEventListener('click', () => newChat());
  $('histClose').addEventListener('click', () => closeHist(true));
  if (uiPrefs.hist && !isMobile()) openHist(false, true);
  syncHistBtns();
  mqMobile.addEventListener('change', e => {
    if (e.matches) { closeHist(false, true); setScreen(chatPane.hidden ? 'ctx' : 'chat'); }
    else {
      if (uiPrefs.hist && !isWide()) openHist(false, true);
      if (view === 'graph') { cy.resize(); fitView(false); }
    }
  });
  histScrim.addEventListener('click', () => closeHist(true));
  $('histNew').addEventListener('click', newChat);
  histEl.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeHist(true); } });
  // on the small-screen sheet, a swipe to the left closes it
  let swipeX = null;
  histEl.addEventListener('touchstart', e => { swipeX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  histEl.addEventListener('touchend', e => {
    if (swipeX !== null && e.changedTouches[0].clientX - swipeX < -60 && getComputedStyle(histEl).position === 'fixed') closeHist(true);
    swipeX = null;
  }, { passive: true });
  // shortcuts as in the well-known chat apps: Ctrl/Cmd+K search chats, Ctrl/Cmd+Shift+O new chat
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'k' && !e.shiftKey) { e.preventDefault(); showTab('chat'); openHist(true); }
    else if (k === 'o' && e.shiftKey) { e.preventDefault(); newChat(); }
  });
  renderHistory(); syncTitle();


  // ---------- answer path for the graph ----------
  function answerPaths(text) {
    const cited = [...new Set([...text.matchAll(/\[\[\s*([a-z0-9_]+)\s*\]\]/gi)].map(m => m[1]).filter(k => D.clauses[k] && walk.allowed.has(k)))];
    const paths = [];
    walk.grants.forEach(([p, c]) => {
      const g = D.grants[p][c];
      let found = false;
      cited.forEach(k => {
        if (g.clauses.includes(k)) { paths.push([p, c, k]); found = true; }
        g.details.forEach(d => {
          const det = D.details[d];
          if (!det.clauses.includes(k)) return;
          found = true;
          if (det.exceptionOf && g.details.includes(det.exceptionOf)) paths.push([p, c, det.exceptionOf, d, k]);
          else paths.push([p, c, d, k]);
        });
      });
      if (!found) {
        const why = g.details.filter(d => D.details[d].kind === 'why');
        paths.push(why.length ? [p, c, why[0], ...D.details[why[0]].clauses.slice(0, 1)] : [p, c]);
      }
    });
    const seen = new Set(), uniq = xs => xs.filter(x => { const k = x.join('>'); if (seen.has(k)) return false; seen.add(k); return true; });
    const main = uniq(paths);
    // where the question entered: car -> plan, event -> coverage, factor -> a detail on the path (only what connects)
    const E = walk.entries || { cars: [], events: [], factors: [] };
    const plansOn = [...new Set(main.map(x => x[0]))], covsOn = [...new Set(main.map(x => x[1]))], detsOn = new Set(main.flatMap(x => x.slice(2)));
    const before = [...E.cars.flatMap(v => plansOn.map(p => ['en:veh:' + v, p])),
      ...E.events.flatMap(e => (D.events.find(x => x.id === e).covs || []).filter(c => covsOn.includes(c)).map(c => ['en:evt:' + e, c]))];
    const after = E.factors.flatMap(f => D.factors.find(x => x.id === f).details.filter(d => detsOn.has(d)).slice(0, 2).map(d => ['en:fac:' + f, d]));
    return { cited, paths: main.length ? [...uniq(before), ...main, ...uniq(after)] : main };
  }

  // ---------- preset (deterministic) answers for the demo buttons ----------
  function presetAnswer(q) {
    if (busy) busy.abort();
    showTab('chat');
    const { userEl, m, txt } = presetTurn(q, { t: cur ? cur.turns.length : 0, h: history.length });
    history.push({ role: 'user', content: q.label }, { role: 'assistant', content: txt });
    bindFb(m, saveTurn({ k: 'preset', id: q.id, q: q.label }), txt);
    runQuestion(q);
    // the whole answer arrives at once: start reading from the question, not the end of the answer
    msgsEl.scrollTop = userEl.offsetTop - 16;
  }
  // builds the preset exchange in the thread; used for a fresh click and for restoring history
  function presetTurn(q, pos) {
    const userEl = userMsg(q.label, pos);
    const facts = q.grants.map(([p, c]) => { const st = D.grants[p][c].s; return `<span class="pill ${st}">${esc(plan(p).name + ' / ' + cov(c).name)}: ${STATUS[st]}</span>`; }).join('');
    const r = bm25(q.label, { docs: [...new Set(q.grants.map(g => plan(g[0]).doc))], top: 3 });
    markHits(r.hits);
    const m = aiMsg({ note: 'คำตอบที่ตั้งไว้ล่วงหน้าจากกราฟ ได้ผลเหมือนเดิมทุกครั้ง ไม่ใช้ LLM' });
    m.traceIn.innerHTML = `<div class="stage">ขั้นที่ 1 ค้นข้อความ</div>${hitsHtml(r)}<div class="stage">ขั้นที่ 2 เดินในกราฟจากแผนและเรื่องที่ถาม</div>${pathListHtml(q.paths)}`;
    m.facts.querySelector('.fl').innerHTML = facts; m.facts.hidden = false;
    if (q.textOnly) m.ans.insertAdjacentHTML('afterend', `<div class="textonly"><b>ถ้าใช้แค่การค้นข้อความ</b>${esc(q.textOnly)}</div>`);
    const txt = q.answer + ' ' + q.cite.map(k => '[[' + k + ']]').join(' ') + (q.contrast ? '\n\n' + q.contrast : '');
    renderAnswer(m.ans, txt, false, new Set(q.cite));
    finishTrace(m); bindCites(m.el); bindActs(m, null, () => runQuestion(q));
    return { userEl, m, txt };
  }

  // ---------- ask ----------
  function syncSend() { sendBtn.disabled = !sample || (!busy && !input.value.trim()); }
  function setBusy(on) {
    input.disabled = on || !sample;
    sendBtn.classList.toggle('stop', on);
    sendBtn.setAttribute('aria-label', on ? 'หยุดตอบ' : 'ส่ง');
    sendBtn.dataset.tip = on ? 'หยุดตอบ' : 'ส่ง (Enter)';
    syncSend();
  }
  // composer grows with the text up to its max-height, then scrolls
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    input.style.overflowY = input.scrollHeight > 200 ? 'auto' : 'hidden';
  }
  input.addEventListener('input', () => { autosize(); syncSend(); });
  // ---------- page-side retrieval (works on every viewer, one Claude call) ----------
  const run = (name, args) => TOOLS.find(t => t.name === name).execute(args);
  // B19 (ingest/interp_review.py): a reading accepted or confirmed is answered directly; "keep" still says what it depends on
  const needsConfirm = n => n.interp && (n.interp_status === 'keep' || !n.interp_status) ? (n.interp_note || n.interp) : null;
  function retrieve(text) {
    const R = route(text), { plans: plansIn, covs: covsIn, topics: topicsIn, flags, vehicle } = R;
    const ctx = {};
    // phase B nodes: keep only what belongs to the plans asked about (all plans when none is named)
    const docsIn = plansIn.length ? new Set(plansIn.map(p => plan(p).doc)) : null;
    const inDocs = k => !docsIn || docsIn.has(D.clauses[k].doc);
    const clausesOf = (ks, n) => { const out = ks.filter(inDocs).slice(0, n); allowClauses(out); return out.map(clauseOut); };
    const detailsOf = ids => ids.filter(id => D.details[id] && D.details[id].clauses.some(inDocs)).slice(0, 8)
      .map(id => { allowClauses(D.details[id].clauses.filter(inDocs)); return detailOut(id); });
    const scen = [...R.events.map(id => ['เหตุการณ์', D.events.find(e => e.id === id)]), ...R.factors.map(id => ['ปัจจัย', D.factors.find(f => f.id === id)])];
    if (scen.length) {
      ctx.scenario = scen.slice(0, 4).map(([kind, n]) => ({ kind, type: n.type || 'event', name: n.name, description: n.desc,
        needs_confirmation: needsConfirm(n), related: detailsOf(n.details), clauses: clausesOf(n.clauses, 3) }));
      walkStep('เข้าใจเหตุการณ์: ' + scen.map(([, n]) => n.name).join(', '));
    }
    if (R.definitions.length) ctx.definitions = R.definitions.slice(0, 3).map(id => { const d = D.definitions.find(x => x.id === id);
      return { term: d.term, description: d.desc, needs_confirmation: needsConfirm(d), clauses: clausesOf(d.clauses, 2) }; });
    if (R.deadlines) ctx.deadlines = D.deadlines.filter(d => d.clauses.some(inDocs)).map(d => ({ kind: d.kind, who: d.who, when: d.when, what: d.what,
      note: d.note || null, clauses: clausesOf(d.clauses, 1) }));
    if (R.recovery) ctx.recovery = D.recovery.filter(r => r.clauses.some(inDocs)).map(r => ({ name: r.name, direction: r.dir, description: r.desc,
      clauses: clausesOf(r.clauses, 1) }));
    if (vehicle) {
      ctx.vehicle = vehicle;
      const k = vehicle.definition_clause;
      // cite the EV definition whenever the car decides (or may decide) which wording applies
      if (k && (flags.includes('not_bev') || flags.includes('ask_vehicle') || vehicle.cars.length)) { ctx.vehicle.definition = clauseOut(k); allowClauses([k]); }
      const car = vehicle.cars.map(c => c.name).join(', ') || (vehicle.unknown_words.length ? vehicle.unknown_words.join(' ') + ' (ไม่รู้จัก)' : 'รถ');
      walkStep('ระบุรถ: ' + car + (vehicle.electric === true ? ' → รถไฟฟ้าล้วน ใช้เงื่อนไข EV' : vehicle.electric === false ? ' → ไม่ใช่รถไฟฟ้าล้วน ใช้เงื่อนไขปกติ' : ' → ยังไม่รู้ว่าเป็นรถไฟฟ้าล้วนหรือไม่'));
    }
    if (flags.length) ctx.flags = flags;
    if (R.qtype.length) ctx.question_type = R.qtype;
    // only part of the question is outside the data (a fully out-of-scope one never reaches here, see ask())
    if (R.oos) {
      const o = D.out_of_scope.find(x => x.id === R.oos.id);
      ctx.out_of_scope = { kind: o.kind, topic: o.name, note: o.reply.split('\n')[0] };
      walkStep('ส่วนที่อยู่นอกข้อมูล: ' + o.name);
    }
    walk.entries = { cars: vehicle ? vehicle.cars.map(c => c.id) : [], events: R.events, factors: R.factors };
    ctx.text_hits = run('search_chunks', { query: text, plan: plansIn.length === 1 ? plansIn[0] : undefined, plans: plansIn }).hits;
    const covLinks = h => (h.graph_links || []).filter(l => l.coverage_id);
    let grants = [];
    // coverage-major: if the cap below cuts anything, whole comparisons survive and every named plan keeps some coverages
    if (plansIn.length && covsIn.length) covsIn.forEach(c => plansIn.forEach(p => grants.push([p, c])));
    else if (plansIn.length && !topicsIn.length) {
      ctx.plan_overview = plansIn.map(p => run('get_plan_overview', { plan: p }));
      ctx.text_hits.forEach(h => covLinks(h).forEach(l => { if (plansIn.includes(l.plan_id)) grants.push([l.plan_id, l.coverage_id]); }));
    } else if (covsIn.length) {
      ctx.comparisons = covsIn.map(c => run('compare_plans', { coverage: c }));
    } else if (!topicsIn.length && ctx.text_hits[0] && covLinks(ctx.text_hits[0]).length && covLinks(ctx.text_hits[0]).length <= 3) {
      covLinks(ctx.text_hits[0]).forEach(l => grants.push([l.plan_id, l.coverage_id]));
    }
    // general terms (discounts, cancellation, transfer ...): one plan if named, else every plan grouped by wording
    if (topicsIn.length) ctx.policy_terms = topicsIn.slice(0, 3).flatMap(t => plansIn.length
      ? plansIn.map(p => run('get_policy_terms', { topic: t, plan: p }))
      : [run('get_policy_terms', { topic: t })]);
    const seen = new Set();
    grants = grants.filter(([p, c]) => { const k = p + c; if (seen.has(k)) return false; seen.add(k); return true; });
    // 9 = 3 plans x 3 coverages (~21k chars of context); anything beyond is listed so the model does not read it as missing data
    // other paths guess pairs from text hits, so keep them small
    const explicit = plansIn.length && covsIn.length, cap = explicit ? 9 : 4;
    if (explicit && grants.length > cap) ctx.omitted = grants.slice(cap).map(([p, c]) => plan(p).name + ' / ' + cov(c).name);
    grants = grants.slice(0, cap);
    ctx.graph_facts = grants.map(([p, c]) => run('get_coverage', { plan: p, coverage: c }));
    return { ctx, linked: plansIn.length + covsIn.length + topicsIn.length + R.events.length + R.factors.length + R.definitions.length > 0
      || !!vehicle || R.deadlines || R.recovery };
  }
  const RAG_RULES = [
    'คุณคือผู้ช่วยตอบคำถามความคุ้มครองประกันรถยนต์ภาคสมัครใจ ตอบจากข้อมูล JSON ที่ระบบค้นมาให้เท่านั้น ห้ามใช้ความรู้ทั่วไปหรือเงื่อนไขของบริษัทอื่น',
    'ข้อมูลมาจาก' + SOURCE_NOTE + ' ถ้าถามถึงฉบับอื่นหรือตัวเลขวงเงินในตารางกรมธรรม์ ให้บอกว่ายังไม่มีในข้อมูล',
    'graph_facts คือสถานะจากกราฟ (เชื่อถือได้สูงสุด) comparisons คือการเทียบทุกแผน plan_overview คือภาพรวมแผน policy_terms คือเงื่อนไขทั่วไปของกรมธรรม์จากกราฟ (ส่วนลด การยกเลิก การโอนรถ ฯลฯ) text_hits คือข้อความที่ค้นเจอด้วย BM25 ซึ่งอาจไม่เกี่ยวข้องก็ได้ ถ้าขัดกัน ให้ยึด graph_facts และ policy_terms',
    'ถ้า policy_terms ไม่ได้ระบุแผนและถ้อยคำต่างกันตามแผน ให้บอกความต่างนั้น',
    'scenario คือเหตุการณ์หรือปัจจัยที่ระบบเข้าใจจากคำถาม (เช่น ถอยชนเสา เพื่อนยืมรถ วิ่ง Grab เสพยา ฝ่ายผิด) พร้อมเงื่อนไขที่เกี่ยวข้อง (related) definitions คือคำนิยามในกรมธรรม์ deadlines คือกำหนดเวลาและหน้าที่ recovery คือการไล่เบี้ยหรือเรียกเงินคืน ใช้ประกอบ graph_facts ถ้า needs_confirmation มีค่า แปลว่าเล่มไม่ได้เขียนไว้ตรง ๆ เป็นการตีความ ให้บอกผู้ใช้ว่าควรยืนยันกับบริษัทก่อน ห้ามตอบเป็นข้อยุติ',
    'พ.ร.บ. (plan cmi) คือประกันภาคบังคับ คุ้มครองเฉพาะชีวิตและร่างกาย ประกันภาคสมัครใจด้านชีวิตร่างกายคู่กรณีจ่ายส่วนที่เกินจาก พ.ร.บ. ตัวเลขใน พ.ร.บ. มาจากเงื่อนไขฉบับ 1 เมษายน 2563 ถ้าตอบตัวเลข ให้บอกว่าเป็นตามฉบับนี้และอาจมีการปรับปรุงแล้ว',
    'vehicle คือรถที่ระบบจับได้จากคำถาม: electric=true ใช้เงื่อนไขรถยนต์ไฟฟ้า (EV), electric=false ใช้เงื่อนไขปกติ ถ้าผู้ใช้ระบุรุ่นรถ ให้บอกสั้น ๆ ในประโยคแรกว่ารุ่นนั้นใช้เงื่อนไขแบบไหน และอ้าง vehicle.definition เมื่อมี (นิยาม "รถยนต์" ในเงื่อนไข EV คือรถที่ขับเคลื่อนด้วยไฟฟ้าจากแบตเตอรี่เท่านั้น)',
    'flags: not_bev = รถเป็นไฮบริด/ปลั๊กอินไฮบริด/สันดาป จึงใช้เงื่อนไขปกติ ไม่ใช่เงื่อนไข EV (เช่นกติกาแบตเตอรี่ของ EV ไม่ใช้กับรถคันนี้) · ask_vehicle = ชื่อรุ่นหรือยี่ห้อนี้มีทั้งแบบไฟฟ้าล้วนและแบบอื่น ข้อมูลมีทั้งสองเงื่อนไข ถ้าคำตอบต่างกัน ให้สรุปสั้น ๆ ทั้งสองแบบแล้วถามกลับว่ารถเป็นไฟฟ้าล้วนหรือไม่ ถ้าเหมือนกันตอบได้เลย · unknown_vehicle = ระบบไม่รู้จักรุ่นรถในคำถาม ถ้าคำตอบขึ้นกับว่าเป็นรถไฟฟ้าล้วนหรือไม่ ให้ถามกลับ ห้ามเดาจากความรู้ทั่วไป · ev_no_variant = ผู้ใช้มีรถไฟฟ้าแต่ถามแผน 2+ 3+ หรือ 4 ซึ่งไม่มีเงื่อนไขฉบับรถยนต์ไฟฟ้าในข้อมูล ให้บอกข้อนี้ และตอบจากเงื่อนไขของแผนที่ถามโดยระบุว่าเป็นเงื่อนไขทั่วไป',
    'omitted คือคู่ แผน / เรื่อง ที่ระบบตัดออกเพราะคำถามกว้างเกินไป ไม่ได้แปลว่าไม่มีข้อมูล ถ้ามี omitted ห้ามตอบว่าไม่มีข้อมูล ให้บอกว่าคำถามนี้เทียบเรื่องเหล่านั้นไม่ได้ในครั้งเดียว และชวนให้ถามแยก',
    'ถ้าผู้ใช้ขอเทียบหลายแผนหลายเรื่อง ให้ตอบเป็นหัวข้อตามเรื่อง ใต้แต่ละหัวข้อบอกสถานะของทุกแผนที่ถาม แผนละประโยคสั้น ๆ',
    'ตอบภาษาไทย ถ้าถามเรื่องเดียว ให้ตอบสิ่งที่ถามในประโยคแรก ตามด้วยเหตุผลสั้น ๆ รวมไม่เกิน 3 ประโยค ไม่อธิบายนิยามหรือความคุ้มครองเรื่องอื่นที่ไม่ได้ถาม ถ้าผู้ใช้ถามหรือเล่าหลายประเด็น ให้ตอบครบทุกประเด็น ประเด็นละ 1-2 ประโยค ขึ้นต้นแต่ละประเด็นด้วยหัวข้อสั้น ๆ ใช้ภาษาที่คนไม่รู้เรื่องประกันเข้าใจ ห้ามอ้างข้อย่อยอย่าง (ข) (ค) หรือศัพท์เทคนิคโดยไม่อธิบาย ไม่ต้องเขียนบรรทัดสถานะ ระบบแสดงสถานะจากกราฟให้เอง',
    'ถ้าข้อเท็จจริงที่ผู้ใช้เล่าตรงกับเงื่อนไขชัดเจน ให้ตอบตรง ๆ ไม่ต้องใช้คำว่า "น่าจะ" ใช้คำเลี่ยงเฉพาะเมื่อข้อมูลระบุว่าเป็นการตีความ ต้องยืนยัน หรือคำตอบขึ้นกับข้อเท็จจริงที่ผู้ใช้ยังไม่ได้บอก',
    'question_type บอกรูปแบบคำถาม ใช้จัดรูปคำตอบ (มีได้หลายแบบ ให้ตอบครบทุกแบบ): covered = บอกว่าคุ้มครองหรือไม่ในประโยคแรก · amount = ให้ตัวเลขในประโยคแรก ถ้าตัวเลขขึ้นกับตารางกรมธรรม์ซึ่งไม่อยู่ในข้อมูล ให้บอกตรง ๆ ห้ามเดา · compare = แยกหัวข้อตามเรื่อง ใต้หัวข้อบอกทุกแผนที่ถาม · procedure = ตอบเป็นขั้นตอนลำดับเลข เรียงตามเวลา จาก policy_terms และ deadlines เฉพาะขั้นที่เกี่ยวกับสิ่งที่ผู้ใช้ถาม · definition = ให้ความหมายตามเล่มก่อน แล้วอธิบายเป็นภาษาง่าย · deadline = บอกกำหนดเวลาเป็นตัวเลขก่อน · recovery = บอกว่าใครเรียกเงินจากใคร เมื่อไร · rights = บอกเป็นรายการว่าผู้ใช้มีสิทธิอะไรบ้าง · narrative = ผู้ใช้เล่าเหตุการณ์ที่เกิดกับตัวเอง · recommend = ผู้ใช้ขอให้เลือกแผน',
    'out_of_scope คือส่วนของคำถามที่ไม่มีในข้อมูล (ประกันประเภทอื่น ราคาเบี้ย หรือให้เลือกบริษัท) ให้ตอบส่วนที่เป็นเงื่อนไขประกันรถยนต์ตามปกติ แล้วบอกสั้น ๆ หนึ่งประโยคว่าส่วนนั้นไม่มีในข้อมูลตาม out_of_scope.note ห้ามเดาตัวเลขเบี้ย ห้ามแนะนำหรือจัดอันดับบริษัท',
    'เฉพาะเมื่อผู้ใช้เล่าเหตุการณ์ที่เกิดขึ้นจริงกับตัวเอง (question_type มี narrative หรือเล่าเองชัดเจน ไม่ใช่ถามว่าแผนคุ้มครองอะไร) ถ้าในข้อมูลมีสิทธิ์หรือเงื่อนไขที่เกี่ยวกับเหตุการณ์นั้นโดยตรง (เช่น ไม่ไล่เบี้ยคนที่ยืมรถไปขับ ซากแบตเตอรี่ ค่าขนย้ายรถ) ให้บอกเพิ่มไม่เกิน 2 ข้อแม้ผู้ใช้ไม่ได้ถาม',
    'ทุกข้อเท็จจริงต้องอ้างอิงด้วยรูปแบบ [[clause_id]] โดยใช้เฉพาะ clause_id ที่อยู่ในข้อมูล อ้าง clause_id เดียวกันไม่เกินครั้งเดียวต่อหัวข้อ (ถ้าไม่มีหัวข้อ ไม่เกินครั้งเดียวทั้งคำตอบ) และทุกหัวข้อต้องมีการอ้างอิงของตัวเองอย่างน้อยหนึ่งครั้ง',
    'ถ้าข้อมูลไม่พอ (เช่นไม่รู้ว่าถามถึงแผนไหนหรือเรื่องไหน) ให้บอกตรง ๆ และถามกลับสั้น ๆ',
    'ใช้คำลงท้ายแบบผู้หญิงที่สุภาพตามหลักภาษาไทย: "ค่ะ" ท้ายประโยคบอกเล่าหรือรับคำ (เช่น ไม่คุ้มครองค่ะ) "คะ" ท้ายประโยคคำถามและหลังคำว่า นะ (เช่น ต้องการทราบแผนไหนคะ, ถามแยกอีกครั้งนะคะ) ห้ามใช้ "ครับ" ไม่ต้องลงท้ายทุกประโยค ใส่เฉพาะประโยคที่พูดกับผู้ใช้โดยตรงหรือประโยคปิดท้าย ไม่ใส่ใน bullet ที่เป็นข้อเท็จจริงสั้น ๆ ใช้คำแทนตัวว่า "ดิฉัน" หรือไม่ใช้คำแทนตัวเลย ห้ามใช้ "ผม" ถ้าผู้ใช้ขอให้เลือกแผน ให้บอกว่าเลือกแผนแทนผู้ใช้ไม่ได้ แล้วสรุปความต่างที่เกี่ยวกับเรื่องที่ผู้ใช้กังวลให้แทน',
    'ไม่แนะนำให้ซื้อแผนใด และไม่ตอบเรื่องที่อยู่นอกความคุ้มครองประกันรถยนต์',
    'แผน: ' + D.plans.map(p => p.id + '=' + p.name).join(', ') + ' | ความคุ้มครอง: ' + D.coverages.map(c => c.id + '=' + c.name).join(', ')
      + ' | เงื่อนไขทั่วไป: ' + TOPICS.map(t => t.id + '=' + t.name).join(', ')
  ].join('\n');

  let toolsOK = false;
  const ERR = {
    rate_limited: 'ถามถี่เกินไป หรือโควตาการใช้ Claude ของบัญชีคุณเต็มแล้ว รอสักครู่แล้วลองใหม่',
    not_granted: 'หน้านี้ยังไม่ได้รับอนุญาตให้ใช้ Claude (กดไม่อนุญาต หรือองค์กรไม่อนุญาต) รีเฟรชหน้าเพื่อให้ระบบถามอีกครั้ง ปุ่มคำถามตัวอย่างยังใช้ได้',
    sampling_disabled: 'บัญชีหรือองค์กรของคุณปิดการใช้ Claude จากหน้าเว็บแบบนี้ ปุ่มคำถามตัวอย่างยังใช้ได้',
    session_expired: 'เซสชันหมดอายุ กรุณาล็อกอิน claude.ai ใหม่แล้วรีเฟรชหน้า',
    capability_disabled: 'หน้าจอนี้ใช้ Claude ไม่ได้ ลองเปิดบน claude.ai ในเบราว์เซอร์',
    not_declared: 'หน้านี้ยังไม่ได้เปิดสิทธิ์ใช้ Claude',
    refused: 'Claude ไม่ตอบคำถามนี้ ลองถามใหม่ด้วยคำอื่น',
    cancelled: 'หยุดการตอบแล้ว',
    auth_error: 'เซิร์ฟเวอร์ยังไม่มี API key ที่ใช้ได้ ตั้งค่า ANTHROPIC_API_KEY ในไฟล์ .env แล้วรัน npm start ใหม่',
    connection_error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่ายังรัน npm start อยู่',
    bad_request: 'คำขอไม่ถูกต้อง ดูรายละเอียดในหน้าต่างที่รันเซิร์ฟเวอร์'
  };
  const PERMANENT = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

  async function ask(text) {
    text = text.trim();
    if (!text || !sample || busy) return;
    showTab('chat');
    const userEl = userMsg(text, { t: cur ? cur.turns.length : 0, h: history.length });
    const m = aiMsg({ live: true, retry: true, note: 'สถานะและข้อที่อ้างอิงมาจากกราฟ ถ้อยคำเรียบเรียงโดย AI' });
    const ans = m.ans;
    m.el.classList.add('busy');
    walk = { grants: [], el: document.createElement('div'), facts: m.facts, allowed: new Set(), m };
    walk.el.className = 'walk';
    m.traceIn.appendChild(walk.el);
    renderAnswer(ans, '', true);
    // remember which chat this belongs to: switching chats mid-answer must not leak into the next one
    const gen = chatGen, userEntry = { role: 'user', content: text };
    history.push(userEntry);
    // B17: a question wholly outside the data gets the standard reply at once, without calling Claude
    const pre = route(text);
    if (pre.oos && !pre.oos.partial) { answerOutOfScope(text, D.out_of_scope.find(x => x.id === pre.oos.id), userEl, m); return; }
    // nothing about insurance or cars: the graph and the matrix stay exactly as they are.
    // First message of a chat -> the standard reply; mid-conversation it may be a follow-up ("อธิบายเพิ่มหน่อย"),
    // so Claude answers from the conversation alone, without a new search and without moving the graph
    const followUp = pre.offtopic && history.some(h => h.role === 'assistant');
    if (pre.offtopic && !followUp) { answerOutOfScope(text, OFF_TOPIC, userEl, m); return; }
    let msgs = history.slice(-8);
    while (msgs.length && msgs[0].role !== 'user') msgs = msgs.slice(1);
    let ctx = { graph_facts: [] }, linked = false;
    if (followUp) {
      const prev = cur && cur.turns.length ? cur.turns[cur.turns.length - 1] : null;
      allowClauses(prev ? prev.allowed || (D.questions.find(q => q.id === prev.id) || { cite: [] }).cite : []);
      walkStep('ข้อความนี้ไม่มีเรื่องประกันหรือรถ จึงไม่ค้นกราฟใหม่ ตอบจากบทสนทนาก่อนหน้า');
    } else {
      showView('graph');
      markHits([]);
      // retrieval happens here in the page; Claude only writes the answer (one call, no tools needed)
      ({ ctx, linked } = retrieve(text));
    }
    const agentic = !followUp && !linked && !ctx.graph_facts.length && toolsOK;
    const last = followUp
      ? RAG_RULES + '\n\n' + FOLLOW_UP_RULE + '\n\nคำถามล่าสุดของผู้ใช้: ' + text
      : agentic
      ? PREAMBLE + '\n\nคำถามล่าสุดของผู้ใช้: ' + text
      : RAG_RULES + '\n\nข้อมูลที่ระบบค้นมาให้ (JSON):\n' + JSON.stringify(ctx) + '\n\nคำถามล่าสุดของผู้ใช้: ' + text;
    msgs = msgs.map((m, i) => i === msgs.length - 1 ? { role: 'user', content: last } : m);
    if (agentic) walkStep('ไม่พบแผนหรือเรื่องในคำถาม ให้ AI ค้นกราฟต่อเอง');
    const nHits = m.traceIn.querySelectorAll('.hit').length;
    traceLabel(m, agentic ? 'กำลังค้นในแผนที่ความรู้…' : nHits ? 'กำลังเรียบเรียงคำตอบจาก ' + nHits + ' ข้อในกรมธรรม์…' : 'กำลังเรียบเรียงคำตอบ…');
    const again = () => redo(text, [userEl, m.el, errEl], true);
    let errEl = null, started = false;
    const ac = new AbortController(); busy = ac; setBusy(true);
    try {
      const opts = { signal: ac.signal, cache: false, modelTier: 'default', onText: ({ text: t }) => {
        // the trace folds away as soon as the answer starts, like a finished thought
        if (!started && t && !/^Thinking/i.test(t)) { started = true; finishTrace(m); }
        renderAnswer(ans, t, true);
      } };
      if (agentic) opts.tools = TOOLS;
      const res = await sample(msgs, opts);
      if (gen !== chatGen) return;
      renderAnswer(ans, res.text, false);
      history.push({ role: 'assistant', content: res.text });
      const { cited, paths } = answerPaths(res.text);
      let pathQ = null;
      if (paths.length) {
        const { body } = parseAnswer(res.text);
        const sts = [...new Set(walk.grants.map(([p, c]) => D.grants[p][c].s))];
        traceSeq++;
        chatTrace = { id: 'chat', label: text, verdict: sts.length === 1 ? sts[0] : 'K', verdictLabel: sts.length === 1 ? STATUS[sts[0]] : 'ต่างกันตามเรื่อง',
          answer: body.replace(/\[\[[^\]]*\]\]/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(), contrast: null,
          grants: [...new Set(paths.filter(x => !String(x[0]).startsWith('en:')).map(x => x[0] + '|' + x[1]))].map(k => k.split('|')), paths, cite: cited };
        m.traceIn.insertAdjacentHTML('beforeend', '<div class="stage">เส้นทางคำตอบในกราฟ</div>' + pathListHtml(paths));
        pathQ = chatTrace;
        runQuestion(chatTrace);
      }
      bindActs(m, again, pathQ ? () => { chatTrace = pathQ; traceSeq++; runQuestion(pathQ); } : null);
      finishTrace(m);
      bindFb(m, saveTurn({ k: 'llm', q: text, a: res.text, allowed: [...walk.allowed], tl: m.trace.querySelector('.t-label').textContent,
        facts: [...m.facts.querySelectorAll('.pill')].map(p => ({ t: p.dataset.k, s: ['C', 'K', 'N'].find(s => p.classList.contains(s)) })),
        trace: m.traceIn.innerHTML, path: pathQ }), res.text);
    } catch (e) {
      const hi = history.lastIndexOf(userEntry);
      if (hi >= 0) history.splice(hi, 1);
      if (gen !== chatGen) return;
      const code = e && e.code ? e.code : 'upstream_error';
      const permanent = PERMANENT.includes(code);
      if (e && e.text) { renderAnswer(ans, e.text, false); bindActs(m, permanent ? null : () => redo(text, [userEl, m.el, errEl], false)); }
      else m.el.remove();
      errEl = addMsg('m-err', `${ICON.warn}<div><div>${esc((ERR[code] || 'ตอบไม่สำเร็จ ลองใหม่อีกครั้ง') + ' (รหัส: ' + code + ')')}</div>${permanent ? '' : '<button type="button" class="linkbtn err-retry">ลองอีกครั้ง</button>'}</div>`);
      errEl.setAttribute('role', 'alert');
      const rb = errEl.querySelector('.err-retry');
      if (rb) rb.addEventListener('click', () => redo(text, [userEl, m.el, errEl], false));
      if (permanent) { sample = null; document.body.classList.add('ai-off'); offNote.textContent = ERR[code] || 'ช่องพิมพ์ใช้ Claude ไม่ได้ในหน้าจอนี้ ปุ่มคำถามตัวอย่างยังใช้ได้'; }
    } finally {
      finishTrace(m);
      m.el.classList.remove('busy');
      busy = null; setBusy(false);
      if (sample) input.focus();
    }
  }
  const NOTE_OOS = 'คำตอบมาตรฐานสำหรับคำถามนอกขอบเขตข้อมูล ไม่ใช้ LLM';
  const OFF_TOPIC = { id: 'off_topic', name: 'ไม่เกี่ยวกับประกันรถยนต์',
    reply: 'ดิฉันตอบได้เฉพาะเรื่องความคุ้มครองประกันรถยนต์ (ประเภท 1–5 รถยนต์ไฟฟ้า และ พ.ร.บ.) จากเงื่อนไขกรมธรรม์ค่ะ\n\nลองถามแบบนี้ได้นะคะ เช่น "ชั้น 3 ชนเสาเองคุ้มครองไหม" หรือ "เพื่อนยืมรถไปขับแล้วชน ประกันจ่ายไหม"' };
  const FOLLOW_UP_RULE = 'ข้อความล่าสุดของผู้ใช้ไม่มีเรื่องประกันหรือรถ ระบบจึงไม่ได้ค้นข้อมูลใหม่ ถ้าเป็นการถามต่อจากคำตอบก่อนหน้า (เช่น ขออธิบายเพิ่ม ขอสรุป ขอตัวอย่าง) ให้ตอบจากบทสนทนาก่อนหน้าเท่านั้น และอ้างได้เฉพาะ clause_id ที่เคยอ้างในคำตอบก่อนหน้า ถ้าเป็นเรื่องอื่นที่ไม่เกี่ยวกับประกันรถยนต์ (ทักทาย ขอบคุณ ถามเรื่องทั่วไป) ให้ตอบสั้น ๆ อย่างสุภาพว่าดิฉันตอบได้เฉพาะเรื่องความคุ้มครองประกันรถยนต์ ไม่ต้องอ้างอิง';
  // a question answered with a fixed reply (wholly out of scope, or not about insurance at all): no Claude call, no graph
  function answerOutOfScope(text, row, userEl, m) {
    walkStep(row === OFF_TOPIC ? 'ข้อความนี้ไม่เกี่ยวกับประกันรถยนต์' : 'คำถามนอกขอบเขตข้อมูล: ' + row.name);
    m.el.querySelector('.src-tag').textContent = NOTE_OOS;
    renderAnswer(m.ans, row.reply, false, new Set());
    history.push({ role: 'assistant', content: row.reply });
    finishTrace(m);
    m.el.classList.remove('busy');
    bindActs(m, () => redo(text, [userEl, m.el], true));
    bindFb(m, saveTurn({ k: 'llm', q: text, a: row.reply, allowed: [], tl: m.trace.querySelector('.t-label').textContent, facts: [],
      trace: m.traceIn.innerHTML, path: null, note: NOTE_OOS }), row.reply);
    if (sample) input.focus();
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (busy) { busy.abort(); return; }
    const t = input.value; input.value = ''; autosize(); ask(t);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  document.getElementById('clearChat').addEventListener('click', newChat);
  // chat-only mode: hide the matrix/graph, history becomes a sidebar, the thread gets a centred reading column
  const expandBtn = document.getElementById('expandChat');
  expandBtn.addEventListener('click', () => setWide(!document.body.classList.contains('chat-wide')));
  // chat-only mode exists only above phone width; leaving that width drops back to the normal layout
  mqMobile.addEventListener('change', e => { if (e.matches && document.body.classList.contains('chat-wide')) setWide(false); });
  function setWide(on) {
    // chat-only mode has its own sidebar; back in split view the slide-out panel returns if it was left open
    if (on) closeHist(false, true);
    document.body.classList.toggle('chat-wide', on);
    if (!on && uiPrefs.hist && !isMobile()) openHist(false, true);
    expandBtn.setAttribute('aria-pressed', on);
    const lbl = on ? 'ย่อแชท แสดงตารางและแผนที่ความรู้' : 'ขยายแชทเต็มจอ';
    expandBtn.setAttribute('aria-label', lbl); expandBtn.dataset.tip = lbl;
    hideTip(); syncTitle();
    if (!on && view === 'graph') { cy.resize(); fitView(false); }
    scrollDown();
  }

  (window.claude && window.claude.use ? window.claude.use('sample') : Promise.resolve(null)).then(s => {
    sample = s || null;
    document.body.classList.toggle('ai-off', !sample);
    offNote.textContent = sample ? '' : 'ช่องพิมพ์ถาม AI ใช้ได้เมื่อเปิดหน้านี้ผ่าน npm start (http://localhost:5173) ปุ่มคำถามตัวอย่างใช้ได้เสมอ';
    setBusy(false);
    if (sample && sample.limits) sample.limits().then(l => { toolsOK = !!(l && l.tools); }).catch(() => {});
  }).catch(() => { offNote.textContent = 'เชื่อมต่อ AI ไม่สำเร็จ ปุ่มคำถามตัวอย่างยังใช้ได้'; });

  // ---------- graph interaction ----------
  function stop() { timers.forEach(clearTimeout); timers = []; }
  cy.on('tap', 'node.plan', e => {
    stop();
    const pid = e.target.id();
    const c = state.drills.length ? state.drills[0][1] : null;
    state.question = null; state.focus = null; state.plans = [pid];
    state.drills = c ? [[pid, c]] : [];
    pickedPlan = pid;
    applyGraph(); renderPanel(); showTab('ctx');
  });
  cy.on('tap', 'node.cov', e => { openGrant(state.plans[0], e.target.id().slice(3)); showTab('ctx'); });
  cy.on('tap', 'node.topic', () => { stop(); state.focus = null; renderPanel(); showTab('ctx'); });
  cy.on('tap', 'node.grp', e => {
    stop();
    const k = e.target.data('gkey');
    if (state.open.has(k)) state.open.delete(k); else state.open.add(k);
    state.question = null;
    applyGraph();
  });
  cy.on('tap', 'node.detail', e => {
    stop();
    state.question = null; state.focus = { type: 'detail', id: e.target.id().slice(2) };
    applyGraph(); renderPanel(); showTab('ctx');
  });
  cy.on('tap', 'node.clause', e => {
    stop();
    const from = state.focus && state.focus.type === 'detail' ? state.focus.id : null;
    state.question = null; state.focus = { type: 'clause', id: e.target.id().slice(2), from };
    applyGraph(); renderPanel(); showTab('ctx');
  });
  cy.on('mouseover', 'node', () => { cy.container().style.cursor = 'pointer'; });
  cy.on('mouseout', 'node', () => { cy.container().style.cursor = 'default'; });

  function relabel() {
    cy.nodes('.cov').forEach(n => n.data('label', covLabel(cov(n.id().slice(3)))));
    cy.nodes('.detail').forEach(n => n.data('label', detailLabel(n.id().slice(2))));
    cy.nodes('.clause').forEach(n => n.data('label', clauseLabel(n.id().slice(2))));
    cy.edges().forEach(e => e.data('lab', lab(e.data('th'), e.data('tech'))));
    cy.edges('.part').toggleClass('techlab', state.tech);
    cy.nodes('.qpath').forEach(n => n.data('numlabel', stepMark(n.data('num')) + n.data('label')));
  }
  document.getElementById('traceExit').addEventListener('click', () => {
    stop();
    state.question = null; state.focus = null;
    applyGraph(); renderPanel();
  });

  // app-bar popovers: one open at a time; outside click or Escape closes and returns focus
  const POPS = [['infoBtn', 'infoPop'], ['menuBtn', 'menuPop']].map(([b, p]) => ({ btn: document.getElementById(b), pop: document.getElementById(p) }));
  function closePops(except, refocus) {
    POPS.forEach(x => {
      if (x === except || x.pop.hidden) return;
      x.pop.hidden = true; x.btn.setAttribute('aria-expanded', 'false');
      if (refocus) x.btn.focus();
    });
  }
  POPS.forEach(x => x.btn.addEventListener('click', e => {
    e.stopPropagation();
    closePops(x);
    const open = x.pop.hidden;
    x.pop.hidden = !open; x.btn.setAttribute('aria-expanded', String(open));
  }));
  document.addEventListener('click', e => { if (!e.target.closest('.pop-wrap')) closePops(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePops(null, true); });

  document.getElementById('resetBtn').addEventListener('click', () => {
    closePops();
    stop();
    Object.assign(state, { plans: ['p2p'], drills: [], focus: null, question: null });
    pickedPlan = null;
    go('matrix');
    applyGraph({ force: true }); renderPanel();
  });
  document.getElementById('techToggle').addEventListener('change', e => {
    state.tech = e.target.checked; document.body.classList.toggle('techmode', state.tech);
    relabel(); renderPanel();
  });
  document.getElementById('zIn').addEventListener('click', () => cy.animate({ zoom: { level: cy.zoom() * 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: 200 }));
  document.getElementById('zOut').addEventListener('click', () => cy.animate({ zoom: { level: cy.zoom() / 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: 200 }));
  document.getElementById('zFit').addEventListener('click', () => fitTo(cy.nodes(), true, 1.2));
  window.addEventListener('resize', () => { clearTimeout(window.__rt); window.__rt = setTimeout(() => { cy.resize(); fitView(false); }, 80); });

  function fromHash() {
    const q = D.questions.find(x => x.id === location.hash.slice(1));
    if (q) { runQuestion(q); showTab('ctx'); }
  }
  window.addEventListener('hashchange', fromHash);

  // ---------- start ----------
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
    cy.style().update();
    applyGraph({ force: true }); renderPanel();
    fromHash();
  });
  window.__cy = cy; window.__state = state;
})();
