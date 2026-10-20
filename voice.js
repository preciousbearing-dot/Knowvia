/* Knowvia's voice: three ways to speak (a cloud voice, a small voice that lives on the phone, and the phone's own voice),
   one player that reads chat answers and whole lessons, and a store that keeps what was already spoken so it never costs twice. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const VP = () => { try { return native ? ((cap.Plugins && cap.Plugins.KnowviaVoice) || (cap.registerPlugin && (VP._c = VP._c || cap.registerPlugin('KnowviaVoice')))) : null; } catch (e) { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE = 16000;   /* everything is stored and played as 16 kHz mono: clear for speech, and small */

/* ---------------- Settings ---------------- */
const DEF = { engine: 'auto', rate: 1, rewrite: true, autoNext: false, threads: 0, cloud: {}, off: {}, phone: '', pos: {}, cbUntil: 0 };
function V() {
  const S = A().S; if (!S.voice || typeof S.voice !== 'object') S.voice = {};
  const v = S.voice; Object.keys(DEF).forEach((k) => { if (v[k] === undefined) v[k] = (typeof DEF[k] === 'object') ? JSON.parse(JSON.stringify(DEF[k])) : DEF[k]; });
  return v;
}
const roleId = () => { try { return (A().S.persona && A().S.persona.role) || 'amani'; } catch (e) { return 'amani'; } };

/* Gemini's studio voices, with the character each one has. Each Amani personality starts with a sensible one, and the learner can change it. */
const GEM_VOICES = [['Sulafat', 'Warm'], ['Achird', 'Friendly'], ['Puck', 'Upbeat'], ['Zephyr', 'Bright'], ['Leda', 'Youthful'], ['Laomedeia', 'Upbeat'], ['Zubenelgenubi', 'Casual'], ['Sadachbia', 'Lively'],
  ['Vindemiatrix', 'Gentle'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Umbriel', 'Easy-going'], ['Achernar', 'Soft'], ['Despina', 'Smooth'], ['Algieba', 'Smooth'], ['Enceladus', 'Breathy'],
  ['Iapetus', 'Clear'], ['Erinome', 'Clear'], ['Schedar', 'Even'], ['Charon', 'Informative'], ['Rasalgethi', 'Informative'], ['Sadaltager', 'Knowledgeable'], ['Kore', 'Firm'], ['Orus', 'Firm'],
  ['Alnilam', 'Firm'], ['Gacrux', 'Mature'], ['Algenib', 'Gravelly'], ['Pulcherrima', 'Forward'], ['Autonoe', 'Bright'], ['Fenrir', 'Excitable']];
const GEM_DEFAULT = { amani: 'Sulafat', teacher: 'Iapetus', tutor: 'Vindemiatrix', coach: 'Orus', mentor: 'Gacrux', friend: 'Achird', partner: 'Zubenelgenubi', bigbro: 'Charon', bigsis: 'Leda', father: 'Rasalgethi', padi: 'Puck', sabi: 'Sadaltager', homegirl: 'Laomedeia', homeboy: 'Zubenelgenubi' };
const STYLE = {
  amani: 'warmly and patiently, like a friendly study guide', teacher: 'clearly and calmly, like a good teacher', tutor: 'gently and attentively, like a private tutor', coach: 'with energy and encouragement, like a coach',
  mentor: 'calmly and thoughtfully, like a wise mentor', friend: 'in a relaxed, friendly way', partner: 'casually, like a study partner thinking aloud', bigbro: 'with steady, caring confidence', bigsis: 'with warmth and honesty, cheering the listener on',
  father: 'steadily and kindly', padi: 'casually and playfully, like a close friend', sabi: 'sharply and confidently, like the friend who really knows the subject', homegirl: 'with warmth and hype, encouraging', homeboy: 'in an easy-going, straight-talking way'
};
const OFF_DEFAULT = { amani: 1, teacher: 3, tutor: 5, coach: 4, mentor: 2, friend: 3, partner: 6, bigbro: 0, bigsis: 5, father: 2, padi: 4, sabi: 2, homegirl: 7, homeboy: 6 };
const gemVoice = () => V().cloud[roleId()] || GEM_DEFAULT[roleId()] || 'Sulafat';
const offSid = () => { const o = V().off[roleId()]; return o == null ? (OFF_DEFAULT[roleId()] == null ? 1 : OFF_DEFAULT[roleId()]) : o; };
const styleOf = () => STYLE[roleId()] || STYLE.amani;

/* ---------------- Small helpers ---------------- */
function hash(s) { let a = 0x811c9dc5, b = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2246822519) ^ (b >>> 13); } return (a >>> 0).toString(36) + (b >>> 0).toString(36); }
function b64ToInt16(b64) { const bin = atob(b64), n = bin.length >> 1, out = new Int16Array(n); for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); out[i] = v > 32767 ? v - 65536 : v; } return out; }
function resample(pcm, from, to) {
  if (from === to) return pcm;
  const n = Math.max(1, Math.floor(pcm.length * to / from)), out = new Int16Array(n), step = from / to;
  for (let i = 0; i < n; i++) { const x = i * step, j = Math.floor(x), f = x - j, a = pcm[j] || 0, b = pcm[j + 1] === undefined ? a : pcm[j + 1]; out[i] = a + (b - a) * f; }
  return out;
}
function toWav(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
}
function mk(kind, msg, extra) { const e = new Error(msg || kind); e.kind = kind; if (extra) Object.assign(e, extra); return e; }

