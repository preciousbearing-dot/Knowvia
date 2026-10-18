/* The Android app's own offline engine (llama.cpp inside the app). In a browser or on a laptop this file does nothing.
   It lets the rest of Knowvia talk to the phone engine exactly as it talks to Ollama: a stand-in for /ollama/api/chat and /api/tags. */
(function () {
'use strict';
const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const A = () => window.KVApp;
const HF = (repo, file) => 'https://huggingface.co/' + repo + '/resolve/main/' + file;

/* From lightest to strongest. Q4_K_M files from the model makers' own pages or the most used community mirrors. Sizes are exact bytes. */
const CATALOG = [
  { id: 'Qwen 2.5 0.5B', name: 'Qwen 2.5 0.5B', b: 0.5, bytes: 491400032, ram: 3, file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', url: HF('Qwen/Qwen2.5-0.5B-Instruct-GGUF', 'qwen2.5-0.5b-instruct-q4_k_m.gguf'), note: 'Tiny and very quick. Fine for simple questions, but expect mistakes on anything harder.' },
  { id: 'Gemma 3 1B', name: 'Gemma 3 1B', b: 1.0, bytes: 806058240, ram: 3, file: 'gemma-3-1b-it-Q4_K_M.gguf', url: HF('ggml-org/gemma-3-1b-it-GGUF', 'gemma-3-1b-it-Q4_K_M.gguf'), note: 'Small, clear and friendly. Good for short explanations.' },
  { id: 'Llama 3.2 1B', name: 'Llama 3.2 1B', b: 1.2, bytes: 807694464, ram: 3, file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', url: HF('bartowski/Llama-3.2-1B-Instruct-GGUF', 'Llama-3.2-1B-Instruct-Q4_K_M.gguf'), note: 'Small and quick. Simple explanations and short answers.' },
  { id: 'SmolLM2 1.7B', name: 'SmolLM2 1.7B', b: 1.7, bytes: 1055609824, ram: 4, file: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf', url: HF('bartowski/SmolLM2-1.7B-Instruct-GGUF', 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf'), note: 'Made to be small and useful. Plain, simple answers.' },
  { id: 'Qwen 2.5 1.5B', name: 'Qwen 2.5 1.5B', b: 1.5, bytes: 1117320736, ram: 4, file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', url: HF('Qwen/Qwen2.5-1.5B-Instruct-GGUF', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'), note: 'The best balance of quality and speed for most phones. Decent maths and reading.' },
  { id: 'Gemma 2 2B', name: 'Gemma 2 2B', b: 2.6, bytes: 1708582752, ram: 5, file: 'gemma-2-2b-it-Q4_K_M.gguf', url: HF('bartowski/gemma-2-2b-it-GGUF', 'gemma-2-2b-it-Q4_K_M.gguf'), note: 'Clear, friendly explanations. Slower on most phones.' },
  { id: 'Llama 3.2 3B', name: 'Llama 3.2 3B', b: 3.2, bytes: 2019377696, ram: 5, file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', url: HF('bartowski/Llama-3.2-3B-Instruct-GGUF', 'Llama-3.2-3B-Instruct-Q4_K_M.gguf'), note: 'A very good small tutor. Needs a strong phone to feel quick.' },
  { id: 'Qwen 2.5 3B', name: 'Qwen 2.5 3B', b: 3.1, bytes: 2104932768, ram: 5, file: 'qwen2.5-3b-instruct-q4_k_m.gguf', url: HF('Qwen/Qwen2.5-3B-Instruct-GGUF', 'qwen2.5-3b-instruct-q4_k_m.gguf'), note: 'Strong at maths, structure and following instructions. Slow on mid-range phones.' },
  { id: 'Phi 3.5 Mini', name: 'Phi 3.5 Mini', b: 3.8, bytes: 2393232672, ram: 6, file: 'Phi-3.5-mini-instruct-Q4_K_M.gguf', url: HF('bartowski/Phi-3.5-mini-instruct-GGUF', 'Phi-3.5-mini-instruct-Q4_K_M.gguf'), note: 'Good reasoning for its size. The heaviest one here.' }
];

const ST = { specs: null, files: [], loaded: '', dl: { state: 'idle', pct: 0 }, tps: 0, bound: false, loadErr: '' };
const subs = [];
const onChange = () => { subs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); };
function P() { try { return native ? ((cap.Plugins && cap.Plugins.KnowviaDevice) || (cap.registerPlugin && (P._c = P._c || cap.registerPlugin('KnowviaDevice')))) : null; } catch (e) { return null; } }
const byId = (id) => CATALOG.find((m) => m.id === id);
const byFile = (f) => CATALOG.find((m) => m.file === f);
const installedIds = () => CATALOG.filter((m) => ST.files.some((x) => x.file === m.file && x.bytes >= m.bytes * 0.99)).map((m) => m.id);
const streams = Object.create(null);

function bind() {
  const p = P(); if (!p || ST.bound) return; ST.bound = true;
  p.addListener('download', (e) => {
    const was = ST.dl.state; ST.dl = e || ST.dl;
    if (ST.dl.state !== was) {
      if (ST.dl.state === 'done') { keepAwake(false); refresh().then(() => { const m = byFile(ST.dl.file); if (m) done(m); }); }
      else if (['paused', 'error', 'idle'].includes(ST.dl.state)) keepAwake(false);
    }
    onChange();
  });
  p.addListener('token', (e) => { const f = e && streams[e.rid]; if (f) f(e.text || ''); });
}
function keepAwake(on) { const p = P(); if (p) p.keepAwake({ on: !!on }).catch(() => {}); }
function done(m) {
  const a = A(); if (!a) return;
  try {
    a.setLocalModels(installedIds());
    const S = a.S, anyCloud = Object.keys(S.tutor.clouds).some((k) => S.tutor.clouds[k] && S.tutor.clouds[k].ok);
    if (!S.tutor.model || !installedIds().includes(S.tutor.model)) S.tutor.model = m.id;
    if (!anyCloud) S.tutor.brain = 'local';
    S.tutor.url = location.origin + '/ollama';
    a.save(); a.toast(m.name + ' is ready on your phone'); if (a.afterTutorChange) a.afterTutorChange();
  } catch (e) { /* ignore */ }
}

async function refresh() {
  const p = P(); if (!p) throw new Error('no engine');
  bind();
  const [sp, ms, dl] = await Promise.all([p.specs(), p.models(), p.downloadStatus()]);
  ST.specs = sp; ST.files = ms.models || []; ST.loaded = ms.loaded || ''; ST.dl = dl || ST.dl;
  onChange();
  return ST;
}

/* ---- downloads ---- */
async function download(id) {
  const m = byId(id), p = P(); if (!m || !p) return;
  bind(); keepAwake(true);
  try { ST.dl = await p.download({ id: m.id, file: m.file, url: m.url, bytes: m.bytes }); }
  catch (e) { ST.dl = { state: 'error', id: m.id, file: m.file, error: (e && e.message) || 'The download could not start.', pct: 0 }; keepAwake(false); }
  onChange();
}
async function pause() { const p = P(); if (!p) return; try { ST.dl = await p.pauseDownload(); } catch (e) { /* ignore */ } onChange(); }
async function cancel() { const p = P(); if (!p) return; try { ST.dl = await p.cancelDownload({ file: ST.dl.file }); } catch (e) { /* ignore */ } keepAwake(false); await refresh().catch(() => {}); onChange(); }
async function remove(id) {
  const m = byId(id), p = P(); if (!m || !p) return;
  try { await p.deleteModel({ file: m.file }); } catch (e) { /* ignore */ }
  if (ST.loaded === m.file) ST.loaded = '';
  await refresh().catch(() => {});
  const a = A(); if (a) { a.setLocalModels(installedIds()); if (a.S.tutor.model === id) { a.S.tutor.model = installedIds()[0] || ''; a.save(); } }
  onChange();
}

/* ---- the engine, behind an Ollama-shaped door ---- */
let chain = Promise.resolve();
function ensureLoaded(m) {
  const p = P();
  const job = chain.then(async () => {
    if (ST.loaded === m.file) return;
    const ram = (ST.specs && ST.specs.ramGb) || 6;
    ST.loadErr = '';
    await p.load({ file: m.file, nCtx: ram >= 6 ? 4096 : 3072 });
    ST.loaded = m.file; onChange();
  });
  chain = job.catch(() => {});
  return job;
}
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
const abortErr = () => { try { return new DOMException('Aborted', 'AbortError'); } catch (e) { const x = new Error('Aborted'); x.name = 'AbortError'; return x; } };
let ridN = 0;

async function chatReq(body, signal) {
  const p = P(), m = byId(body.model);
  if (!p) return json({ error: 'engine unavailable' }, 503);
  if (!m || !installedIds().includes(m.id)) return json({ error: 'model not installed' }, 404);
  if (signal && signal.aborted) throw abortErr();
  const opts = body.options || {};
  const messages = (body.messages || []).map((x) => ({ role: x.role, content: String(x.content || '') }));
  const maxTokens = Math.max(32, Math.min(1500, Math.round(opts.num_predict || 700)));
  const temperature = typeof opts.temperature === 'number' ? opts.temperature : 0.4;
  const rid = 'r' + (++ridN) + '-' + Date.now();
  const line = (txt, fin) => JSON.stringify({ model: m.id, message: { role: 'assistant', content: txt }, done: !!fin }) + '\n';
  const track = (r) => { if (r && r.genTokens > 3 && r.genMs > 0) { ST.tps = Math.round((r.genTokens / (r.genMs / 1000)) * 10) / 10; onChange(); } };
  keepAwake(true);
  const finish = () => keepAwake(false);
  const run = async (sink) => {
    await ensureLoaded(m);
    if (signal && signal.aborted) throw abortErr();
    streams[rid] = sink;
    try { const r = await p.generate({ rid, messages, maxTokens, temperature }); track(r); return r; }
    finally { delete streams[rid]; }
  };
  const onAbort = () => { p.stop({ rid }).catch(() => {}); };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  if (body.stream === false) {
    let text = '';
    try { await run((t) => { text += t; }); }
    catch (e) { finish(); if (signal && signal.aborted) throw abortErr(); return json({ error: (e && e.message) || 'The tutor could not answer.' }, 500); }
    finish();
    return json({ model: m.id, message: { role: 'assistant', content: text }, done: true });
  }
  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(ctl) {
      run((t) => { if (!closed) ctl.enqueue(enc.encode(line(t, false))); })
        .then(() => { if (!closed) { closed = true; ctl.enqueue(enc.encode(line('', true))); ctl.close(); } finish(); })
        .catch((e) => { finish(); if (closed) return; closed = true; ctl.error(signal && signal.aborted ? abortErr() : new Error((e && e.message) || 'The tutor could not answer.')); });
    },
    cancel() { closed = true; p.stop({ rid }).catch(() => {}); finish(); }
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

if (native) {
  const origFetch = window.fetch.bind(window);
  const prefix = location.origin + '/ollama';
  window.fetch = function (input, init) {
    let url = ''; try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch (e) { url = ''; }
    if (url.indexOf(prefix + '/') !== 0) return origFetch(input, init);
    const path = url.slice(prefix.length).split('?')[0];
    if (path === '/api/tags') return refresh().then(() => json({ models: installedIds().map((n) => ({ name: n })) })).catch(() => json({ models: [] }));
    if (path === '/api/version') return Promise.resolve(json({ version: 'knowvia-device' }));
    if (path === '/api/chat') {
      let body = {}; try { body = JSON.parse((init && init.body) || '{}'); } catch (e) { /* ignore */ }
      return chatReq(body, init && init.signal);
    }
    return Promise.resolve(json({ error: 'not found' }, 404));
  };
}

window.KVDevice = { native, CATALOG, state: ST, refresh, download, pause, cancel, remove, installedIds, byId, byFile, subscribe: (f) => subs.push(f), keepAwake };
})();
