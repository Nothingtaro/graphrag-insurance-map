// Local server for the GraphRAG insurance map.
// Serves ./public and proxies chat turns to the Claude API, so the API key stays on this machine.
// The tool loop runs in the browser (public/js/claude-local.js) because the tools drive the graph UI.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const PORT = Number(process.env.PORT || 5173);
const MODEL = process.env.GRAPHRAG_MODEL || 'claude-sonnet-5-5';
const EFFORT = process.env.GRAPHRAG_EFFORT || 'medium';

// Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
const client = new Anthropic();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    const ext = path.extname(file);
    // revalidate code and markup on every load so edits show up without a hard refresh; fonts rarely change
    const cache = ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': cache }).end(buf);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', c => { body += c; if (body.length > 5e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function errorCode(e) {
  if (e instanceof Anthropic.APIUserAbortError) return 'cancelled';
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'auth_error';
  if (e instanceof Anthropic.BadRequestError) return 'bad_request';
  if (e instanceof Anthropic.APIConnectionError) return 'connection_error';
  if (e instanceof Anthropic.APIError) return 'upstream_error';
  if (e && /credential|api.?key|auth/i.test(e.message || '')) return 'auth_error';
  return 'upstream_error';
}

// POST /api/messages  { messages, tools? }  ->  NDJSON stream:
//   {"type":"text","text":"<delta>"} ...  then  {"type":"done","message":{content,stop_reason,model}}
//   or {"type":"error","code":"...","message":"..."}
async function handleMessages(req, res) {
  let body;
  try { body = await readJson(req); } catch { res.writeHead(400).end(); return; }
  if (!Array.isArray(body.messages) || !body.messages.length) { res.writeHead(400).end(); return; }

  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
  const send = obj => res.write(JSON.stringify(obj) + '\n');
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });

  // a caller may ask for less effort on a small job (the chat title); anything else keeps the server default
  const effort = ['low', 'medium', 'high'].includes(body.effort) ? body.effort : EFFORT;
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort },
    messages: body.messages,
    // Re-run the request on a fallback model if a safety classifier declines it.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default'
  };
  if (Array.isArray(body.tools) && body.tools.length) {
    params.tools = body.tools.map(t => ({
      name: String(t.name), description: String(t.description || ''), input_schema: t.input_schema,
      eager_input_streaming: true
    }));
  }

  try {
    const stream = client.beta.messages.stream(params, { signal: ac.signal });
    stream.on('text', delta => send({ type: 'text', text: delta }));
    const msg = await stream.finalMessage();
    send({ type: 'done', message: { content: msg.content, stop_reason: msg.stop_reason, model: msg.model } });
  } catch (e) {
    const code = errorCode(e);
    if (code !== 'cancelled') console.error(`[api] ${code}:`, e && e.message);
    if (!res.writableEnded) send({ type: 'error', code, message: e && e.message ? String(e.message) : code });
  }
  res.end();
}

// POST /api/feedback  one rating snapshot per call  ->  appended to feedback/feedback.jsonl
// The log is append-only: a changed or withdrawn rating is a new line with the same fb_id; readers keep the last one
// (ingest/feedback_report.mjs). Fields are checked and capped so a bad client cannot write junk or huge lines.
const FEEDBACK_LOG = process.env.GRAPHRAG_FEEDBACK_LOG || path.join(here, 'feedback', 'feedback.jsonl');
const FEEDBACK_DIR = path.dirname(FEEDBACK_LOG);
const FB_REASONS = new Set(['wrong_fact', 'off_topic', 'bad_cite', 'incomplete', 'unclear', 'other']);
const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
const smallJson = (v, n) => { try { const s = JSON.stringify(v ?? null); return s.length <= n ? v ?? null : null; } catch { return null; } };
function cleanFeedback(b) {
  if (!b || typeof b !== 'object' || !/^[a-z0-9]{6,40}$/i.test(b.fb_id || '')) return null;
  if (![null, 'up', 'down'].includes(b.rating ?? null)) return null;
  if (!['llm', 'preset', 'oos'].includes(b.kind)) return null;
  return {
    ts: new Date().toISOString(), fb_id: b.fb_id, chat_id: str(b.chat_id, 40) || null, kind: b.kind, server_model: MODEL,
    rating: b.rating ?? null,
    reasons: Array.isArray(b.reasons) ? [...new Set(b.reasons.filter(r => FB_REASONS.has(r)))] : [],
    comment: str(b.comment, 2000), question: str(b.question, 4000), answer: str(b.answer, 20000),
    cited: Array.isArray(b.cited) ? b.cited.filter(c => typeof c === 'string' && /^[a-z0-9_]{1,80}$/.test(c)).slice(0, 60) : [],
    facts: smallJson(b.facts, 4000), route: smallJson(b.route, 4000),
    data_built: str(b.data_built, 20) || null, client_ts: str(b.client_ts, 40) || null
  };
}
async function handleFeedback(req, res) {
  let body;
  try { body = await readJson(req); } catch { res.writeHead(400).end(); return; }
  const rec = cleanFeedback(body);
  if (!rec) { res.writeHead(400, { 'content-type': 'application/json' }).end('{"ok":false}'); return; }
  try {
    await fs.promises.mkdir(FEEDBACK_DIR, { recursive: true });
    await fs.promises.appendFile(FEEDBACK_LOG, JSON.stringify(rec) + '\n', 'utf8');
  } catch (e) {
    console.error('[feedback]', e.message);
    res.writeHead(500).end(); return;
  }
  res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
}

http.createServer((req, res) => {
  if (req.url === '/api/feedback' && req.method === 'POST') {
    handleFeedback(req, res).catch(e => { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); });
  } else if (req.url === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, model: MODEL }));
  } else if (req.url === '/api/messages' && req.method === 'POST') {
    handleMessages(req, res).catch(e => { console.error(e); if (!res.headersSent) res.writeHead(500); res.end(); });
  } else if (req.method === 'GET') {
    serveStatic(req, res);
  } else {
    res.writeHead(405).end();
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`GraphRAG map: http://localhost:${PORT}  (model ${MODEL}, effort ${EFFORT})`);
});