/* ---------------- Turning a lesson into something worth hearing ---------------- */
function latex(x) {
  let s = String(x);
  for (let i = 0; i < 3; i++) s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 over $2').replace(/\\sqrt\s*\{([^{}]*)\}/g, 'the square root of $1');
  return s.replace(/\\times|\\cdot/g, ' times ').replace(/\\div/g, ' divided by ').replace(/\\pm/g, ' plus or minus ').replace(/\\(?:le|leq)\b/g, ' is less than or equal to ').replace(/\\(?:ge|geq)\b/g, ' is greater than or equal to ')
    .replace(/\\(?:ne|neq)\b/g, ' is not equal to ').replace(/\\(pi|theta|alpha|beta|sigma|delta|lambda|mu)\b/g, ' $1 ').replace(/\^\{?2\}?/g, ' squared ').replace(/\^\{?3\}?/g, ' cubed ')
    .replace(/\^\{([^{}]*)\}/g, ' to the power $1 ').replace(/\^(\w)/g, ' to the power $1 ').replace(/_\{([^{}]*)\}/g, ' sub $1 ').replace(/_(\w)/g, ' sub $1 ').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '');
}
function symbols(s) {
  return s.replace(/₦\s?([\d][\d,.]*)/g, '$1 naira').replace(/£\s?([\d][\d,.]*)/g, '$1 pounds').replace(/€\s?([\d][\d,.]*)/g, '$1 euros')
    .replace(/(\d)\s?%/g, '$1 percent').replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/≤/g, ' is less than or equal to ').replace(/≥/g, ' is greater than or equal to ').replace(/≠/g, ' is not equal to ').replace(/≈/g, ' is about ')
    .replace(/√\s?(\w+)/g, ' the square root of $1 ').replace(/π/g, ' pi ').replace(/²/g, ' squared ').replace(/³/g, ' cubed ')
    .replace(/(\d)\s*[−–]\s*(\d)/g, '$1 minus $2').replace(/(\w)\s*=\s*(\w)/g, '$1 equals $2').replace(/(\w|\))\s*\+\s*(\w|\()/g, '$1 plus $2').replace(/\b(\w{1,3})\/(\w{1,3})\b/g, '$1 over $2')
    .replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\bvs\.?\s/gi, 'versus ').replace(/\betc\./gi, 'and so on.');
}
/* Lesson markdown to plain, speakable sentences. Tables, code and pictures are announced, not read out. */
function speakable(md) {
  let s = String(md || '').replace(/\r/g, '');
  s = s.replace(/\\([*#_`])/g, '$1');
  s = s.replace(/```[\s\S]*?```/g, '\nThere is a code example on screen.\n');
  s = s.replace(/^:::\s*keyidea.*$/gim, '\nKey idea.').replace(/^:::\s*example(?:\s+title=(.*))?$/gim, (m, t) => '\nExample' + (t ? ': ' + t.trim() : '') + '.').replace(/^:::\s*exercise(?:\s+title=(.*))?$/gim, (m, t) => '\nYour turn' + (t ? ': ' + t.trim() : '') + '.')
    .replace(/^:::\s*compare.*$/gim, '\nHere is a comparison.').replace(/^:::\s*check.*$/gim, '').replace(/^:::\s*\w+.*$/gim, '').replace(/^:::\s*$/gm, '\n');
  s = s.replace(/^\s*(weak|strong|note)\s*:\s*/gim, (m, k) => ({ weak: 'The weaker version: ', strong: 'The stronger version: ', note: 'Note: ' })[k.toLowerCase()]);
  s = s.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '');
  s = s.replace(/^\s*\|(.+)\|\s*$/gm, (m, row) => row.split('|').map((c) => c.trim()).filter(Boolean).join(', ') + '.');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, (m, alt) => (alt ? 'A picture: ' + alt + '.' : '')).replace(/\[([^\]]+)\]\((https?:[^)]*)\)/g, '$1').replace(/https?:\/\/\S+/g, 'a link').replace(/\[(?:p\.|pp\.)\s*[^\]]*\]/gi, '');
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, x) => ' ' + latex(x) + ' ').replace(/\\\(([\s\S]+?)\\\)/g, (m, x) => ' ' + latex(x) + ' ').replace(/\$([^$\n]{1,80}?)\$/g, (m, x) => (/[\\^_{}=]/.test(x) ? ' ' + latex(x) + ' ' : m));
  s = s.replace(/^\s{0,3}#{1,6}\s*(.+?)\s*#*\s*$/gm, (m, h) => '\n' + h.replace(/[.:!?]+$/, '') + '.\n').replace(/^\s*>\s?/gm, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '').replace(/^\s*[-*_]{3,}\s*$/gm, '\n');
  s = s.replace(/\*\*\*?([^*\n]+)\*\*\*?/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2').replace(/`([^`\n]+)`/g, '$1').replace(/<[^>]+>/g, ' ');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
  s = symbols(s);
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+([.,;:!?])/g, '$1').replace(/([.!?])\s*\.\s/g, '$1 ');
  return s.trim();
}
/* Cut the text into pieces a voice can speak in one go. The first piece is short so sound starts quickly. */
function split(text, max, first) {
  const out = [], paras = String(text || '').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  let cur = '';
  const limit = () => (out.length === 0 ? (first || max) : max);
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  paras.forEach((p) => {
    const sents = p.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) || [p];
    sents.forEach((sn) => {
      sn = sn.trim(); if (!sn) return;
      while (sn.length > limit()) {
        let cut = sn.lastIndexOf(', ', limit()); if (cut < limit() * 0.4) cut = sn.lastIndexOf(' ', limit()); if (cut < 20) cut = limit();
        if (cur) push(); out.push(sn.slice(0, cut + 1).trim()); sn = sn.slice(cut + 1).trim();
      }
      if (cur && (cur.length + sn.length + 1 > limit())) push();
      cur += (cur ? ' ' : '') + sn;
    });
    if (cur.length > limit() * 0.6) push();   /* a paragraph break is a natural place to breathe */
  });
  push();
  return out;
}

