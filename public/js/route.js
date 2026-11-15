// Question routing: which plans, coverages and policy topics a question names.
// No DOM in here, so ingest/eval_route.mjs runs exactly the code the page runs.
// Loaded before app.js; app.js calls makeRouter(DATA).
// eslint-disable-next-line no-unused-vars
function makeRouter(D) {
  const TOPICS = D.topics || [];
  const plan = id => D.plans.find(p => p.id === id);
  const cov = id => D.coverages.find(c => c.id === id);
  const topic = id => TOPICS.find(t => t.id === id);

  const PLAN_SYN = [
    // EV first: "EV ประเภท 1" must not resolve to ประเภท 1
    ['ev1', ['evประเภท1', 'evชั้น1', 'ev1', 'รถไฟฟ้าประเภท1', 'รถไฟฟ้าชั้น1', 'ไฟฟ้าประเภท1']],
    ['ev2', ['evประเภท2', 'evชั้น2', 'ev2', 'รถไฟฟ้าประเภท2', 'รถไฟฟ้าชั้น2', 'ไฟฟ้าประเภท2']],
    ['ev3', ['evประเภท3', 'evชั้น3', 'ev3', 'รถไฟฟ้าประเภท3', 'รถไฟฟ้าชั้น3', 'ไฟฟ้าประเภท3']],
    ['p2p',['2+', '2พลัส', 'สองพลัส', 'ประเภท5แบบ2']],
    ['p3p', ['3+', '3พลัส', 'สามพลัส', 'ประเภท5แบบ3']],
    ['p1', ['ประเภท1', 'ชั้น1', 'ชั้นหนึ่ง', 'type1']],
    ['p2', ['ประเภท2', 'ชั้น2', 'ชั้นสอง', 'type2']],
    ['p3', ['ประเภท3', 'ชั้น3', 'ชั้นสาม', 'type3']],
    // ป้องกันภัย before ประเภท 4: "ประเภท 4 ป้องกันภัย" must not also name ประเภท 4
    ['p4sg', ['ประเภท4ป้องกันภัย', 'ชั้น4ป้องกันภัย', 'ประกันภัยรถยนต์ป้องกันภัย', 'ป้องกันภัย', 'type4sg']],
    ['p4', ['ประเภท4', 'ชั้น4', 'ชั้นสี่', 'type4']],
    ['cmi', ['พ.ร.บ', 'พรบ', 'ภาคบังคับ', 'ผู้ประสบภัยจากรถ']]
  ];
  const COV_SYN = {
    bi: ['ชีวิต', 'ร่างกาย', 'บาดเจ็บ', 'เสียชีวิต', 'คนเจ็บ', 'bodily'],
    pd: ['ทรัพย์สิน', 'รถคู่กรณี', 'รถคนอื่น', 'ขาดประโยชน์', 'property'],
    col: ['ชนกับรถ', 'รถชน', 'ชนรถ', 'collision', 'ซ่อมรถเรา'],
    nocp: ['ไม่มีคู่กรณี', 'ชนเอง', 'เฉี่ยวเอง', 'ชนเสา', 'no_counterparty'],
    flood: ['น้ำท่วม', 'ภัยธรรมชาติ', 'flood'],
    theft: ['รถหาย', 'ขโมย', 'โจรกรรม', 'สูญหาย', 'theft'],
    fire: ['ไฟไหม้', 'fire'],
    pa: ['อุบัติเหตุส่วนบุคคล', 'ค่ารักษา', 'ประกันตัว', 'ร.ย.0']
  };
  const norm = x => String(x || '').toLowerCase().replace(/\s+/g, '');
  function resolvePlan(x) {
    if (plan(x)) return x;
    const n = norm(x);
    const hit = PLAN_SYN.find(([, syn]) => syn.some(s => n.includes(norm(s))));
    if (hit) return hit[0];
    throw new Error('ไม่พบแผน "' + x + '" ใช้ได้: ' + D.plans.map(p => p.id).join(', '));
  }
  function resolveCov(x) {
    if (cov(x)) return x;
    const n = norm(x);
    const c = D.coverages.find(c => norm(c.name) === n || n.includes(norm(c.name)));
    if (c) return c.id;
    const hit = Object.entries(COV_SYN).find(([, syn]) => syn.some(s => n.includes(norm(s))));
    if (hit) return hit[0];
    throw new Error('ไม่พบความคุ้มครอง "' + x + '" ใช้ได้: ' + D.coverages.map(c => c.id).join(', '));
  }
  function resolveTopic(x) {
    if (topic(x)) return x;
    const n = norm(x);
    const t = TOPICS.find(t => norm(t.name) === n || n.includes(norm(t.name))) || TOPICS.find(t => (t.syn || []).some(s => n.includes(norm(s))));
    if (t) return t.id;
    throw new Error('ไม่พบเรื่อง "' + x + '" ใช้ได้: ' + TOPICS.map(t => t.id).join(', '));
  }

  const COV_TABLE = D.coverages.map(c => [c.id, [c.name, ...(COV_SYN[c.id] || [])]]);
  const TOPIC_TABLE = TOPICS.map(t => [t.id, [t.name, ...(t.syn || [])]]);
  function detect(text, table, consume) {
    let n = norm(text); const out = [];
    table.forEach(([id, syns]) => syns.forEach(sy => {
      const k = norm(sy);
      if (k && n.includes(k)) { if (!out.includes(id)) out.push(id); if (consume) n = n.split(k).join('|'); }
    }));
    return out;
  }
  // ---------- phase B nodes: events and factors by synonym, definitions / deadlines / recovery by intent ----------
  // synonyms arrive normalised (lowercase, no spaces) from build_data.py; longest first, a matched span is consumed
  function longest(text, rows) {
    let n = norm(text); const out = [];
    rows.flatMap(r => r.syn.map(a => [a, r.id])).sort((x, y) => y[0].length - x[0].length).forEach(([a, id]) => {
      if (a && n.includes(a)) { n = n.split(a).join('|'); if (!out.includes(id)) out.push(id); }
    });
    return out;
  }
  const DEF_ASK = /คืออะไร|คือไร|หมายถึง|หมายความ|นิยาม|แปลว่า|ความหมาย|นับเป็น|ถือเป็น/;
  const DL_ASK = /กี่วัน|ภายในกี่|ภายในเมื่อ|กำหนดเวลา|ระยะเวลา|นานแค่ไหน|กี่เดือน|เมื่อไหร่ต้อง|เมื่อไรต้อง|ต้องทำอะไร|หน้าที่|ทันไหม|เกินกำหนด|หมดเขต/;
  const REC_ASK = /ไล่เบี้ย|เรียกเงินคืน|เรียกคืน|รับช่วงสิทธิ|เรียกร้องจากผู้ผลิต|ฟ้องผู้ผลิต|ฟ้องอู่|ใครจ่ายก่อน/;
  // ---------- question type (B18): the shape of answer the user expects; several can apply ----------
  // definition / deadline / recovery use the intents above; the rest are matched here on the normalised text
  const QT = [
    ['covered', /คุ้มครองไหม|คุ้มครองมั้ย|คุ้มครองหรือ(ไม่|เปล่า)|คุ้มไหม|คุ้มมั้ย|จ่ายไหม|จ่ายมั้ย|จ่ายหรือ(ไม่|เปล่า)|เคลมได้|ซ่อมให้|ครอบคลุม|รับผิดชอบไหม|ได้ไหม|ได้มั้ย|ได้หรือ(ไม่|เปล่า)|ได้รึเปล่า/],
    ['amount', /เท่าไหร่|เท่าไร|กี่บาท|กี่เปอร์เซ็นต์|กี่%|กี่ครั้ง|กี่ปี|วงเงิน|สูงสุด|ขั้นต่ำ|ได้กี่|จ่ายกี่|ร้อยละ/],
    ['compare', /ต่างกัน|แตกต่าง|เทียบ|ดีกว่า|ต่างจาก|เหมือนกันไหม|เหมือนหรือต่าง|(^|[^a-z])vs(?![a-z])/],
    ['procedure', /ขั้นตอน|ทำยังไง|ทำอย่างไร|ต้องทำอะไร|ทำไงดี|ทำไง|เอกสารอะไร|ใช้เอกสาร|เอกสารที่ต้อง|ยื่นเรื่อง|ยื่นเคลม|แจ้งยังไง|เคลมยังไง|เคลมอย่างไร|แจ้งเคลม|วิธีเคลม|วิธีแจ้ง|ติดต่อใคร/],
    ['rights', /สิทธิ|เรียกร้องได้|เรียกร้องอะไร|ได้รับอะไร|ได้อะไรบ้าง|บริษัทต้อง|ค่าขาดประโยชน์|ชดเชย/],
    ['recommend', /ควรซื้อ|ควรทำ(ประกัน|ชั้น|ประเภท)|ควรเลือก|เลือกแบบไหน|เลือกอะไร|แผนไหนดี|ชั้นไหนดี|ประเภทไหนดี|แบบไหนดี|ตัวไหนดี|อันไหนดี|คุ้มกว่า|คุ้มค่า|แนะนำ|ซื้ออะไรดี|ทำอะไรดี/]
  ];
  // the user tells what happened to them (with an event or factor the graph knows), not what a plan covers in general
  const NARRATE = /เมื่อ(วาน|คืน|เช้า|กี้)|วันนี้|ตะกี้|เพิ่ง|ผม|ฉัน|หนู|ดิฉัน|กระผม|แฟน|ลูกชาย|ลูกสาว|คุณพ่อ|คุณแม่/;

  // ---------- out of scope (B17): another insurance, premium price, which company; DATA.out_of_scope ----------
  // motor context: the question also names a plan or car, or talks about driving: then it is only partly out of scope
  const MOTOR = /รถ|ขับ|ชน|พ\.?ร\.?บ|กรมธรรม์/;
  // words that make a question about insurance or driving even when no plan, coverage or event is recognised
  const ON_TOPIC = /รถ|ขับ|(?<!ประชา)ชน(?!ิด|ะ|บท)|พ\.?ร\.?บ|กรมธรรม์|ประกัน|คุ้มครอง|เคลม|เบี้ย|สินไหม|ชดใช้|ค่าเสียหาย|ส่วนแรก|คู่กรณี|อุบัติเหตุ|ซ่อม|อู่|จ่าย|บาดเจ็บ|เสียชีวิต|ขโมย|สูญหาย|น้ำท่วม|ไฟไหม้|แบต|ใบขับขี่|ชั้น\d|ประเภท\d|insurance|claim|policy|\bcar\b|\bev\b/i;
  function outOfScope(text, r) {
    const ids = longest(text, D.out_of_scope || []);
    if (!ids.length) return null;
    const o = D.out_of_scope.find(x => x.id === ids[0]);
    if ((o.unless_topics || []).some(t => r.topics.includes(t))) return null;
    const content = r.covs.length || r.topics.length || r.events.length || r.factors.length || r.definitions.length || r.deadlines || r.recovery;
    const partial = o.kind === 'other_insurance' ? !!(r.plans.length || r.vehicle || MOTOR.test(norm(text))) : !!content;
    return { id: o.id, kind: o.kind, name: o.name, partial };
  }

  function definitionsIn(text) {
    const n = norm(text);
    if (!DEF_ASK.test(n)) return [];
    return (D.definitions || []).filter(d => { const t = norm(d.term).replace(/[“”"]/g, ''); return t.length > 1 && (n.includes(t) || n.includes(t.replace(/^(ความ|การ)/, ''))); }).map(d => d.id);
  }

  // ---------- which car: the EV wordings cover battery-electric cars only (หมวด 1 ข้อ 2) ----------
  // DATA.vehicles comes from ingest/vehicles.py; aliases are lowercase without spaces, longest match wins.
  const VEH = D.vehicles || { brands: [], models: [], definition: {} };
  const ALIASES = [...VEH.models.map(v => ['model', v]), ...VEH.brands.map(v => ['brand', v])]
    .flatMap(([kind, v]) => v.alias.map(a => ({ a, kind, v }))).sort((x, y) => y.a.length - x.a.length);
  const EV_HINT = /(^|[^a-z])b?ev(?![a-z])|รถไฟฟ้า|รถยนต์ไฟฟ้า|ไฟฟ้าล้วน|ไฟฟ้า100/;
  const NOT_BEV_HINT = /hybrid|ไฮบริด|ไฮบริท|(^|[^a-z])(p?hev|erev)(?![a-z])|dm-?i(?![a-z])|ปลั๊กอิน|plug-?in|เครื่องยนต์น้ำมัน|เบนซิน|ดีเซล/;
  // latin words that are not car names (anything else latin that no alias explains may be an unknown model)
  const NOT_A_CAR = new Set(['ev', 'bev', 'phev', 'hev', 'erev', 'hybrid', 'plug', 'in', 'dm', 'i', 'type', 'grab', 'bolt', 'line', 'lineman',
    'taxi', 'app', 'ok', 'gps', 'cctv', 'km', 'wallbox', 'wall', 'box', 'adas', 'abs', 'airbag', 'ncb', 'excess', 'deductible', 'claim',
    'online', 'call', 'center', 'id', 'pdf', 'cmi']);
  const EV_OF = { p1: 'ev1', p2: 'ev2', p3: 'ev3' };

  // an alias matches with optional spaces between its characters ("atto3" = "Atto 3"), and a latin/digit edge must not
  // touch another latin letter or digit, so "ford" does not match "afford" nor "gac" "legacy"
  const esc = c => c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const aliasRe = a => new RegExp((/^[a-z0-9]/.test(a) ? '(?<![a-z0-9])' : '') + [...a].map(esc).join('\\s*') + (/[a-z0-9]$/.test(a) ? '(?![a-z0-9])' : ''), 'g');
  ALIASES.forEach(x => { x.re = aliasRe(x.a); });
  function detectVehicle(text) {
    let n = String(text || '').toLowerCase(); const hits = [];
    ALIASES.forEach(({ re, kind, v }) => {
      re.lastIndex = 0;
      if (!re.test(n)) return;
      n = n.replace(re, '|');
      if (!hits.some(h => h.v.id === v.id)) hits.push({ kind, v });
    });
    // a model already says which brand: drop that brand's own entry
    const models = hits.filter(h => h.kind === 'model');
    const cars = hits.filter(h => h.kind === 'model' || !models.some(m => m.v.brand === h.v.id)).map(h => h.v);
    const lower = String(text || '').toLowerCase();
    // test with and without spaces: "camry ev" loses its word edge once spaces are removed, "ไฟฟ้า 100" needs them removed
    const spaced = lower.replace(/\s+/g, ' ');
    const evHint = EV_HINT.test(norm(lower)) || EV_HINT.test(spaced);
    const notBevHint = NOT_BEV_HINT.test(norm(lower)) || NOT_BEV_HINT.test(spaced);
    // latin tokens no alias explains, e.g. "Xiaomi SU7"
    const unknown = cars.length ? [] : (lower.match(/[a-z][a-z0-9:+\-]*/g) || [])
      .filter(w => !NOT_A_CAR.has(w) && !/^type\d/.test(w) && !/^(ev|type)\d$/.test(w));
    return { cars, evHint, notBevHint, unknown };
  }

  // what the question names: plans, coverages, general policy topics, and the car if any
  // "ชั้น 1 กับ 3", "ประเภท 2+ หรือ 3+": the second number shares the first one's word
  function expandPlanList(text) {
    const re = /(ชั้น|ประเภท)\s*([1-5]\+?)\s*(กับ|หรือ|และ|vs\.?|,)\s*([1-5]\+?)(?![0-9.])/gi;
    let prev, t = String(text || '');
    do { prev = t; t = t.replace(re, '$1$2 $3 $1$4'); } while (t !== prev);
    return t;
  }

  function route(text) {
    let plans = detect(expandPlanList(text), PLAN_SYN, true);
    const covs = detect(text, COV_TABLE, false), topics = detect(text, TOPIC_TABLE, false);
    const events = longest(text, D.events || []), factors = longest(text, D.factors || []);
    // an event names the coverages it maps to ("ถอยชนเสา" -> nocp, pd) when the question names none itself
    if (!covs.length) events.forEach(id => (D.events.find(e => e.id === id).covs || []).forEach(c => { if (!covs.includes(c)) covs.push(c); }));
    const definitions = definitionsIn(text), nt = norm(text), deadlines = DL_ASK.test(nt), recovery = REC_ASK.test(nt);
    const { cars, evHint, notBevHint, unknown } = detectVehicle(text);
    const flags = [];
    const pts = [...new Set(cars.map(c => c.powertrain))];
    // BEV when: the car is BEV, or the user says EV and nothing they named contradicts it
    let ev = null;
    const nonBev = pts.length && pts.every(p => p !== 'BEV' && p !== 'ambiguous');
    if (notBevHint) ev = false;
    else if (pts.length === 1 && pts[0] === 'BEV') ev = true;
    // the user says EV but the model they name is a petrol/diesel or hybrid car ("Camry EV"): a new or unlisted
    // electric version, or a hybrid called "รถไฟฟ้า"; the answer can differ, so ask instead of trusting either side
    else if (nonBev && evHint) flags.push('ask_vehicle');
    else if (nonBev) ev = false;
    else if (evHint) ev = true;
    else if (pts.includes('ambiguous') || pts.length > 1) flags.push('ask_vehicle');
    if (ev === true) {
      if (plans.some(p => !EV_OF[p] && !p.startsWith('ev') && p !== 'cmi')) flags.push('ev_no_variant');
      plans = [...new Set(plans.map(p => EV_OF[p] || p))];
      if (!plans.length) plans = ['ev1', 'ev2', 'ev3'];
    } else if (ev === false && (cars.length || notBevHint)) {
      flags.push('not_bev');
      plans = [...new Set(plans.map(p => Object.keys(EV_OF).find(k => EV_OF[k] === p) || p))];
    } else if (flags.includes('ask_vehicle')) {
      // answer can differ between the regular and the EV wording: keep both so the reply can say how
      // ("Camry EV ชั้น 1" names ev1 itself, so the regular plan is added back too)
      const regOf = p => Object.keys(EV_OF).find(k => EV_OF[k] === p);
      plans = [...new Set(plans.flatMap(p => EV_OF[p] ? [p, EV_OF[p]] : regOf(p) ? [regOf(p), p] : [p]))];
    }
    if (!cars.length && ev === null && unknown.length) flags.push('unknown_vehicle');
    const vehicle = (cars.length || ev !== null || unknown.length) ? {
      cars: cars.map(c => ({ id: c.id, name: c.name, powertrain: c.powertrain, variants: c.variants || null })),
      electric: ev, unknown_words: unknown, definition_clause: VEH.definition && VEH.definition.ev1 || null
    } : null;
    // question type: decides how the answer is shaped, and a "how do I claim" question also brings the claim steps
    const qtype = QT.filter(([, re]) => re.test(nt)).map(([id]) => id);
    if (plans.length > 1 && !qtype.includes('compare')) qtype.push('compare');
    if (definitions.length) qtype.push('definition');
    if (deadlines) qtype.push('deadline');
    if (recovery) qtype.push('recovery');
    if ((events.length || factors.length) && NARRATE.test(nt)) qtype.push('narrative');
    let dl = deadlines;
    if (qtype.includes('procedure')) {
      if (!topics.includes('claim')) topics.push('claim');
      dl = true;
    }
    const r = { plans, covs, topics, flags, vehicle, events, factors, definitions, deadlines: dl, recovery, qtype };
    r.oos = outOfScope(text, r);
    if (r.oos) flags.push('oos');
    // nothing about insurance or cars at all ("กินอะไรดี", "สวัสดี", "อธิบายเพิ่มหน่อย"): the graph has nothing to show for it
    r.offtopic = !r.oos && !plans.length && !covs.length && !topics.length && !events.length && !factors.length
      && !definitions.length && !(vehicle && vehicle.cars.length) && !dl && !recovery && !ON_TOPIC.test(nt);
    return r;
  }

  return { norm, resolvePlan, resolveCov, resolveTopic, route, detectVehicle };
}
