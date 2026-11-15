// Local stand-in for the claude.ai artifact runtime's `window.claude.use('sample')`.
// app.js calls sample(messages, { signal, onText, tools }) and expects { text } back, exactly as on claude.ai.
// Each model turn goes through the local server (server.mjs -> Claude API). Tools run here in the page,
// because their execute() functions drive the graph UI.
(function () {
  const MAX_ROUNDS = 8;

  function fail(code, message, text) {
    const e = new Error(message || code);
    e.code = code;
    if (text) e.text = text;
    return e;
  }

  // One model turn. Streams text deltas to onDelta, resolves with { content, stop_reason, model }.
  async function turn(messages, tools, signal, onDelta, effort) {
    let res;
    try {
      res = await fetch('/api/messages', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, tools, effort }), signal
      });
    } catch (e) {
      throw e && e.name === 'AbortError' ? fail('cancelled') : fail('connection_error', String(e));
    }
    if (!res.ok || !res.body) throw fail('upstream_error', 'HTTP ' + res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', done = null;
    const handle = line => {
      if (!line.trim()) return;
      const ev = JSON.parse(line);
      if (ev.type === 'text') onDelta(ev.text);
      else if (ev.type === 'done') done = ev.message;
      else if (ev.type === 'error') throw fail(ev.code || 'upstream_error', ev.message);
    };
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      handle(buf);
    } catch (e) {
      if (e && e.name === 'AbortError') throw fail('cancelled');
      throw e;
    }
    if (!done) throw fail('upstream_error', 'stream ended early');
    return done;
  }

  // After a mid-output fallback, blocks of the declined attempt (thinking, tool_use, ...) before the
  // last `fallback` block must not be echoed back; text blocks and the fallback block itself stay in place.
  function echoable(content) {
    let cut = -1;
    content.forEach((b, i) => { if (b.type === 'fallback') cut = i; });
    if (cut < 0) return content;
    const paired = new Set(content.filter(b => b.type && b.type.endsWith('_tool_result')).map(b => b.tool_use_id));
    return content.filter((b, i) => i >= cut || b.type === 'text' ||
      (b.type === 'server_tool_use' && paired.has(b.id)) || (b.type && b.type.endsWith('_tool_result')));
  }

  const textOf = content => content.filter(b => b.type === 'text').map(b => b.text).join('');

  // Tool inputs stream eagerly, so check required fields before running anything.
  function badInput(tool, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
    const s = tool.inputSchema || {};
    for (const k of s.required || []) {
      if (input[k] === undefined || input[k] === null || input[k] === '') return 'missing required field: ' + k;
    }
    for (const [k, v] of Object.entries(input)) {
      const p = (s.properties || {})[k];
      if (p && p.type === 'string' && typeof v !== 'string') return 'field ' + k + ' must be a string';
    }
    return null;
  }

  async function sample(msgs, opts = {}) {
    const { signal, onText, tools, effort } = opts;
    const defs = tools && tools.length
      ? tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
      : undefined;
    const convo = msgs.map(m => ({ role: m.role, content: m.content }));
    let lastText = '';
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let acc = '';
      const msg = await turn(convo, defs, signal, d => { acc += d; if (onText) onText({ text: acc }); }, effort);
      const content = echoable(msg.content || []);
      lastText = textOf(content) || acc;
      if (msg.stop_reason === 'refusal') throw fail('refused', 'refused', lastText);
      if (msg.stop_reason !== 'tool_use' || !tools) return { text: lastText, stopReason: msg.stop_reason, model: msg.model };

      convo.push({ role: 'assistant', content });
      const results = [];
      for (const b of content.filter(x => x.type === 'tool_use')) {
        const tool = tools.find(t => t.name === b.name);
        let out, isError = false;
        const bad = tool ? badInput(tool, b.input) : 'unknown tool ' + b.name;
        if (bad) { out = bad; isError = true; }
        else {
          try { out = JSON.stringify(await tool.execute(b.input)); }
          catch (e) { out = String(e && e.message || e); isError = true; }
        }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: out, ...(isError ? { is_error: true } : {}) });
      }
      if (!results.length) return { text: lastText };
      convo.push({ role: 'user', content: results });
      if (signal && signal.aborted) throw fail('cancelled');
    }
    return { text: lastText };
  }
  sample.limits = () => Promise.resolve({ tools: true });

  window.claude = {
    use(name) {
      if (name !== 'sample') return Promise.reject(fail('capability_disabled', 'only "sample" is available locally'));
      // null when the page isn't served by server.mjs (e.g. opened as a file) -> app shows the offline note
      return fetch('/api/health').then(r => (r.ok ? sample : null)).catch(() => null);
    }
  };
})();