/* ---------------- Saved audio ---------------- */
let DBP = null;
function db() {
  if (DBP) return DBP;
  DBP = new Promise((res, rej) => {
    try {
      const rq = indexedDB.open('knowvia-voice', 1);
      rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('clips')) d.createObjectStore('clips', { keyPath: 'k' }); if (!d.objectStoreNames.contains('scripts')) d.createObjectStore('scripts', { keyPath: 'k' }); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    } catch (e) { rej(e); }
  }).catch(() => null);
  return DBP;
}
async function idb(store, mode, fn) {
  const d = await db(); if (!d) return undefined;
  return new Promise((res) => { try { const tx = d.transaction(store, mode), os = tx.objectStore(store); const rq = fn(os); tx.oncomplete = () => res(rq && 'result' in rq ? rq.result : undefined); tx.onerror = tx.onabort = () => res(undefined); } catch (e) { res(undefined); } });
}
const clipGet = (k) => idb('clips', 'readonly', (os) => os.get(k));
const scriptGet = (k) => idb('scripts', 'readonly', (os) => os.get(k));
const scriptPut = (k, text) => idb('scripts', 'readwrite', (os) => os.put({ k, text, t: Date.now() }));
let puts = 0;
async function clipPut(k, pcm) {
  await idb('clips', 'readwrite', (os) => os.put({ k, buf: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength), bytes: pcm.byteLength, t: Date.now() }));
  if (++puts % 15 === 0) trim(500 * 1048576);
}
async function storeInfo() {
  const d = await db(); if (!d) return { bytes: 0, clips: 0 };
  return new Promise((res) => { let bytes = 0, n = 0; try { const rq = d.transaction('clips', 'readonly').objectStore('clips').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { bytes += c.value.bytes || 0; n++; c.continue(); } else res({ bytes, clips: n }); }; rq.onerror = () => res({ bytes, clips: n }); } catch (e) { res({ bytes: 0, clips: 0 }); } });
}
async function trim(cap) {
  const d = await db(); if (!d) return;
  const all = await new Promise((res) => { const a = []; try { const rq = d.transaction('clips', 'readonly').objectStore('clips').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { a.push({ k: c.value.k, bytes: c.value.bytes || 0, t: c.value.t || 0 }); c.continue(); } else res(a); }; rq.onerror = () => res(a); } catch (e) { res(a); } });
  let tot = all.reduce((s, x) => s + x.bytes, 0); if (tot <= cap) return;
  all.sort((a, b) => a.t - b.t);
  for (const x of all) { if (tot <= cap * 0.8) break; await idb('clips', 'readwrite', (os) => os.delete(x.k)); tot -= x.bytes; }
}
async function clearAudio() { await idb('clips', 'readwrite', (os) => os.clear()); await idb('scripts', 'readwrite', (os) => os.clear()); Object.keys(PF).forEach((k) => delete PF[k]); }

/* ---------------- The three voices ---------------- */
const GBASE = 'https://generativelanguage.googleapis.com/v1beta';
const gemKey = () => { try { const c = A().cloudCfg('gemini'); return (c && c.key) || ''; } catch (e) { return ''; } };
const MB = Object.create(null);   /* a voice model that is resting after a limit: name -> time it is back */
const FALLBACK_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];
async function gemModels(key) {
  const v = V(); if (v.gm && v.gm.length && Date.now() - (v.gmAt || 0) < 864e5) return v.gm;
  try {
    const r = await fetch(GBASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } }); const j = await r.json();
    const names = (j.models || []).filter((m) => /tts/i.test(m.name) && (!m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))).map((m) => m.name.replace(/^models\//, ''));
    const ver = (n) => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    names.sort((a, b) => (ver(b) - ver(a)) || ((/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0)) || ((/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0)));
    if (names.length) { v.gm = names; v.gmAt = Date.now(); A().save(); return names; }
  } catch (e) { /* fall back to the known names */ }
  return v.gm && v.gm.length ? v.gm : FALLBACK_MODELS;
}
function retrySecs(msg, body) {
  const m = String(msg).match(/retry in ([\d.]+)\s*s/i); if (m) return parseFloat(m[1]);
  try { const d = ((body.error || {}).details || []).find((x) => /RetryInfo/.test(x['@type'] || '')); if (d && d.retryDelay) return parseFloat(d.retryDelay); } catch (e) { /* ignore */ }
  return 0;
}
async function gemSpeak(text, voice, style, signal) {
  const key = gemKey(); if (!key) throw mk('nokey', 'No Gemini key is connected.');
  if (navigator.onLine === false) throw mk('net', 'No internet.');
  let models = (await gemModels(key)).filter((m) => !(MB[m] > Date.now()));
  if (!models.length) throw mk('quota', 'The cloud voice is resting after its free limit.', { until: Math.min.apply(null, Object.keys(MB).map((k) => MB[k])) });
  let last = null;
  for (let mi = 0; mi < models.length; mi++) {
    const m = models[mi];
    for (let attempt = 0; attempt < 3; attempt++) {
      let r;
      try {
        r = await fetch(GBASE + '/models/' + m + ':generateContent', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: (style ? 'Say this ' + style + ': ' : '') + text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) });
      } catch (e) { if (signal && signal.aborted) throw e; throw mk('net', 'The connection dropped.'); }
      if (r.ok) {
        const j = await r.json().catch(() => ({})), part = (((j.candidates || [])[0] || {}).content || {}).parts; const p = (part || []).find((x) => x.inlineData && x.inlineData.data);
        if (!p) { last = mk('empty', 'The voice returned no sound.'); break; }
        const rm = String(p.inlineData.mimeType || '').match(/rate=(\d+)/);
        return { pcm: b64ToInt16(p.inlineData.data), rate: rm ? parseInt(rm[1], 10) : 24000, model: m };
      }
      const body = await r.json().catch(() => ({})), msg = (body.error && body.error.message) || '';
      if (r.status === 429 || /quota|exhaust/i.test(msg)) {
        const wait = retrySecs(msg, body), daily = /per\s?day|daily/i.test(msg + JSON.stringify(body.error || {}));
        if (!daily && wait && wait <= 25 && attempt < 2) { await sleep(wait * 1000 + 300); if (signal && signal.aborted) throw mk('abort'); continue; }
        MB[m] = Date.now() + (daily ? 6 * 36e5 : Math.max(60e3, (wait || 60) * 1000)); last = mk('quota', 'The cloud voice has reached its free limit.', { until: MB[m] }); break;
      }
      if (r.status === 404 || (r.status === 400 && /model|not found|not supported|unsupported/i.test(msg) && !/API key/i.test(msg))) { MB[m] = Date.now() + 36e5; last = mk('model', 'That voice model is not available.'); break; }
      if (r.status === 401 || r.status === 403 || /API key/i.test(msg)) throw mk('key', 'Google refused the Gemini key for voices. Check the key in Me.');
      if (r.status >= 500) { last = mk('server', 'The voice service is busy.'); await sleep(800); continue; }
      throw mk('other', msg || ('The voice service answered with HTTP ' + r.status + '.'));
    }
  }
  if (last && last.kind === 'quota') { V().cbUntil = Math.min.apply(null, Object.keys(MB).map((k) => MB[k]).filter((t) => t > Date.now()).concat([Date.now() + 6e4])); A().save(); }
  throw last || mk('other', 'No cloud voice answered.');
}

/* the voice that lives on the phone (Android app only) */
const OFF_MODEL = { id: 'kitten-nano-en-v0_8-fp32', name: 'Kitten nano', mb: 61, voices: 8,
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kitten-nano-en-v0_8-fp32.tar.bz2', bytes: 63815222,
  files: { model: 'model.fp32.onnx', voices: 'voices.bin', tokens: 'tokens.txt', data: 'espeak-ng-data' }, require: ['model.fp32.onnx', 'voices.bin', 'tokens.txt', 'espeak-ng-data/phontab'] };
const OFF = { engine: !!VP(), ready: false, loaded: false, loading: false, st: { state: 'idle', pct: 0 }, bound: false, bytes: 0, last: null, tune: null };
const offSubs = [];
const offChange = () => offSubs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
async function offRefresh() {
  const p = VP(); if (!p) { OFF.engine = false; return; }
  try {
    const r = await p.status(); OFF.engine = r.engine !== false; const m = (r.installed || []).find((x) => x.id === OFF_MODEL.id);
    OFF.ready = !!m; OFF.bytes = m ? m.bytes : 0; OFF.loaded = r.loaded === OFF_MODEL.id;
  } catch (e) { OFF.engine = false; }
  offChange();
}
function offBind() {
  const p = VP(); if (!p || OFF.bound) return; OFF.bound = true;
  p.addListener('voice', (e) => {
    const was = OFF.st.state; OFF.st = e || OFF.st;
    if (OFF.st.state !== was) {
      const dev = window.KVDevice; if (dev && dev.keepAwake) { try { dev.keepAwake(['running', 'waiting', 'unpacking'].includes(OFF.st.state)); } catch (x) { /* ignore */ } }
      if (OFF.st.state === 'done') offRefresh().then(() => { if (A()) A().toast('The offline voice is ready'); });
    }
    offChange();
  });
}
async function offEnsure() {
  const p = VP(); if (!p || !OFF.ready) throw mk('nooff', 'The offline voice is not installed.');
  if (OFF.loaded && !OFF.reload) return;
  OFF.loading = true; offChange();
  try { const th = V().threads || 2; const r = await p.load(Object.assign({ id: OFF_MODEL.id, kind: 'kitten', threads: th, force: !!OFF.reload }, OFF_MODEL.files)); OFF.loaded = true; OFF.reload = false; OFF.rate = r.rate; OFF.speakers = r.speakers; OFF.loadMs = r.loadMs; }
  catch (e) { throw mk('off', (e && e.message) || 'The offline voice could not start.'); }
  finally { OFF.loading = false; offChange(); }
}
let offChain = Promise.resolve();
function offSpeak(text, sid, speed) {
  const job = offChain.then(async () => {
    await offEnsure();
    const r = await VP().speak({ text, sid, speed: speed || 1 });
    OFF.last = { genMs: r.genMs, audioMs: r.audioMs, chars: text.length };
    return { pcm: b64ToInt16(r.pcm), rate: r.rate, genMs: r.genMs, audioMs: r.audioMs };
  });
  offChain = job.catch(() => {}); return job;
}
const offInstall = () => { const p = VP(); if (!p) return Promise.reject(mk('nooff', 'This needs the Android app.')); offBind(); return p.install({ id: OFF_MODEL.id, url: OFF_MODEL.url, bytes: OFF_MODEL.bytes, require: OFF_MODEL.require }).then((r) => { OFF.st = r; offChange(); return r; }); };
const offPause = () => { const p = VP(); return p ? p.pauseInstall().then((r) => { OFF.st = r; offChange(); }) : Promise.resolve(); };
const offCancel = () => { const p = VP(); return p ? p.cancelInstall({ id: OFF_MODEL.id }).then((r) => { OFF.st = r; offChange(); }) : Promise.resolve(); };
const offRemove = () => { const p = VP(); return p ? p.remove({ id: OFF_MODEL.id }).then(() => { OFF.ready = false; OFF.loaded = false; OFF.st = { state: 'idle', pct: 0 }; return offRefresh(); }) : Promise.resolve(); };

/* ---------------- Which voice speaks ---------------- */
const phoneOk = () => 'speechSynthesis' in window;
const AVAIL = {
  cloud: () => !!gemKey() && navigator.onLine !== false && Date.now() >= (V().cbUntil || 0),
  offline: () => OFF.engine && OFF.ready,
  phone: phoneOk
};
const NAMES = { cloud: 'the cloud voice', offline: 'the offline voice', phone: 'your phone\'s voice' };
function order(prefer) {
  const all = ['cloud', 'offline', 'phone'], e = prefer || V().engine;
  return e === 'auto' ? all : [e].concat(all.filter((x) => x !== e));
}
const usable = (prefer) => order(prefer).filter((x) => AVAIL[x]());
const canSpeak = () => usable().length > 0;
function voiceTag(engine) { return engine === 'cloud' ? 'g:' + gemVoice() + ':' + styleOf() : engine === 'offline' ? 'o:' + offSid() : 'p'; }

/* One piece of speech as audio at 16 kHz (or null for the phone's own voice, which speaks directly). Saved pieces are reused. */
const PF = Object.create(null);
async function makeClip(engine, text, signal) {
  if (engine === 'phone') return null;
  const key = hash(engine + '|' + voiceTag(engine) + '|' + text), mem = PF[key]; if (mem) return mem;
  const job = (async () => {
    const saved = await clipGet(key);
    if (saved && saved.buf) { return { pcm: new Int16Array(saved.buf), cached: true, key }; }
    let r;
    if (engine === 'cloud') r = await gemSpeak(text, gemVoice(), styleOf(), signal);
    else r = await offSpeak(text, offSid(), 1);
    const pcm = resample(r.pcm, r.rate, RATE);
    await clipPut(key, pcm);
    return { pcm, cached: false, key, genMs: r.genMs };
  })();
  PF[key] = job; job.then(() => { setTimeout(() => { delete PF[key]; }, 60000); }, () => { delete PF[key]; });
  return job;
}

/* ---------------- The player ---------------- */
const PL = { id: 0, items: [], i: 0, st: 'idle', engine: '', kind: '', key: '', title: '', lessonId: '', rate: 1, err: '', note: '', paused: false, utter: null, startedAt: 0 };
const plSubs = [];
const plEmit = () => plSubs.forEach((f) => { try { f(PL); } catch (e) { /* ignore */ } });
let AU = null, abortCtl = null, lastUrl = '';
function audioEl() { if (!AU) { AU = new Audio(); AU.preload = 'auto'; } return AU; }
function setSession() {
  try {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new window.MediaMetadata({ title: PL.title || 'Knowvia', artist: 'Amani · Knowvia', album: PL.kind === 'lesson' ? 'Audio lesson' : 'Read aloud' });
    ms.setActionHandler('play', () => resume()); ms.setActionHandler('pause', () => pause());
    ms.setActionHandler('nexttrack', () => skip(1)); ms.setActionHandler('previoustrack', () => skip(-1));
  } catch (e) { /* not supported here */ }
}
function stop() {
  PL.id++; if (abortCtl) { try { abortCtl.abort(); } catch (e) { /* ignore */ } abortCtl = null; }
  try { if (phoneOk()) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  if (AU) { try { AU.pause(); AU.removeAttribute('src'); AU.load(); } catch (e) { /* ignore */ } }
  if (lastUrl) { try { URL.revokeObjectURL(lastUrl); } catch (e) { /* ignore */ } lastUrl = ''; }
  PL.st = 'idle'; PL.items = []; PL.i = 0; PL.paused = false; PL.err = ''; PL.note = ''; PL.kind = ''; PL.lessonId = ''; plEmit();
}
function playClip(clip, id) {
  return new Promise((res) => {
    const a = audioEl(), blob = toWav(clip.pcm, RATE);
    if (lastUrl) { try { URL.revokeObjectURL(lastUrl); } catch (e) { /* ignore */ } }
    lastUrl = URL.createObjectURL(blob); a.src = lastUrl; a.defaultPlaybackRate = PL.rate; a.playbackRate = PL.rate;
    const done = (ok) => { a.onended = a.onerror = a.onpause = null; res(ok); };
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.onpause = () => { if (PL.id !== id) return done(false); };
    const p = a.play(); if (p && p.catch) p.catch(() => done(false));
    PL.st = 'playing'; setSession(); plEmit();
  });
}
function speakPhone(text, id) {
  return new Promise((res) => {
    if (!phoneOk()) return res(false);
    const u = new SpeechSynthesisUtterance(text), v = pickPhoneVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en';
    const hk = REG.hooks.voice ? REG.hooks.voice() : {}; u.rate = Math.min(2, PL.rate * (hk.rate || 1)); u.pitch = hk.pitch || 1;
    u.onend = () => res(true); u.onerror = () => res(false);
    PL.utter = u; PL.st = 'playing'; plEmit(); try { window.speechSynthesis.speak(u); } catch (e) { res(false); }
  });
}
function phoneVoices() { try { return (window.speechSynthesis.getVoices() || []).filter((v) => /^en/i.test(v.lang)); } catch (e) { return []; } }
function pickPhoneVoice() {
  const list = phoneVoices(), want = V().phone; if (!list.length) return null;
  const by = want && list.find((v) => v.voiceURI === want || v.name === want); if (by) return by;
  const score = (v) => (/en[-_]NG/i.test(v.lang) ? 6 : 0) + (/network|neural|enhanced|premium|natural/i.test(v.name + v.voiceURI) ? 3 : 0) + (/en[-_]GB/i.test(v.lang) ? 2 : 0) + (/en[-_]US/i.test(v.lang) ? 1 : 0) + (v.localService ? 0 : 1);
  return list.slice().sort((a, b) => score(b) - score(a))[0];
}
function friendly(e) {
  const k = e && e.kind;
  if (k === 'quota') return 'The cloud voice has reached its free limit for now.';
  if (k === 'key') return e.message;
  if (k === 'net') return 'There is no internet for the cloud voice.';
  if (k === 'nooff') return 'The offline voice is not installed.';
  return (e && e.message) || 'The voice stopped.';
}
/* get the next piece, moving to the next best voice when one cannot answer */
async function clipFor(text, id) {
  let tried = 0;
  for (;;) {
    const eng = PL.engine; if (!eng) throw mk('none', 'No voice is available.');
    try {
      if (!abortCtl) abortCtl = new AbortController();
      const c = await makeClip(eng, text, abortCtl.signal);
      if (PL.id !== id) throw mk('abort');
      return { eng, clip: c };
    } catch (e) {
      if (PL.id !== id || (e && (e.kind === 'abort' || e.name === 'AbortError'))) throw mk('abort');
      const left = usable(V().engine).filter((x) => x !== eng && !(PL.failed || []).includes(x)); (PL.failed = PL.failed || []).push(eng);
      if (!left.length || ++tried > 3) { PL.err = friendly(e); throw e; }
      PL.engine = left[0]; PL.note = friendly(e) + ' Now using ' + NAMES[PL.engine] + '.'; plEmit();
      try { A().toast(PL.note); } catch (x) { /* ignore */ }
    }
  }
}
async function run(id) {
  while (PL.id === id && PL.i < PL.items.length) {
    const text = PL.items[PL.i].text; PL.st = 'loading'; plEmit();
    if (PL.paused) { await new Promise((r) => { PL.wake = r; }); if (PL.id !== id) return; }
    let got;
    try { got = await clipFor(text, id); } catch (e) { if (PL.id !== id) return; PL.st = 'error'; plEmit(); return; }
    if (PL.id !== id) return;
    for (let k = i2(PL.i + 1); k <= PL.i + 2 && k < PL.items.length; k++) { if (got.eng !== 'phone') makeClip(got.eng, PL.items[k].text, abortCtl && abortCtl.signal).catch(() => {}); }
    let ok;
    for (;;) {
      ok = got.clip ? await playClip(got.clip, id) : await speakPhone(text, id);
      if (PL.id !== id) return;
      if (PL.paused) { await new Promise((r) => { PL.wake = r; }); if (PL.id !== id) return; continue; }
      break;
    }
    if (!ok) { PL.err = 'The sound could not be played.'; PL.st = 'error'; plEmit(); return; }
    PL.i++; if (PL.lessonId) { V().pos[PL.lessonId] = PL.i >= PL.items.length ? 0 : PL.i; A().save(); }
    plEmit();
  }
  if (PL.id === id) { const cb = PL.onEnd, was = PL.kind; PL.st = 'idle'; PL.items = []; plEmit(); if (cb) { try { cb(was); } catch (e) { /* ignore */ } } }
}
const i2 = (n) => n;
function start(items, o) {
  o = o || {}; stop();
  const id = ++PL.id; PL.items = items; PL.i = Math.max(0, Math.min(items.length - 1, o.from || 0)); PL.kind = o.kind || 'chat'; PL.key = o.key || ''; PL.title = o.title || ''; PL.lessonId = o.lessonId || ''; PL.rate = V().rate || 1;
  PL.onEnd = o.onEnd; PL.err = ''; PL.note = ''; PL.failed = []; PL.paused = false; PL.engine = usable(V().engine)[0] || '';
  abortCtl = new AbortController();
  if (!PL.engine) { PL.err = 'No voice is ready. Open Voice settings to set one up.'; PL.st = 'error'; plEmit(); return false; }
  PL.st = 'loading'; plEmit(); run(id); return true;
}
function pause() {
  if (PL.st !== 'playing' && PL.st !== 'loading') return; PL.paused = true;
  if (AU && !AU.paused) { PL.keepId = PL.id; try { AU.pause(); } catch (e) { /* ignore */ } }
  try { if (phoneOk()) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  PL.st = 'paused'; plEmit();
}
function resume() {
  if (PL.st !== 'paused') return; PL.paused = false; PL.st = 'loading'; plEmit();
  const w = PL.wake; PL.wake = null; if (w) w();
  if (AU && AU.src && AU.paused && AU.currentTime > 0 && AU.currentTime < AU.duration) { PL.st = 'playing'; AU.play().catch(() => {}); plEmit(); }
}
function skip(d) {
  if (!PL.items.length) return; const to = Math.max(0, Math.min(PL.items.length - 1, PL.i + d)), o = { kind: PL.kind, key: PL.key, title: PL.title, lessonId: PL.lessonId, onEnd: PL.onEnd }, items = PL.items;
  start(items, Object.assign(o, { from: to }));
}
function setRate(r) { const v = V(); v.rate = r; A().save(); PL.rate = r; if (AU) AU.playbackRate = r; plEmit(); }

/* chat answers and selected text */
function speakText(text, o) {
  o = o || {}; const clean = speakable(text); if (!clean) return false;
  const eng = usable(V().engine)[0], first = eng === 'phone' ? 400 : eng === 'cloud' ? 160 : 140, max = eng === 'cloud' ? 650 : eng === 'offline' ? 240 : 400;
  return start(split(clean, max, first).map((t) => ({ text: t })), { kind: 'chat', key: o.key || '', title: o.title || 'Amani', onEnd: o.done });
}

/* ---------------- Lessons as audio ---------------- */
const OUTLINE = (l) => {
  const a = A(), ls = a.lessons(), n = ls.findIndex((x) => x.id === l.id) + 1;
  const outs = (l.outcomes || []).length ? 'By the end of this lesson you can: ' + l.outcomes.map((o) => String(o).replace(/[*_`]/g, '')).join('. ') + '.\n\n' : '';
  return 'Lesson ' + n + '. ' + l.title + '.\n' + (l.subtitle ? l.subtitle + '.\n\n' : '\n') + outs + speakable(l.body);
};
const scriptKey = (l) => 'ls:' + l.id + ':' + hash(String(l.body || '') + String(l.title || ''));
async function lessonScript(l, opt) {
  opt = opt || {};
  const base = OUTLINE(l), key = scriptKey(l) + (V().rewrite ? ':r' : ':p'), saved = await scriptGet(key); if (saved && saved.text) return { text: saved.text, rewritten: V().rewrite };
  if (opt.cacheOnly) return V().rewrite ? null : { text: base, rewritten: false };
  if (!V().rewrite || opt.plain) return { text: base, rewritten: false };
  const a = A(); let bc = null; try { bc = a.bestCloud && a.bestCloud(); } catch (e) { bc = null; }
  if (!bc) return { text: base, rewritten: false };
  try {
    const out = String(await a.llm([{ role: 'system', content: 'You turn lesson text into a script that will be read aloud by a friendly teacher to someone who cannot see the screen. Keep every fact, number, definition and example. Do not add facts. Use short, natural spoken sentences. No markdown, no bullet points, no headings, no tables: say what a table or list contains in a sentence. Say formulas in words. Start with the lesson number and title. Output only the script.' },
      { role: 'user', content: base.slice(0, 9000) }], { model: bc, max: 3500, temp: 0.4, signal: opt.signal }));
    const t = speakable(out);
    if (t.length > base.length * 0.45 && t.length > 400) { await scriptPut(key, t); return { text: t, rewritten: true }; }
  } catch (e) { if (opt.signal && opt.signal.aborted) throw e; }
  return { text: base, rewritten: false };
}
function itemsOf(text) { const eng = usable(V().engine)[0]; return split(text, eng === 'cloud' ? 650 : eng === 'offline' ? 240 : 380, eng === 'cloud' ? 220 : 160).map((t) => ({ text: t })); }
const LS = { id: '', busy: false, err: '' };   /* a lesson whose script is being written */
async function playLesson(id, o) {
  o = o || {}; const a = A(), l = a.lessonById(id); if (!l) return false;
  if (PL.lessonId === id && PL.items.length && PL.st !== 'error') { if (PL.st === 'paused') resume(); else if (PL.st === 'playing') pause(); return true; }
  if (!canSpeak()) { a.toast('Set up a voice first'); a.go('voice'); return false; }
  LS.id = id; LS.busy = true; LS.err = ''; stop(); PL.title = l.title; PL.lessonId = id; PL.kind = 'lesson'; PL.st = 'loading'; PL.note = V().rewrite ? 'Getting the lesson ready to be heard' : ''; plEmit();
  let sc; try { sc = await lessonScript(l); } catch (e) { LS.busy = false; stop(); return false; }
  LS.busy = false; if (LS.id !== id) return false;
  const items = itemsOf(sc.text), from = o.from != null ? o.from : (V().pos[id] || 0);
  const next = () => { const ls = a.lessons(), i = ls.findIndex((x) => x.id === id); return V().autoNext && i >= 0 && ls[i + 1] ? ls[i + 1].id : ''; };
  return start(items, { kind: 'lesson', key: 'lesson:' + id, title: l.title, lessonId: id, from: from >= items.length - 1 ? 0 : from, onEnd: () => { const n = next(); if (n) playLesson(n, { from: 0 }); } });
}

/* Save a lesson's audio ahead of time, so it plays offline and never waits */
const PREP = { id: '', i: 0, n: 0, st: 'idle', err: '', engine: '', ctl: null };
const prSubs = []; const prEmit = () => prSubs.forEach((f) => { try { f(PREP); } catch (e) { /* ignore */ } });
async function prepare(id) {
  if (PREP.st === 'running') return; const a = A(), l = a.lessonById(id); if (!l) return;
  const eng = usable(V().engine).find((x) => x !== 'phone'); if (!eng) { PREP.st = 'error'; PREP.id = id; PREP.err = 'Saving audio needs the cloud voice or the offline voice. The phone\'s own voice cannot be saved.'; prEmit(); return; }
  PREP.id = id; PREP.st = 'running'; PREP.err = ''; PREP.engine = eng; PREP.i = 0; PREP.n = 0; PREP.ctl = new AbortController(); prEmit();
  try {
    const sc = await lessonScript(l, { signal: PREP.ctl.signal }); const items = split(sc.text, eng === 'cloud' ? 650 : 240, eng === 'cloud' ? 220 : 160); PREP.n = items.length; prEmit();
    for (let i = 0; i < items.length; i++) { if (PREP.st !== 'running') return; await makeClip(eng, items[i], PREP.ctl.signal); PREP.i = i + 1; prEmit(); }
    PREP.st = 'done'; prEmit();
  } catch (e) {
    if (PREP.st !== 'running') return;
    PREP.st = 'error'; PREP.err = friendly(e) + (e && e.kind === 'quota' ? ' What is saved so far is kept. Try again later, or switch to the offline voice.' : ' What is saved so far is kept.'); prEmit();
  }
}
function cancelPrepare() { if (PREP.ctl) { try { PREP.ctl.abort(); } catch (e) { /* ignore */ } } PREP.st = 'idle'; prEmit(); }
/* was every piece of this lesson already saved? (cheap check by script cache + clips) */
async function savedState(id) {
  const l = A().lessonById(id); if (!l) return { saved: false };
  const eng = usable(V().engine).find((x) => x !== 'phone'); if (!eng) return { saved: false };
  const sc = await lessonScript(l, { cacheOnly: true }); if (!sc) return { saved: false }; const items = split(sc.text, eng === 'cloud' ? 650 : 240, eng === 'cloud' ? 220 : 160);
  let have = 0; for (const t of items) { const k = hash(eng + '|' + voiceTag(eng) + '|' + t); if (await clipGet(k)) have++; }
  return { saved: have === items.length && items.length > 0, have, n: items.length };
}

/* ---------------- Samples and speed tests for the Voice lab ---------------- */
const SAMPLE = 'Hello, I am Amani. Let us take this one step at a time. A fraction is a way of showing a part of a whole.';
async function sample(engine) {
  const t0 = performance.now(); stop();
  if (engine === 'phone') { const ok = start([{ text: SAMPLE }], { kind: 'sample', title: 'Voice sample' }); return { ok, ms: Math.round(performance.now() - t0) }; }
  PL.engine = engine;
  const ctl = new AbortController(); abortCtl = ctl;
  try {
    const key = hash(engine + '|' + voiceTag(engine) + '|' + SAMPLE); delete PF[key]; await idb('clips', 'readwrite', (os) => os.delete(key));
    const c = await makeClip(engine, SAMPLE, ctl.signal), ms = Math.round(performance.now() - t0), audioMs = Math.round(c.pcm.length * 1000 / RATE);
    const id = ++PL.id; PL.engine = engine; PL.kind = 'sample'; PL.title = 'Voice sample'; PL.items = [{ text: SAMPLE }]; PL.i = 0; PL.rate = V().rate || 1; PL.st = 'playing'; plEmit();
    playClip(c, id).then(() => { if (PL.id === id) { PL.st = 'idle'; PL.items = []; plEmit(); } });
    return { ok: true, ms, audioMs, rtf: audioMs ? Math.round((ms / audioMs) * 100) / 100 : 0, genMs: c.genMs };
  } catch (e) { return { ok: false, err: friendly(e) }; }
}
/* try a few thread counts for the offline voice and keep the fastest */
async function tuneOffline(onProgress) {
  const p = VP(); if (!p || !OFF.ready) throw mk('nooff', 'Install the offline voice first.');
  const cores = (window.KVDevice && window.KVDevice.state.specs && window.KVDevice.state.specs.cores) || navigator.hardwareConcurrency || 4, cands = Array.from(new Set([1, 2, 3, 4].filter((n) => n <= Math.max(2, cores)))), res = [];
  stop();
  for (let i = 0; i < cands.length; i++) {
    const t = cands[i]; if (onProgress) onProgress({ msg: 'Trying ' + t + (t === 1 ? ' thread' : ' threads') + ' (' + (i + 1) + ' of ' + cands.length + ')', pct: 8 + Math.round(i / cands.length * 85) });
    await p.load(Object.assign({ id: OFF_MODEL.id, kind: 'kitten', threads: t, force: true }, OFF_MODEL.files)); OFF.loaded = true;
    await p.speak({ text: 'Warming up.', sid: 0, speed: 1 });
    const r = await p.speak({ text: SAMPLE, sid: 0, speed: 1 }); if (r.audioMs > 0) res.push({ threads: t, rtf: r.genMs / r.audioMs, genMs: r.genMs, audioMs: r.audioMs });
  }
  res.sort((a, b) => a.rtf - b.rtf); const best = res[0] || null, v = V();
  if (best) { v.threads = best.threads; A().save(); }
  await p.load(Object.assign({ id: OFF_MODEL.id, kind: 'kitten', threads: v.threads || 2, force: true }, OFF_MODEL.files)); OFF.loaded = true; OFF.tune = best;
  offChange(); return { best, all: res };
}

REG.hooks.canSpeak = canSpeak;
REG.hooks.speakText = (text, o) => speakText(text, o);
REG.hooks.stopSpeech = (kind) => { if (!kind || PL.kind === kind) stop(); };
window.KVVoice = { util: { speakable, split, resample, toWav, hash, latex }, V, PL, PREP, OFF, OFF_MODEL, LS, GEM_VOICES, GEM_DEFAULT, OFF_DEFAULT, STYLE, SAMPLE, roleId, gemVoice, offSid, styleOf, AVAIL, usable, order, canSpeak, NAMES,
  start, stop, pause, resume, skip, setRate, speakText, playLesson, prepare, cancelPrepare, savedState, lessonScript, sample, tuneOffline, storeInfo, clearAudio, offRefresh, offBind, offInstall, offPause, offCancel, offRemove,
  phoneVoices, pickPhoneVoice, friendly, gemSpeak, makeClip, subscribe: (f) => { plSubs.push(f); }, subscribePrep: (f) => { prSubs.push(f); }, subscribeOff: (f) => { offSubs.push(f); }, native, VP, setCloudBlock(t) { V().cbUntil = t; A().save(); } };
REG.ready.push(() => { offBind(); offRefresh(); try { if (phoneOk()) window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ } });
})();
