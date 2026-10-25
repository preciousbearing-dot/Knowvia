/* Knowvia. Plain JavaScript, no build step, works offline. */
(function () {
'use strict';

let APP_VERSION = String(window.KV_VERSION || '0.0.0');
const REG = window.KVReg = window.KVReg || {}; ['screens','acts','ins','hooks','names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const PACKS = window.PACKS || [];
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------- Storage ---------------- */
const KEY = 'ola.v0';
const defaults = () => ({
  theme: 'frost', frostMode: 'auto', night: false, size: 1, reduce: 'auto',
  name: '', onboarded: false, ob: { step: 0 },
  activePack: PACKS[0] ? PACKS[0].id : null,
  progress: {}, // packId -> { last, lessons:{id:{done,scroll}}, answers:{qid:choice}, cards:{fid:{box,due}} }
  tutor: { brain: 'local', url: 'http://localhost:11434', model: '', provider: 'gemini', clouds: {} },
  chats: {}, persona: null, sess: null, hints: {}
});
let S = defaults();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const d = JSON.parse(raw), base = defaults();
    S = Object.assign(base, d, { tutor: Object.assign(base.tutor, d.tutor || {}) });
    const old = (d.tutor || {}).cloud; /* v0.2 kept one cloud setup; move it into the new per-provider list */
    if (old && old.key) { const id = old.preset || 'custom'; S.tutor.clouds[id] = { key: old.key, model: old.model || '', base: old.base || '', models: [], ok: false }; S.tutor.provider = id; }
    delete S.tutor.cloud;
    if (!S.tutor.clouds) S.tutor.clouds = {};
    if (!S.hints) S.hints = {};
    S.chats = stripChats(S.chats);
  }
} catch (e) { /* storage unavailable: run in memory */ }
let saveT = 0;
/* Error bubbles are never kept: they only describe a moment, and they used to pile up in the chat for good. */
function stripChats(c) { const o = {}; Object.keys(c || {}).forEach((k) => { o[k] = (c[k] || []).filter((m) => !m.err && !m.failed && !(m.role === 'tutor' && !m.text)); }); return o; }
function persistable() { return JSON.stringify(S, (k, v) => (k === 'chats' ? stripChats(v) : v)); }
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, persistable()); } catch (e) {} }, 150); }
function saveNow() { clearTimeout(saveT); try { localStorage.setItem(KEY, persistable()); } catch (e) {} }

function pack() { return PACKS.find((p) => p.id === S.activePack) || PACKS[0]; }
function prog(p) {
  p = p || pack();
  if (!p) return null;
  if (!S.progress[p.id]) S.progress[p.id] = { last: null, lessons: {}, answers: {}, cards: {} };
  return S.progress[p.id];
}
function lessons(p) { p = p || pack(); return p ? p.modules.reduce((a, m) => a.concat(m.lessons), []) : []; }
function lessonById(id, p) { return lessons(p).find((l) => l.id === id); }
function qById(id, p) { return ((p || pack()).quiz || []).find((q) => q.id === id); }

/* ---------------- Icons ---------------- */
const ic = (d, s, w) => `<svg width="${s || 24}" height="${s || 24}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.7}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  book: '<path d="M3 5.5C5 4.5 8 4.5 12 6.5C16 4.5 19 4.5 21 5.5V18.5C19 17.5 16 17.5 12 19.5C8 17.5 5 17.5 3 18.5Z"/><path d="M12 6.5V19.5"/>',
  lib: '<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><path d="M16.5 5.5L20 19"/>',
  prac: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5L11 15L15.5 9.5"/>',
  prog: '<path d="M5 19V12M12 19V6M19 19V10"/>',
  me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5C5.8 15.8 8.5 14 12 14C15.5 14 18.2 15.8 19 19.5"/>',
  chat: '<path d="M4 6.5C4 5.4 4.9 4.5 6 4.5H18C19.1 4.5 20 5.4 20 6.5V14.5C20 15.6 19.1 16.5 18 16.5H10L6 20V16.5C4.9 16.5 4 15.6 4 14.5Z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2V16h5v-.2c0-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', back: '<path d="M15 6l-6 6 6 6"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  home: '<path d="M4 11.5L12 4.5L20 11.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  upload: '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5"/><path d="M5 15v3.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V15"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M18.5 16.5v3M17 18h3"/>',
  shield: '<path d="M12 3.5l7 2.5v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6Z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  cloud: '<path d="M7 18.5h9.5a3.8 3.8 0 0 0 .6-7.5A5.5 5.5 0 0 0 6.6 9.7 4.4 4.4 0 0 0 7 18.5Z"/>',
  laptop: '<rect x="5" y="5.5" width="14" height="9.5" rx="1.5"/><path d="M3 18.5h18"/>',
  down: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>',
  cards: '<rect x="4" y="6" width="13" height="10" rx="2"/><path d="M8 19h11a1 1 0 0 0 1-1V9.5"/>',
  chart: '<path d="M5 19V12M12 19V6M19 19V10"/>',
  pdf: '<path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  speaker: '<path d="M5 9.5h3.2L13 5.5v13l-4.8-4H5Z"/><path d="M16.2 9a4.2 4.2 0 0 1 0 6M18.6 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>',
  refresh: '<path d="M19 8a7.5 7.5 0 0 0-13.3-1.5M5 4v3h3M5 16a7.5 7.5 0 0 0 13.3 1.5M19 20v-3h-3"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
  quote: '<path d="M7 7h4v5a4 4 0 0 1-4 4M15 7h4v5a4 4 0 0 1-4 4"/>',
  wifi: '<path d="M4 9.5C9 5 15 5 20 9.5M7 13c3-2.6 7-2.6 10 0M10 16.5c1.2-1 2.8-1 4 0"/><circle cx="12" cy="19" r=".6"/>'
};


/* ---------------- Cloud providers ---------------- */
const PROV = {
  gemini: { name: 'Google Gemini', why: 'Also gives Amani a natural voice and reads photos of pages.', host: 'generativelanguage.googleapis.com', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash',
    pref: [/^gemini-2\.5-flash$/, /^gemini-2\.5-flash-lite$/, /^gemini-3.*flash/, /^gemini-2\.5-pro$/],
    tag: 'Best all-round free pick', blurb: 'Fast, strong at explaining, good with long lessons. Free tier with daily limits.',
    keyUrl: 'https://aistudio.google.com/apikey',
    steps: ['Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio, API keys</a>. It opens in your browser.', 'Sign in with any Google account. Accept the terms if it asks.', 'Tap <b>Create API key</b>. If it asks for a project, choose <b>Create API key in new project</b>.', 'A long key appears (it starts with <b>AIza</b>). Tap the copy icon next to it.', 'Come back to Knowvia, tap <b>Paste</b> below, then <b>Connect</b>. Knowvia tests the key for you.'],
    fine: 'On Google\'s free tier, your prompts can be used to improve their products. Do not paste private information. Free limits change, so check the AI Studio page.' },
  openrouter: { name: 'OpenRouter free models', why: 'Your backup. Many free models behind one key.', host: 'openrouter.ai', base: 'https://openrouter.ai/api/v1', model: '',
    pref: [/llama.*70b/i, /gemma/i, /qwen/i, /deepseek/i, /mistral/i],
    tag: 'Many free models, one key', blurb: 'One account unlocks many free models (their names end in :free). Good as a backup when another provider is busy.',
    keyUrl: 'https://openrouter.ai/keys',
    steps: ['Create a free account at <a href="https://openrouter.ai/" target="_blank" rel="noopener">openrouter.ai</a>.', 'Open <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">the Keys page</a> and tap <b>Create Key</b>. Give it any name.', 'Copy the key (it starts with <b>sk-or-</b>).', 'Come back to Knowvia, tap <b>Paste</b> below, then <b>Connect</b>.', 'Pick a model that ends in <b>:free</b> from the list that appears.'],
    fine: 'At the time of writing, free models are limited to about 50 requests a day, and about 1,000 a day after you buy $10 of credit once. Some free models change or disappear, so keep a second one handy.' },
  groq: { name: 'Groq', host: 'api.groq.com', base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', why: 'Very fast chat. Its 120B model is a favourite for Amani.',
    pref: [/^openai\/gpt-oss-120b/, /^llama-3\.3-70b/, /^openai\/gpt-oss-20b/, /^llama-3\.1-8b/, /^qwen/],
    tag: 'Very fast answers', blurb: 'Answers appear almost instantly. Free tier with rate limits, so long study sessions can hit a pause.',
    keyUrl: 'https://console.groq.com/keys',
    steps: ['Sign up at <a href="https://console.groq.com/" target="_blank" rel="noopener">console.groq.com</a>.', 'Open <a href="https://console.groq.com/keys" target="_blank" rel="noopener">API Keys</a> and tap <b>Create API Key</b>. Give it any name.', 'Copy the key (it starts with <b>gsk_</b>). Groq shows it only once.', 'Come back to Knowvia, tap <b>Paste</b> below, then <b>Connect</b>.'],
    fine: 'Free limits are per minute and per day and can change. If you see a "rate limit" message, wait a little or switch model from the menu under the text box.' },
  grok: { name: 'Grok (xAI)', host: 'api.x.ai', base: 'https://api.x.ai/v1', model: '', pref: [/grok/i], alt: true,
    tag: 'Credits or paid', blurb: 'Strong models, but xAI does not offer a standing free tier. Some new accounts get credits, so check before relying on it.',
    keyUrl: 'https://console.x.ai',
    steps: ['Open <a href="https://console.x.ai" target="_blank" rel="noopener">console.x.ai</a> and sign in.', 'Create an API key in the console.', 'Copy the key, paste it below, and press <b>Connect</b>.'],
    fine: 'Usage may be billed once any credits run out. Check your balance in the console.' },
  custom: { name: 'Custom (OpenAI compatible)', host: '', base: '', model: '', pref: [], alt: true, tag: 'Advanced', blurb: 'Any provider that follows the OpenAI chat format. You need its address, a key and a model name.', keyUrl: '', steps: [], fine: '' }
};
const PROV_TOP = ['gemini', 'openrouter', 'groq'], PROV_ALT = ['grok', 'custom'];
const cloudStatus = {}; let cloudOpen = 'gemini';
function cloudCfg(id) {
  const c = S.tutor.clouds[id] || (S.tutor.clouds[id] = { key: '', model: PROV[id] ? PROV[id].model : '', base: '', models: [], ok: false });
  if (!c.models) c.models = [];
  return c;
}
const providerBase = (id) => (cloudCfg(id).base || PROV[id].base || '').replace(/\/$/, '');
async function cloudFetch(id, path, opts) {
  const cfg = cloudCfg(id), url = providerBase(id) + path;
  opts = Object.assign({}, opts); opts.headers = Object.assign({}, opts.headers);
  if (cfg.key) opts.headers.Authorization = 'Bearer ' + cfg.key;
  try { return await fetch(url, opts); }
  catch (e) {
    if (e && e.name === 'AbortError') throw e;
    /* Some providers refuse browser requests. In the desktop app, retry through the local helper. */
    if (DESK) { try { const u = new URL(url); if (Object.keys(PROV).some((k) => PROV[k].host === u.host)) return await fetch('/cloud/' + u.host + u.pathname + u.search, opts); } catch (e2) { /* fall through */ } }
    throw e;
  }
}
function chatModels(id, ids) {
  const bad = id === 'groq' ? /whisper|guard|tts|playai|orpheus|embed|safeguard/i : id === 'gemini' ? /embed|tts|image|live|robotics|audio|aqa|imagen|veo|computer-use|learnlm|gemma-3n/i : /embed|tts|whisper|image|moderation/i;
  let out = ids.filter((m) => !bad.test(m));
  if (id === 'gemini') out = out.filter((m) => /^gemini/.test(m));
  return Array.from(new Set(out)).sort();
}
async function loadCloudModels(id) {
  const cfg = cloudCfg(id);
  const r = await cloudFetch(id, '/models');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  let ids = (j.data || j.models || []).map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
  if (id === 'openrouter') ids = ids.filter((m) => /:free$/.test(m));
  cfg.models = chatModels(id, ids);
  return cfg.models;
}
function pickModels(id, cur) {
  const cfg = cloudCfg(id), list = cfg.models.slice(), out = [];
  if (cur) out.push(cur);
  (PROV[id].pref || []).forEach((re) => { const m = list.find((x) => re.test(x)); if (m) out.push(m); });
  if (PROV[id].model) out.push(PROV[id].model);
  list.slice(0, 3).forEach((m) => out.push(m));
  return Array.from(new Set(out.filter(Boolean))).slice(0, 5);
}
function setCloudStatus(id, state, msg) { cloudStatus[id] = { state, msg }; refreshCloudSlots(); }
async function connectCloud(id) {
  const cfg = cloudCfg(id);
  if (!cfg.key) { setCloudStatus(id, 'bad', 'Paste your key first. Tap Paste, or press and hold in the box and choose Paste.'); return; }
  if (/^https?:\/\//i.test(cfg.key) || /\s/.test(cfg.key)) { setCloudStatus(id, 'bad', /^https?:/i.test(cfg.key) ? 'That is a web link, not a key. Open the key page, create a key there, and copy the long key it shows.' : 'The key has a space or a line break in it. Copy only the key itself, then paste again.'); return; }
  if (id === 'custom' && (!cfg.base || !cfg.model)) { setCloudStatus(id, 'bad', 'A custom provider needs an address, a key and a model name.'); return; }
  setCloudStatus(id, 'busy', 'Checking your key...');
  cfg.ok = false;
  try { await loadCloudModels(id); } catch (e) { /* the list is a bonus; the test below decides */ }
  const tries = id === 'custom' ? [cfg.model] : pickModels(id, cfg.model);
  if (!tries.length) { setCloudStatus(id, 'bad', 'No models were found. Check the key, or type a model name in Custom.'); return; }
  let last = '';
  for (const m of tries) {
    try {
      const r = await cloudFetch(id, '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 24, stream: false }) });
      if (r.ok) {
        cfg.model = m; cfg.ok = true; save();
        S.tutor.brain = 'cloud'; S.tutor.provider = id; save();
        setCloudStatus(id, 'good', 'Connected. Amani can now use ' + m + '.');
        afterTutorChange();
        return;
      }
      let body = ''; try { body = (await r.text()).slice(0, 300); } catch (e) { /* ignore */ }
      if (r.status === 429) { cfg.model = m; cfg.ok = true; save(); S.tutor.brain = 'cloud'; S.tutor.provider = id; save(); setCloudStatus(id, 'good', 'Your key works. This model is busy right now (rate limit), so pick another model from the menu if answers fail.'); afterTutorChange(); return; }
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key|key not valid|invalid.*key/i.test(body))) { setCloudStatus(id, 'bad', 'The provider refused this key. Copy it again from the provider page, with nothing before or after it. If it still fails, create a fresh key and try that one.'); return; }
      last = 'HTTP ' + r.status + (body ? ': ' + body.slice(0, 120) : '');
    } catch (e) { last = 'Could not reach ' + PROV[id].name + '. Check your internet connection and try again.'; if (!navigator.onLine) break; }
  }
  setCloudStatus(id, 'bad', last || 'Could not connect.');
}
function localModelList() { return (DESK && DESK.models && DESK.models.length) ? DESK.models : (ollamaModels || []); }
function tutorReady() { return !!((DESK && DESK.ready && localModelList().length) || (isNative() && localModelList().length) || Object.keys(S.tutor.clouds).some((k) => S.tutor.clouds[k] && S.tutor.clouds[k].ok)); }
function activeModelName() { const t = S.tutor; return t.brain === 'local' ? (t.model || '') : (cloudCfg(t.provider).model || ''); }
const keysOn = () => PROV_TOP.filter((id) => { const c = cloudCfg(id); return c.ok && c.key; });
function keysPanel() {
  const on = keysOn(), n = on.length;
  const rows = PROV_TOP.map((id) => `<li class="${on.includes(id) ? 'on' : ''}"><span class="kdot" aria-hidden="true">${on.includes(id) ? ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14, 2.6) : ''}</span><span><b>${esc(PROV[id].name)}</b> <span class="s">${esc(PROV[id].why || '')}</span></span></li>`).join('');
  const head = n >= 3 ? 'All three connected. Amani is ready for anything.' : n === 0 ? 'Recommended: connect all three free keys' : 'Connected ' + n + ' of 3. Connect the other ' + (3 - n === 1 ? 'one' : 'two') + ' for the full experience.';
  const why = n >= 3 ? 'If one runs out of its free limit or gets busy, Amani moves to the next by herself, and courses build much faster.' : 'Free keys have limits. With all three, Amani switches by herself when one is busy or used up, chat stays fast, and Build a course runs several models at once. It takes about two minutes each, and you only do it once.';
  return `<div class="keys3 pn-strong inset ${n >= 3 ? 'done' : ''}" role="group" aria-label="Recommended: connect all three keys"><b>${head}</b><ul>${rows}</ul><p class="help">${why}</p></div>`;
}
function cloudListHtml() {
  const card = (id, i, alt) => {
    const P = PROV[id], c = cloudCfg(id), st = cloudStatus[id] || {}, open = cloudOpen === id;
    const conn = c.ok ? '<span class="badge ok conn">Connected</span>' : '';
    const steps = P.steps.length ? `<ol class="guide">${P.steps.map((x) => `<li>${x}</li>`).join('')}</ol>` : '';
    const isCustom = id === 'custom';
    const models = c.models.length ? `<div class="field"><label for="m-${id}">Model</label><select id="m-${id}" data-in="cmodel" data-p="${id}">${c.models.map((m) => `<option value="${esc(m)}" ${m === c.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>` : (isCustom ? '' : '');
    const custom = isCustom ? `<div class="field"><label for="b-${id}">Address (ends in /v1)</label><input id="b-${id}" data-in="cbase" data-p="${id}" value="${esc(c.base || '')}" placeholder="https://.../v1" autocomplete="off"></div><div class="field"><label for="n-${id}">Model name</label><input id="n-${id}" data-in="cmodeltxt" data-p="${id}" value="${esc(c.model || '')}" autocomplete="off"></div>` : '';
    return `<div class="cloud pn-strong ${open ? 'open' : ''} ${alt ? 'alt' : ''}"><button class="ch" data-act="cloudopen" data-p="${id}" aria-expanded="${open}"><span class="rank">${alt ? ic(I.cloud, 18, 2) : i + 1}</span><span><b>${esc(P.name)}${conn}</b><span class="s">${esc(P.tag)}. ${esc(P.blurb)}</span></span><span class="chev">${ic(I.chev, 18, 2)}</span></button>
      ${open ? `<div class="body">${steps}${custom}<div class="field"><label for="k-${id}">Your API key</label><div class="keyrow"><input id="k-${id}" data-in="ckey" data-p="${id}" type="password" value="${esc(c.key)}" placeholder="Paste your key here" autocomplete="off" spellcheck="false"><button class="btn sm" data-act="ckeypaste" data-p="${id}">Paste</button><button class="btn primary" data-act="cloudconnect" data-p="${id}">${c.ok ? 'Test again' : 'Connect'}</button></div></div>
        ${st.msg ? `<p class="st-msg ${st.state}" role="status">${esc(st.msg)}</p>` : ''}${models}
        ${P.fine ? `<p class="fine">${esc(P.fine)}</p>` : ''}${P.keyUrl ? `<div class="row-actions"><a class="btn sm" href="${P.keyUrl}" target="_blank" rel="noopener">Open the ${esc(P.name.split(' ')[0])} key page</a></div>` : ''}</div>` : ''}</div>`;
  };
  const why = `<div class="why pn-strong inset"><b>Why Amani needs a free key</b>
    <p class="help">Amani thinks on a powerful AI service on the internet. A key is like a password that lets Knowvia talk to that service for you. You make it once, for free, in about two minutes, and Knowvia does the rest. Knowvia has no server of its own, so this is how Amani stays free for you.</p>
    <details><summary class="help">Is it safe?</summary><p class="help">Your key is saved only on this phone and is sent only to the service you pick. Do not share it with anyone. If you ever worry it leaked, delete it on the service's key page and make a new one.</p></details>
    <details><summary class="help">Will I be charged?</summary><p class="help">At the time of writing, the free plans below do not ask for a card. They have daily limits instead, and Knowvia tells you when one is reached.</p></details>
    <details><summary class="help">What if I reach a limit?</summary><p class="help">Free plans pause for a while, then work again (often the next day). If you connect two services, Knowvia moves to the second one by itself, so connect two when you can.</p></details>
    <details><summary class="help">What if I have no internet?</summary><p class="help">Lessons, quizzes and flashcards always work offline. On a phone that can run it, you can also add the offline tutor from Me.</p></details>
    <p class="help"><b>Start with number 1, Google Gemini.</b> It is the easiest, and it also powers Amani's voice and reading photos of pages.</p></div>`;
  return keysPanel() + why + `<p class="help" style="margin:0">Free cloud tutors, ranked. Cloud tutors are much faster than a small offline model. Tap one to see the steps.</p>
    <div class="clouds">${PROV_TOP.map((id, i) => card(id, i, false)).join('')}</div>
    <p class="sub-h">Other options</p><div class="clouds">${PROV_ALT.map((id, i) => card(id, i, true)).join('')}</div>`;
}
function refreshCloudSlots() { $$('.clouds-slot').forEach((el) => { const f = document.activeElement; const keep = f && el.contains(f) && f.id; const v = keep ? f.value : null; el.innerHTML = cloudListHtml(); if (keep) { const n = document.getElementById(keep); if (n) { n.value = v; n.focus(); } } }); }

/* Honest review status. Mirrors tools/kvpack.py in the workshop (tests/t_status.py checks they agree). Only a person's review earns the Reviewed tag. */
const QSTAT = ['draft', 'validated', 'ai-reviewed', 'human-reviewed', 'released'];
const QLINE = {
  draft: 'Draft. This course has not been reviewed yet.',
  validated: 'This course passed Knowvia\'s automatic checks. It has not yet had a separate review.',
  'ai-reviewed': 'Checked by automatic tests and a separate AI review. A person has not reviewed it yet.',
  'human-reviewed': 'Reviewed by a person.',
  released: 'Reviewed by a person and approved for release.'
};
function qualityInfo(q) {
  q = q || {};
  const status = QSTAT.includes(q.status) ? q.status : q.humanReviewed === true ? 'human-reviewed' : q.reviewed === true ? 'ai-reviewed' : 'draft';
  const risk = ['low', 'moderate', 'high'].includes(q.riskLevel) ? q.riskLevel : 'moderate';
  const tag = status === 'human-reviewed' || status === 'released';
  const riskNote = risk === 'high' && !tag ? 'This is a high-stakes subject. Use the course to learn, and check decisions with a qualified professional.' : risk === 'moderate' ? 'Check anything you rely on against current official sources.' : '';
  return { status, risk, tag, line: QLINE[status], riskNote };
}

/* ---------------- Markdown ---------------- */
function inline(s) {
  const hold = [], codes = [];
  /* code spans first, so a formula such as `=A1*B1*C1` is never touched by bold or italic */
  s = String(s).replace(/`([^`\n]+)`/g, (m, c) => { codes.push(c); return '\u0001' + (codes.length - 1) + '\u0001'; });
  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|<>~$])/g, (m, c) => { hold.push(c); return '\u0000' + (hold.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  /* Bold and italic follow the usual flanking rule: the opening star must not touch a letter, digit, ) ] or $ on its left,
     must be followed by a non-space, and the closing star must be preceded by a non-space and not touch a letter or digit.
     So =A1*B1*C1, 2*3*4, 3 * 4 * 5 and x**2 stay as written, while *like this* and **this** still work. */
  s = s.replace(/(^|[^\w*)\]$])\*\*\*([^\s*](?:[^*]*[^\s*])?)\*\*\*(?![\w*])/g, '$1<strong><em>$2</em></strong>');
  s = s.replace(/(^|[^\w*)\]$])\*\*([^\s*](?:[^*]*[^\s*])?)\*\*(?![\w*])/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^\w*)\]$])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?![\w*])/g, '$1<em>$2</em>');
  s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => esc(hold[+i]));
  return s;
}
/* A fenced code block: language label, indentation kept exactly, a Copy button. The code is shown, never run. */
const CODE_LABEL = { python: 'Python', py: 'Python', javascript: 'JavaScript', js: 'JavaScript', typescript: 'TypeScript', ts: 'TypeScript', sql: 'SQL', html: 'HTML', css: 'CSS', json: 'JSON', bash: 'Bash', sh: 'Shell', shell: 'Shell', powershell: 'PowerShell', excel: 'Excel formula', formula: 'Formula', sheets: 'Google Sheets formula', vba: 'VBA', r: 'R', java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#', cs: 'C#', php: 'PHP', go: 'Go', text: 'Text', txt: 'Text', output: 'Output', pseudocode: 'Pseudocode', csv: 'CSV', yaml: 'YAML', md: 'Markdown' };
function codeHtml(lang, code) {
  const label = CODE_LABEL[lang] || (lang && lang.length <= 14 ? lang.toUpperCase() : 'Code');
  const out = lang === 'output';
  return `<figure class="code${out ? ' out' : ''} nofollow" data-lang="${esc(lang)}"><figcaption><span class="code-lang">${esc(label)}</span><button type="button" class="btn sm code-copy" data-act="copy-code" aria-label="Copy this ${esc(label)} code">Copy</button></figcaption><pre tabindex="0" aria-label="${esc(label)} code example"><code>${esc(code)}</code></pre></figure>`;
}
const botMd = (t) => { const h = renderMd(t); return REG.hooks.cite ? REG.hooks.cite(h) : h; };
function renderMd(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const isBlank = (l) => /^\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    let m;
    if ((m = l.match(/^(\s*)```\s*([A-Za-z0-9_+#.-]*)\s*$/))) {
      const ind = m[1].length, lang = m[2].toLowerCase(), code = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { code.push(ind ? lines[i].replace(new RegExp('^ {0,' + ind + '}'), '') : lines[i]); i++; }
      if (i < lines.length) i++;
      while (code.length && !code[code.length - 1].trim()) code.pop();
      out.push(codeHtml(lang, code.join('\n'))); continue;
    }
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push('<div class="tablewrap"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) && !/^\s*\*\*/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*\*\*/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>'); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      out.push('<ol>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ol>'); continue;
    }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote class="inset">${inline(q.join(' '))}</blockquote>`); continue;
    }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,3}\s|\s*\||\s*```)/.test(lines[i]) && !(/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\*\*/.test(lines[i])) && !/^\s*\d+[.)]\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) { para.push(lines[i]); i++; }
    if (!para.length) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('');
}
function parseBlocks(body) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks = [];
  let buf = [], i = 0;
  const flush = () => { if (buf.join('').trim()) blocks.push({ type: 'md', text: buf.join('\n') }); buf = []; };
  while (i < lines.length) {
    const m = lines[i].match(/^:::(\w+)\s*(.*)$/);
    if (m) {
      flush();
      const content = []; i++;
      while (i < lines.length && lines[i].trim() !== ':::') { content.push(lines[i]); i++; }
      blocks.push({ type: m[1], args: m[2].trim(), text: content.join('\n') });
      i++;
    } else { buf.push(lines[i]); i++; }
  }
  flush();
  return blocks;
}
function plainText(body) {
  return body.replace(/^:::figure[^\n]*\n([\s\S]*?)\n:::[ \t]*$/gm, (m, t) => '\n' + (window.KVFig ? window.KVFig.spoken(t) : '') + '\n').replace(/^:::\w+.*$/gm, '').replace(/^:::$/gm, '').replace(/\\([*#])/g, '$1').replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------------- Check cards ---------------- */
function checkHtml(q, label) {
  const ans = prog().answers[q.id];
  const answered = ans !== undefined;
  const opts = q.options.map((o) => {
    let cls = 'opt', mk = '';
    if (answered && o.id === q.answer) { cls += ' correct'; mk = 'Correct'; }
    else if (answered && o.id === ans) { cls += ' wrong'; mk = 'Not quite'; }
    return `<button class="${cls}" data-act="answer" data-q="${q.id}" data-o="${o.id}" ${answered ? 'aria-disabled="true"' : ''}><span>${inline(o.text)}</span><span class="mk">${mk}</span></button>`;
  }).join('');
  const expl = answered ? `<p class="expl">${inline(q.explanation)}</p>` +
    (ans !== q.answer ? `<div><button class="btn sm" data-act="retry" data-q="${q.id}">Try again</button></div>` : '') : '';
  return `<section class="checkcard pn-strong" aria-label="${esc(label || 'Check yourself')}" data-qcard="${q.id}"><p class="lbl">${esc(label || 'Check yourself')}</p><p class="q">${inline(q.prompt)}</p><div class="opts">${opts}</div>${expl}</section>`;
}

/* ---------------- Lesson rendering ---------------- */
function lessonHtml(l, idx, total) {
  const p = pack();
  const blocks = parseBlocks(l.body).map((b) => {
    switch (b.type) {
      case 'md': return renderMd(b.text);
      case 'keyidea': return `<aside class="keyidea"><div class="ic raised">${ic(I.bulb, 22, 1.8)}</div><div><p class="lbl">Key idea</p><p>${inline(b.text.trim())}</p></div></aside>`;
      case 'compare': {
        const g = (k) => { const m = b.text.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); return m ? m[1] : ''; };
        return `<div class="compare"><div class="c weak inset"><p class="lbl" style="color:var(--muted)">Weak</p><p>${inline(g('weak'))}</p></div><div class="c strong"><p class="lbl">Strong</p><p>${inline(g('strong'))}</p></div>${g('note') ? `<p class="note">${inline(g('note'))}</p>` : ''}</div>`;
      }
      case 'example': {
        const t = (b.args.match(/title=(.*)$/) || [])[1] || 'Example';
        return `<div class="example"><p class="lbl">${esc(t)}</p><div class="in">${renderMd(b.text)}</div></div>`;
      }
      case 'exercise': {
        const t = (b.args.match(/title=(.*)$/) || [])[1] || 'Exercise';
        return `<div class="exercise"><p class="lbl">Your turn: ${esc(t)}</p><div class="in">${renderMd(b.text)}</div></div>`;
      }
      case 'check': { const q = qById(b.args.split(/\s+/)[0]); return q ? checkHtml(q) : ''; }
      case 'figure': return window.KVFig ? window.KVFig.render(b.text) : '';
      default: return renderMd(b.text);
    }
  }).join('');
  const outs = (l.outcomes || []).length ? `<div class="example" style="border-style:solid"><p class="lbl">By the end of this lesson you can</p><div class="in"><ul>${l.outcomes.map((o) => `<li>${inline(o)}</li>`).join('')}</ul></div></div>` : '';
  const practice = (p.quiz || []).filter((q) => q.lesson === l.id && !q.inline);
  const prac = practice.length ? `<h2 class="nofollow">Practice questions</h2>` + practice.map((q, n) => checkHtml(q, `Practice ${n + 1} of ${practice.length}`)).join('') : '';
  const prev = idx > 0 ? lessons()[idx - 1] : null;
  const next = idx < total - 1 ? lessons()[idx + 1] : null;
  const nav = `<div class="lesson-nav">${prev ? `<button class="btn" data-act="lesson" data-id="${prev.id}">Previous: ${esc(prev.title)}</button>` : '<span></span>'}` +
    (next ? `<button class="btn primary" data-act="finish" data-id="${l.id}" data-next="${next.id}">Next: ${esc(next.title)}</button>`
          : `<button class="btn primary" data-act="finish" data-id="${l.id}">Finish the pack</button>`) + '</div>';
  return `<div class="sheet pn-strong"><div class="hair" aria-hidden="true"></div><article class="prose" data-pid="${esc(p.id)}" data-lid="${esc(l.id)}">
    <header class="head"><div class="orn" aria-hidden="true"></div><p class="eyebrow">Lesson ${idx + 1} of ${total}. About ${l.minutes} minutes.</p><h1>${esc(l.title)}</h1><p class="lede">${esc(l.subtitle)}</p>${REG.hooks.lessonHead ? REG.hooks.lessonHead(l, p.id) : ''}</header>
    ${outs}${blocks}${REG.hooks.lessonExtra ? REG.hooks.lessonExtra(l) : ''}${prac}${nav}</article></div>`;
}

/* ---------------- Routing ---------------- */
let route = { name: 'home' };
let curHash = '';
try { curHash = location.hash || ''; } catch (e) { curHash = ''; }
const navStack = [], navTut = [];
function reopenTutor(tt) { if (tt) { tutorOpen = true; tutorFull = !!tt.full; renderTop(); renderTutor(); } }
function parseHash() {
  const h = (curHash || '').replace(/^#\/?/, '').split('/');
  const n = h[0] || 'home';
  if (n === 'lesson' && h[1] && lessonById(h[1])) return { name: 'lesson', id: h[1] };
  if (['home', 'learn', 'library', 'practice', 'progress', 'me', 'sources', 'cards', 'weak'].includes(n)) return { name: n };
  if (REG.screens[n]) return { name: n, id: h[1] ? decodeURIComponent(h[1]) : '', sub: h[2] ? decodeURIComponent(h[2]) : '' };
  return { name: 'home' };
}
/* Screens change the address without adding browser history entries. Knowvia keeps its own trail, so the Android back gesture is handled by the app (see handleBack). */
function setHash(h) {
  try { if (location.hash !== h) { if (window.history && history.replaceState) history.replaceState(history.state, '', h); else location.hash = h; } }
  catch (e) { try { location.hash = h; } catch (e2) { /* hash may be blocked in some frames */ } }
}
function go(path) {
  const h = '#/' + path;
  if (h === curHash) { onRoute(); return; }
  navStack.push(curHash); navTut.push(tutorOpen ? { full: tutorFull } : null); if (navStack.length > 50) { navStack.shift(); navTut.shift(); }
  curHash = h; setHash(h);
  onRoute();
}
function goBack() {
  while (navStack.length && navStack[navStack.length - 1] === curHash) { navStack.pop(); navTut.pop(); }
  if (!navStack.length) { goRoot('home'); return; }
  curHash = navStack.pop(); const tt = navTut.pop();
  setHash(curHash);
  onRoute(); reopenTutor(tt);
}
function goRoot(path) { navStack.length = 0; navTut.length = 0; curHash = '#/' + path; setHash(curHash); onRoute(); }
window.addEventListener('hashchange', () => { if (history.state && history.state.kv === 'base') return; let h = ''; try { h = location.hash; } catch (e) {} if (h && h !== curHash) { if (navStack.length && navStack[navStack.length - 1] === h) { navStack.pop(); const tt = navTut.pop(); curHash = h; onRoute(); reopenTutor(tt); } else { curHash = h; onRoute(); } } });

/* ---------------- The back button: layered, smart, and kind about leaving ---------------- */
const TAB_ROOTS = ['learn', 'library', 'practice', 'me', 'progress'];
let exiting = false, exitAt = 0, exitTimer = 0;
function hideExitHint() { const e = document.getElementById('exit-hint'); if (e) e.remove(); clearTimeout(exitTimer); }
function showExitHint() {
  hideExitHint(); const e = document.createElement('div'); e.id = 'exit-hint'; e.className = 'exit-hint pn-strong'; e.setAttribute('role', 'status');
  e.innerHTML = '<span>Press back again to exit</span><i class="eh-bar"></i>'; document.body.appendChild(e);
  exitTimer = setTimeout(() => { hideExitHint(); exitAt = 0; }, 3000);
}
function topOverlay() { const l = Array.from(document.querySelectorAll('.ov')).filter((o) => !o.hidden); return l[l.length - 1] || null; }
/* closes whatever is on top of the screen: a pop-up, the model menu, the text pop-up, the setup sheet, full-screen chat, the chat panel */
function closeTopLayer() {
  if ($('#selpop')) { selHide(); return true; }
  const ov = topOverlay();
  if (ov) {
    const btns = Array.from(ov.querySelectorAll('button[data-act]')), safe = btns.find((b) => /close|(^|-)no$|^ovclose$|keep|later|skip/.test(b.dataset.act));
    if (safe) { safe.click(); return true; }
    const cancel = btns.find((b) => /cancel|stop/.test(b.dataset.act));
    if (cancel) { toast('Still working. Press ' + (cancel.textContent.trim() || 'Cancel') + ' to stop.'); return true; }
    ov.remove(); return true;
  }
  if (mdlOpen) { mdlOpen = false; renderTutor(); return true; }
  if (setupOpen) { setupOpen = false; renderSetup(); return true; }
  if (tutorFull) { setFull(false); return true; }
  if (tutorOpen && tutorRoute() && window.innerWidth < 1180) { tutorOpen = false; tutorFull = false; renderTutor(); renderTop(); return true; }
  return false;
}
function flushProgress() {
  try {
    if (route.name === 'lesson') { const sc = $('#scroll'); if (sc) { const max = sc.scrollHeight - sc.clientHeight, f = max > 0 ? sc.scrollTop / max : 0, pr = prog(); pr.lessons[route.id] = Object.assign(pr.lessons[route.id] || {}, { scroll: Math.round(f * 1000) / 1000 }); } }
    clearTimeout(scrollT);
  } catch (e) { /* nothing to flush */ }
  saveNow();
}
function doExit() {
  exiting = true; hideExitHint(); flushProgress();
  try { S.sess = { t: 0, h: '#/home' }; saveNow(); } catch (e) { /* ignore */ }
  const AP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (AP && AP.exitApp) { try { AP.exitApp(); } catch (e) { /* fall through */ } }
}
function exitFlow() {
  if (exitAt && Date.now() - exitAt < 3000) { doExit(); return 'exit'; }
  exitAt = Date.now(); showExitHint(); return 'handled';
}
/* returns 'handled' when the app dealt with it, or 'exit' when the person confirmed leaving */
function handleBack() {
  const rs = document.getElementById('rs'); if (rs) { rs.click(); if (rs.isConnected) rs.classList.add('out'); setTimeout(() => rs.remove(), 400); return 'handled'; }
  if (closeTopLayer()) { hideExitHint(); exitAt = 0; return 'handled'; }
  if (obActive()) { if (ob.replay) { obClose(); return 'handled'; } if (ob.step >= 2) { obGo(ob.step - 1); return 'handled'; } return exitFlow(); }
  if (route.name === 'home') return exitFlow();
  hideExitHint(); exitAt = 0;
  if (TAB_ROOTS.includes(route.name)) { goRoot('home'); return 'handled'; }
  if (navStack.length) goBack(); else goRoot('home');
  return 'handled';
}
function initBack() {
  const AP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (AP && AP.addListener) { try { AP.addListener('backButton', () => { if (!exiting) handleBack(); }); } catch (e) { /* the history guard below still works */ } }
  /* a guard entry in the browser history: the system back gesture lands on it, the app reacts, then the guard is put back */
  try { history.replaceState({ kv: 'base' }, '', location.href); history.pushState({ kv: 'top' }, '', location.href); } catch (e) { return; }
  window.addEventListener('popstate', (ev) => {
    if (exiting) return; if (ev.state && ev.state.kv === 'top') return;
    if (!ev.state || ev.state.kv !== 'base') { try { history.replaceState({ kv: 'top' }, '', location.href); } catch (e) { /* ignore */ } return; }   /* a plain address change (link or hash), not the back gesture */
    const r = handleBack();
    if (r === 'exit') { exiting = true; try { history.back(); } catch (e) { /* ignore */ } } else { try { history.pushState({ kv: 'top' }, '', curHash || '#/home'); } catch (e) { /* ignore */ } }
  });
}

/* ---------------- Theme ---------------- */
const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function resolvedTheme() {
  if (S.theme !== 'frost') return S.theme;
  let dark = false;
  if (S.frostMode === 'dark') dark = true;
  else if (S.frostMode === 'auto') {
    dark = !!(mqDark && mqDark.matches);
    if (S.night) { const h = new Date().getHours(); if (h >= 19 || h < 6) dark = true; }
  }
  return dark ? 'frost-dark' : 'frost-light';
}
function applyTheme() {
  const root = document.documentElement, t = resolvedTheme();
  root.setAttribute('data-skin', t);
  const m = $('meta[name="theme-color"]');
  if (m) m.setAttribute('content', { 'frost-light': '#E8ECFA', 'frost-dark': '#0D1124', clay: '#F5EBDC', gold: '#14110E' }[t]);
  let reduce = S.reduce === 'on';
  if (S.reduce === 'auto') {
    reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 2);
  }
  root.classList.toggle('reduce', reduce);
  const lap = [17, 19, 22], ph = [16, 17.5, 20], ld = [1.7, 1.72, 1.68], pl = [1.78, 1.75, 1.7];
  root.style.setProperty('--fs', lap[S.size] + 'px'); root.style.setProperty('--lh', ld[S.size]);
  root.style.setProperty('--fs-m', ph[S.size] + 'px'); root.style.setProperty('--lh-m', pl[S.size]);
  renderBrand();
}
function renderBrand() {
  const t = resolvedTheme();
  $$('.brand').forEach((b) => { b.innerHTML = window.KV ? window.KV.flow(t, 46) : ''; });
  $$('.top-brand').forEach((b) => { b.innerHTML = window.KV ? window.KV.flow(t, 40) : ''; });
  $$('[data-amani]').forEach((b) => { b.innerHTML = window.KV ? window.KV.amani(t, +b.dataset.amani || 40, { round: true }) : ''; });
}
if (mqDark && mqDark.addEventListener) mqDark.addEventListener('change', applyTheme);
setInterval(() => { if (S.theme === 'frost' && S.night) applyTheme(); }, 300000);

/* ---------------- Shell ---------------- */
let tutorOpen = window.innerWidth >= 1180;
let chipsOpen = true, tutorFull = false, attached = '', attachedKey = '';
const NAV = [['home', 'Home', I.home], ['learn', 'Learn', I.book], ['library', 'Library', I.lib], ['practice', 'Practice', I.prac], ['progress', 'Progress', I.prog]];
function shell() {
  const rail = NAV.map(([k, n, d]) => `<button class="rail-btn" data-act="nav" data-r="${k}" data-nav="${k}">${ic(d)}${n}</button>`).join('') +
    `<div class="spacer"></div><button class="rail-btn" data-act="nav" data-r="me" data-nav="me">${ic(I.me)}Me</button>`;
  const tabs = NAV.filter((n) => n[0] !== 'progress').concat([['me', 'Me', I.me]]).map(([k, n, d]) => `<button class="tab" data-act="nav" data-r="${k}" data-nav="${k}">${ic(d, 22)}${n}</button>`).join('');
  $('#root').innerHTML = `<div class="app">
    <nav class="rail pn" aria-label="Main"><button class="brand" data-act="nav" data-r="home" aria-label="Knowvia home"></button>${rail}</nav>
    <div class="col"><header class="topbar" id="top"></header><div class="progress" id="pbar" aria-hidden="true"><i style="width:0%"></i></div><main class="scroll" id="scroll" aria-label="Content"></main></div>
    <aside class="tutor pn" id="tutor" aria-label="Tutor" hidden></aside>
    <button class="scrim" id="scrim" aria-label="Close tutor" hidden></button>
    <button class="fab" id="fab" data-act="tutor" hidden>${ic(I.chat, 22, 2)}Ask Amani</button>
    <nav class="tabs pn-strong" aria-label="Main">${tabs}</nav>
    <div class="toast pn-strong" id="toast" role="status" hidden></div></div>`;
  renderBrand();
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

function renderTop() {
  const p = pack(), r = route, top = $('#top');
  const names = Object.assign({ home: 'Home', learn: 'Learn', library: 'Library', practice: 'Practice', progress: 'Progress', me: 'Me', sources: 'Sources', cards: 'Flashcards', weak: 'Weak spots' }, REG.names);
  let left;
  if (r.name === 'lesson') {
    const ls = lessons(), idx = ls.findIndex((l) => l.id === r.id);
    left = `<button class="btn icon mobile-only" data-act="nav" data-r="learn" aria-label="Back to pack" style="border:0;background:none;box-shadow:none">${ic(I.back, 24, 2)}</button>
      <div class="crumbs"><span class="desktop-only">${esc(p.title)}</span><span class="desktop-only">${ic(I.chev, 16, 2)}</span><span class="cur">Lesson ${idx + 1} of ${ls.length}</span></div>`;
  } else if (['sources', 'cards', 'weak'].concat(Object.keys(REG.names)).includes(r.name)) {
    left = `<button class="btn icon" data-act="back" aria-label="Back" style="border:0;background:none;box-shadow:none">${ic(I.back, 24, 2)}</button><div class="crumbs"><span class="cur">${names[r.name]}</span></div>`;
  } else if (r.name === 'home') {
    left = `<div class="crumbs"><button class="top-brand mobile-only" data-act="nav" data-r="home" aria-label="Knowvia home"></button><span class="cur" style="font-family:var(--fh);font-size:22px">Knowvia</span></div>`;
  } else {
    left = `<div class="crumbs"><button class="top-brand mobile-only" data-act="nav" data-r="home" aria-label="Back to Home"></button><span class="cur">${names[r.name]}</span></div>`;
  }
  let right = '';
  if (r.name === 'home') {
    right = `<div class="tools"><button class="btn desktop-only ${tutorOpen ? 'primary' : ''}" data-act="tutor" aria-pressed="${tutorOpen}">${ic(I.chat, 20)}Amani</button></div>`;
  } else if (r.name === 'lesson') {
    right = `<div class="tools"><div class="state-chip inset desktop-only"><span class="dot"></span>Saved offline</div>
      <button class="btn icon desktop-only" data-act="size" data-d="-1" aria-label="Smaller text" style="font-family:var(--fr);font-size:15px">A</button>
      <button class="btn icon desktop-only" data-act="size" data-d="1" aria-label="Larger text" style="font-family:var(--fr);font-size:22px">A</button>
      <button class="btn icon mobile-only" data-act="size" data-d="cycle" aria-label="Change text size" style="font-family:var(--fr);font-size:18px;width:44px">Aa</button>
      <button class="btn desktop-only ${tutorOpen ? 'primary' : ''}" data-act="tutor" aria-pressed="${tutorOpen}">${ic(I.chat, 20)}Amani</button></div>`;
  }
  top.innerHTML = left + right;
  renderBrand();
  $$('[data-nav]').forEach((b) => { if (b.dataset.nav === (route.name === 'lesson' || ['sources', 'cards', 'weak', 'build', 'amani'].includes(route.name) ? (route.name === 'lesson' ? 'learn' : (route.name === 'sources' ? 'learn' : (route.name === 'build' ? 'library' : (route.name === 'amani' ? 'me' : 'practice')))) : route.name)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}

function setProgressBar(f) { const i = $('#pbar i'); if (i) i.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; }

/* ---------------- Screens ---------------- */
function statusOf(l) { const d = (prog().lessons[l.id] || {}); return d.done ? 'done' : (d.scroll > 0.02 ? 'started' : 'new'); }
function nextLesson() {
  const ls = lessons(), pr = prog();
  if (pr.last && lessonById(pr.last) && !(pr.lessons[pr.last] || {}).done) return lessonById(pr.last);
  return ls.find((l) => !(pr.lessons[l.id] || {}).done) || ls[0];
}
function dueCards(p) {
  const pr = prog(p), now = Date.now();
  return (p.flashcards || []).filter((c) => { const s = pr.cards[c.id]; return !s || s.due <= now; });
}
function qStats(p) {
  const pr = prog(p), qs = p.quiz || [];
  const done = qs.filter((q) => pr.answers[q.id] !== undefined);
  const right = done.filter((q) => pr.answers[q.id] === q.answer);
  return { total: qs.length, answered: done.length, right: right.length, wrong: done.filter((q) => pr.answers[q.id] !== q.answer) };
}


/* ---------------- Home ---------------- */
const TIPS = [
  ['Test yourself', 'Closing the page and writing what you remember beats rereading. Check afterwards and fix the gaps.'],
  ['Little and often', 'Short sessions on different days stick better than one long cram. Ten minutes tomorrow counts.'],
  ['Teach it back', 'Explain an idea out loud as if teaching a friend. The place where you stumble is what to study next.'],
  ['Sleep is part of studying', 'Your brain stores what you learned while you sleep. Review something small before bed.'],
  ['Mix it up', 'Switching between topics in practice feels harder, but it helps you choose the right method later.'],
  ['Ask better questions', 'Instead of highlighting, write one question for each section, then answer it tomorrow.'],
  ['Stuck? Rephrase it', 'If a lesson does not click, ask Amani to explain it another way or with a new example.'],
  ['Protect your focus', 'Phone away, one task, about 25 minutes. Then a real break. Repeat.']
];
let FACTS = null, aliveT = 0, aliveI = 0, aliveUser = false;
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buildFacts() {
  const p = pack(), out = [];
  if (p) lessons(p).forEach((l, i) => parseBlocks(l.body).filter((b) => b.type === 'keyidea').forEach((b) => out.push({ tag: 'From your course', icon: I.bulb, text: b.text.trim().replace(/\\([*#_])/g, '$1').replace(/\*\*/g, ''), lesson: l.id, label: 'Lesson ' + (i + 1) })));
  TIPS.forEach(([t, x]) => out.push({ tag: 'Study tip', icon: I.spark, text: t + '. ' + x }));
  const mix = shuffle(out), res = [];
  /* keep a fair mix of course ideas and tips */
  const course = mix.filter((f) => f.lesson), tips = mix.filter((f) => !f.lesson);
  for (let i = 0; i < Math.max(course.length, tips.length) && res.length < 9; i++) { if (course[i]) res.push(course[i]); if (tips[i]) res.push(tips[i]); }
  return res.slice(0, 9);
}
const SC = [['rgba(86,98,238,.30)', 'rgba(79,182,240,.28)'], ['rgba(233,144,106,.32)', 'rgba(234,182,91,.28)'], ['rgba(121,169,143,.34)', 'rgba(142,176,214,.28)'], ['rgba(176,160,255,.34)', 'rgba(255,190,226,.28)']];
function greeting() { const h = new Date().getHours(); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function screenHome() {
  const p = pack();
  if (!FACTS) FACTS = buildFacts();
  const nm = S.name ? ', ' + esc(S.name) : '';
  let cont = '';
  if (p) {
    const pr = prog(), ls = lessons(), doneN = ls.filter((l) => (pr.lessons[l.id] || {}).done).length, nl = nextLesson();
    const started = doneN > 0 || (pr.lessons[nl.id] || {}).scroll > 0.02;
    cont = `<section class="hero pn-strong kv-in" style="--d:1"><p class="eyebrow">${started ? 'Continue where you left off' : 'Start here'}</p><h2>${esc(nl.title)}</h2><p>${esc(nl.subtitle)}</p>
      <div class="bar" role="img" aria-label="${doneN} of ${ls.length} lessons done"><i style="width:${Math.round(doneN / ls.length * 100)}%"></i></div>
      <p class="meta">${esc(p.title)} · ${doneN} of ${ls.length} lessons done</p>
      <div class="row-actions"><button class="btn primary" data-act="lesson" data-id="${nl.id}" data-resume="1">${started ? 'Continue lesson' : 'Start lesson 1'}</button><button class="btn" data-act="nav" data-r="learn">All lessons</button></div></section>`;
  }
  const cards = FACTS.map((f, i) => {
    const sc = SC[i % SC.length];
    return `<article class="fact pn-strong" style="--sc:${sc[0]};--sc2:${sc[1]}" data-i="${i}"><p class="tag">${ic(f.icon, 18, 2)}${esc(f.tag)}${f.label ? ' · ' + esc(f.label) : ''}</p><p class="t">${esc(f.text)}</p>
      ${f.lesson ? `<button class="more" data-act="lesson" data-id="${f.lesson}">Open this lesson ${ic(I.chev, 16, 2)}</button>` : `<button class="more" data-act="askamani" data-q="${esc(f.text)}">Ask Amani about this ${ic(I.chev, 16, 2)}</button>`}</article>`;
  }).join('');
  const tile = (act, ico, t, d, extra, soon) => `<button class="tile raised ${soon ? 'dim' : ''} kv-in" style="--d:${extra}" data-act="${act}"><span class="ico">${ic(ico, 22, 1.8)}</span><b>${t}</b><span class="s">${d}</span>${soon ? '<span class="soon">Soon</span>' : ''}</button>`;
  const due = p ? dueCards(p).length : 0;
  return `<div class="page home">
    <div class="greet kv-in"><div class="av" data-amani="64"></div><div><h1>${greeting()}${nm}.</h1><p>What shall we learn today?</p></div></div>
    ${cont}
    ${keysNudge()}${offlineNudge()}
    ${REG.hooks.homeCard ? REG.hooks.homeCard() : ''}
    <section class="alive kv-in" style="--d:2" aria-label="Ideas and tips"><p class="sec-title" style="margin:0 0 8px">Today on Knowvia</p><div class="track" id="alive">${cards}</div><div class="dots" id="alive-dots">${FACTS.map((x, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div></section>
    <h2 class="sec-title" style="margin:6px 0 -6px">Go to</h2>
    <div class="tiles">
      ${tile('nav" data-r="library', I.lib, 'Library', 'Your courses and packs.', 3)}
      ${tile('nav" data-r="practice', I.cards, 'Flashcards', due ? due + ' due today.' : 'Review what you have learned.', 4)}
      ${tile('nav" data-r="progress', I.chart, 'Progress', 'See how far you have come.', 5)}
      ${tile('askamani', I.chat, 'Ask Amani', 'Your study companion, any time.', 6)}
      ${tile('nav" data-r="mysources', I.upload, 'Your own sources', 'Add a PDF, link or notes and learn from them.', 7)}
      ${tile('nav" data-r="build', I.spark, 'Build a course', 'Pick a topic and let Amani build it.', 8)}
    </div></div>`;
}
function keysNudge() {
  const n = keysOn().length;
  if (!S.onboarded || n === 0 || n >= 3 || (S.hints.keysUntil || 0) > Date.now()) return '';
  return `<section class="nudge pn-strong kv-in" style="--d:2"><span class="ico">${ic(I.cloud, 24, 1.8)}</span><div class="grow"><b>Connect all three free keys (${n} of 3)</b><p>Amani switches by herself when one is busy, and courses build faster. About two minutes each, once.</p></div>
    <div class="row-actions"><button class="btn primary sm" data-act="nav" data-r="me">Connect the rest</button><button class="btn sm" data-act="keysoff">Not now</button></div></section>`;
}
function offlineNudge() {
  if (!S.onboarded || !tutorReady() || localModelList().length || (S.hints.offlineUntil || 0) > Date.now()) return '';
  if (!DESK && !isNative() && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return ''; /* phone browsers cannot run an offline tutor; the Android app can */
  return `<section class="nudge pn-strong kv-in" style="--d:2"><span class="ico">${ic(I.laptop, 24, 1.8)}</span><div class="grow"><b>Want Amani to work with no internet?</b><p>Set up the offline tutor once. Then Amani keeps helping when your data runs out.</p></div>
    <div class="row-actions"><button class="btn primary sm" data-act="${DESK ? 'setupopen' : 'nav" data-r="me'}">Set it up</button><button class="btn sm" data-act="nudgeoff">Not now</button></div></section>`;
}
function startAlive() {
  clearTimeout(aliveT); aliveI = 0; aliveUser = false;
  const tr = $('#alive'); if (!tr || route.name !== 'home') return;
  const dots = $$('#alive-dots i'), items = $$('.fact', tr);
  const setDot = () => { const w = items[0] ? items[0].getBoundingClientRect().width + 14 : 1; const i = Math.min(items.length - 1, Math.round(tr.scrollLeft / w)); aliveI = i; dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  tr.addEventListener('scroll', () => { setDot(); }, { passive: true });
  ['pointerdown', 'wheel', 'touchstart'].forEach((e) => tr.addEventListener(e, () => { aliveUser = true; }, { passive: true }));
  const tick = () => {
    if (route.name !== 'home' || !document.body.contains(tr)) return;
    if (!aliveUser && !document.hidden && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      const w = items[0].getBoundingClientRect().width + 14, nxt = (aliveI + 1) % items.length;
      tr.scrollTo({ left: nxt * w, behavior: 'smooth' });
    }
    aliveT = setTimeout(tick, 7000);
  };
  aliveT = setTimeout(tick, 7000);
}
function showOv(html) {
  let ov = $('#info-ov'); if (!ov) { ov = document.createElement('div'); ov.id = 'info-ov'; ov.className = 'ov'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true">${html}<div class="row-actions"><button class="btn primary" data-act="ovclose">Got it</button></div></div>`;
}
const SOON = {};

function screenLearn() {
  const p = pack();
  if (!p) return empty('No packs yet', 'Open Library, then Build a course, to make your first one.');
  const pr = prog(), ls = lessons(), doneN = ls.filter((l) => (pr.lessons[l.id] || {}).done).length;
  const nl = nextLesson(), started = doneN > 0 || (pr.lessons[nl.id] || {}).scroll > 0.02;
  const due = dueCards(p).length;
  const rows = ls.map((l, i) => {
    const st = statusOf(l);
    return `<button class="lrow raised" data-act="lesson" data-id="${l.id}"><span class="lnum ${st === 'done' ? 'done' : 'inset'}">${st === 'done' ? ic(I.check, 18, 2.4) : i + 1}</span>
      <span class="grow"><p class="t">${esc(l.title)}</p><p class="s">${l.minutes} min${st === 'started' ? ' · In progress' : st === 'done' ? ' · Done' : ''}</p></span>${ic(I.chev, 18, 2)}</button>`;
  }).join('');
  const q = p.quality || {}, qi = qualityInfo(q);
  return `<div class="page">
    <section class="hero pn-strong"><p class="eyebrow">${started ? 'Continue where you left off' : 'Start here'}</p>
      <h2>${esc(nl.title)}</h2><p>${esc(nl.subtitle)}</p>
      <div class="bar" role="img" aria-label="${doneN} of ${ls.length} lessons done"><i style="width:${Math.round(doneN / ls.length * 100)}%"></i></div>
      <p class="meta">${doneN} of ${ls.length} lessons done · About ${nl.minutes} minutes for this lesson</p>
      <div class="row-actions"><button class="btn primary" data-act="lesson" data-id="${nl.id}" data-resume="1">${started ? 'Continue lesson' : 'Start lesson 1'}</button>
      <button class="btn" data-act="nav" data-r="practice">Flashcards${due ? ` (${due} due)` : ''}</button></div></section>
    <h2 class="sec-title">${esc(p.title)}</h2>
    <p class="meta" style="margin-top:-12px">${esc(p.outcome)}</p>
    <div class="lessons">${rows}</div>
    <div class="note-box inset"><b>Review status.</b> ${esc(qi.line)} ${qi.riskNote ? esc(qi.riskNote) + ' ' : ''}Facts were ${q.factChecked ? 'checked in part' : 'not yet checked'}. Examples marked invented are for practice.
      <button class="btn sm" style="margin-left:8px" data-act="nav" data-r="sources">See sources</button></div></div>`;
}
function empty(t, d, btn) { return `<div class="page"><div class="empty pn-strong"><h3>${esc(t)}</h3><p>${esc(d)}</p>${btn || ''}</div></div>`; }

function screenLibrary() {
  const cards = PACKS.map((p) => {
    const pr = prog(p), ls = lessons(p), n = ls.filter((l) => (pr.lessons[l.id] || {}).done).length;
    return `<button class="lrow raised" data-act="openpack" data-id="${p.id}" style="align-items:flex-start"><span class="lnum done">${ic(I.book, 18, 1.8)}</span>
      <span class="grow"><p class="t">${esc(p.title)}</p><p class="s">${esc(p.level)} · About ${p.estimatedHours} hours · ${ls.length} lessons · v${esc(p.version)}</p>
      <p class="s" style="margin-top:8px">${esc(p.subtitle)}</p><div class="bar" style="margin-top:10px"><i style="width:${Math.round(n / ls.length * 100)}%"></i></div></span></button>`;
  }).join('');
  return `<div class="page"><h1 class="h-title">Library</h1><div class="lessons">${cards}</div>
    <div class="empty pn-strong"><h3>More packs are on the way</h3><p>New packs you add show up here and work offline. Requesting any course you like comes in a later version.</p></div></div>`;
}

function screenPractice() {
  const p = pack(), due = dueCards(p).length, st = qStats(p), total = (p.flashcards || []).length;
  return `<div class="page"><h1 class="h-title">Practice</h1>
    <div class="grid2">
      <section class="hero pn-strong"><p class="eyebrow">Flashcards</p><h2>${due ? `${due} due today` : 'All caught up'}</h2>
        <p>${total} cards in this pack. Cards you know come back less often.</p>
        <div class="row-actions"><button class="btn primary" data-act="nav" data-r="cards">${due ? 'Start review' : 'Review anyway'}</button></div></section>
      <section class="hero pn-strong"><p class="eyebrow">Weak spots</p><h2>${st.wrong.length ? `${st.wrong.length} to revisit` : 'Nothing to fix yet'}</h2>
        <p>${st.answered ? `You have answered ${st.answered} of ${st.total} questions.` : 'Answer questions inside lessons and the ones you miss collect here.'}</p>
        <div class="row-actions"><button class="btn primary" data-act="nav" data-r="weak" ${st.wrong.length ? '' : 'disabled'}>Revisit them</button></div></section>
    </div></div>`;
}

let cardRun = null;
function screenCards() {
  const p = pack();
  if (!cardRun) {
    let deck = dueCards(p); if (!deck.length) deck = (p.flashcards || []).slice();
    cardRun = { deck, i: 0, flip: false, good: 0 };
  }
  const r = cardRun;
  if (r.i >= r.deck.length) {
    const g = r.good, n = r.deck.length; cardRun = null;
    return `<div class="page"><div class="empty pn-strong"><h3>Review done</h3><p>${g} of ${n} cards marked as known. The rest come back soon.</p>
      <button class="btn primary" data-act="nav" data-r="practice">Back to practice</button></div></div>`;
  }
  const c = r.deck[r.i];
  return `<div class="page"><p class="meta">Card ${r.i + 1} of ${r.deck.length}</p>
    <button class="fc pn-strong" data-act="flip" aria-label="Flip card"><span class="hint">${r.flip ? 'Answer' : 'Question'}</span>
      ${r.flip ? `<span class="back">${inline(c.back)}</span>` : `<span class="front">${inline(c.front)}</span><span class="hint">Tap to reveal the answer</span>`}</button>
    <div class="row-actions" style="justify-content:center">${r.flip ? `<button class="btn" data-act="rate" data-v="again">Again</button><button class="btn primary" data-act="rate" data-v="good">I know this</button>` : `<button class="btn primary" data-act="flip">Show answer</button>`}</div></div>`;
}

function screenWeak() {
  const p = pack(), st = qStats(p);
  if (!st.wrong.length) return empty('No weak spots', 'Questions you miss will collect here so you can try them again.', '<button class="btn primary" data-act="nav" data-r="learn">Back to lessons</button>');
  return `<div class="page"><h1 class="h-title">Weak spots</h1>${st.wrong.map((q) => checkHtml(q, 'Try again: lesson ' + (lessons().findIndex((l) => l.id === q.lesson) + 1))).join('')}</div>`;
}

function screenProgress() {
  const p = pack(), pr = prog(), ls = lessons(), st = qStats(p);
  const doneN = ls.filter((l) => (pr.lessons[l.id] || {}).done).length;
  const known = (p.flashcards || []).filter((c) => (pr.cards[c.id] || {}).box >= 3).length;
  const acc = st.answered ? Math.round(st.right / st.answered * 100) : null;
  const rows = ls.map((l, i) => {
    const d = pr.lessons[l.id] || {}, qs = (p.quiz || []).filter((q) => q.lesson === l.id), a = qs.filter((q) => pr.answers[q.id] !== undefined), ok = a.filter((q) => pr.answers[q.id] === q.answer);
    return `<div class="lrow raised" style="cursor:default"><span class="lnum ${d.done ? 'done' : 'inset'}">${d.done ? ic(I.check, 18, 2.4) : i + 1}</span>
      <span class="grow"><p class="t">${esc(l.title)}</p><p class="s">${d.done ? 'Done' : d.scroll > 0.02 ? 'In progress' : 'Not started'} · ${a.length ? ok.length + ' of ' + a.length + ' answers right' : 'No questions answered yet'}</p></span></div>`;
  }).join('');
  return `<div class="page"><h1 class="h-title">Progress</h1>
    <div class="grid3"><div class="stat raised"><b>${doneN}/${ls.length}</b><span>Lessons done</span></div>
      <div class="stat raised"><b>${acc === null ? '-' : acc + '%'}</b><span>Questions right</span></div>
      <div class="stat raised"><b>${known}/${(p.flashcards || []).length}</b><span>Flashcards known</span></div></div>
    <h2 class="sec-title">By lesson</h2><div class="lessons">${rows}</div></div>`;
}

function screenSources() {
  return `<div class="page"><div class="sheet pn-strong"><div class="hair"></div><article class="prose">${renderMd(pack().sources)}</article></div></div>`;
}

function themeCard(k, name, desc) {
  const sel = S.theme === k;
  const cls = k === 'frost' ? (resolvedTheme() === 'frost-dark' ? 'th-frost-dark' : 'th-frost-light') : 'th-' + k;
  return `<button class="tcard" data-act="theme" data-t="${k}" aria-pressed="${sel}"><div class="tprev ${cls}"><div class="tp"><i class="l1"></i><i class="l2"></i><i class="l2" style="width:60%"></i><i class="btn-s"></i></div></div>
    <div class="tname ${cls}"><b>${name}${sel ? ' · Selected' : ''}</b><span>${desc}</span></div></button>`;
}
const seg = (act, val, opts) => `<div class="seg inset" role="group">${opts.map(([v, n]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${String(val) === String(v)}">${n}</button>`).join('')}</div>`;
function screenMe() {
  const t = S.tutor;
  setTimeout(permStatus, 0);
  return `<div class="page"><h1 class="h-title">Me</h1>
  <section class="setting pn-strong"><h3>Appearance</h3>
    <div class="themes">${themeCard('frost', 'Frost Glass', 'Airy and modern. Light and dark.')}${themeCard('clay', 'Soft Clay', 'Warm, soft and tactile.')}${themeCard('gold', 'Charcoal and Gold', 'Luxurious. HP signature.')}</div>
    ${S.theme === 'frost' ? `<div class="field"><label>Frost Glass mode</label>${seg('frostmode', S.frostMode, [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Automatic']])}
      ${S.frostMode === 'auto' ? `<label class="switch"><input type="checkbox" data-act="night" ${S.night ? 'checked' : ''}> Also use dark mode from 7 pm to 6 am</label>` : ''}
      <p class="help">Dark mode is easier on the eyes for night reading. Automatic follows your device setting.</p></div>` : ''}
    <div class="field"><label>Text size</label>${seg('sizeset', S.size, [[0, 'Small'], [1, 'Medium'], [2, 'Large']])}</div>
    <div class="field"><label>Reduce effects</label>${seg('reduce', S.reduce, [['auto', 'Automatic'], ['on', 'On'], ['off', 'Off']])}
      <p class="help">Uses solid panels instead of frosted blur. Helps older phones and saves battery. Automatic turns it on when your device asks for it.</p></div></section>
  ${REG.hooks.meCard ? REG.hooks.meCard() : ''}
  <section class="setting pn-strong"><h3>Amani, your tutor</h3>
    <p class="help" id="tutor-now">${nowUsing()}</p>
    <p class="sub-h">Offline tutor</p>
    ${DESK ? `<div id="setup-slot" class="setupbox inset">${setupCardHtml(DESK)}</div>` : `${window.KVOffline ? `<div id="of-web-slot" class="setupbox inset">${window.KVOffline.card(null)}</div>` : ''}${isNative() ? '' : `<div class="field"><label for="ol-url">Ollama address</label><input id="ol-url" data-in="url" value="${esc(t.url)}" autocomplete="off"></div>
      <div class="row-actions"><button class="btn" data-act="checkollama">Check connection</button></div><p class="help" id="ol-status">Not checked yet.</p>
      <details><summary class="help" style="cursor:pointer">Offline tutor not connecting? Read this</summary><p class="help" style="margin-top:8px">1. Make sure Ollama is running (its icon is in the system tray).<br>2. Pull a small model once, for example <b>llama3.2:3b</b>, using <b>ollama pull llama3.2:3b</b>.<br>3. If you opened this app by double-clicking the file, set <b>OLLAMA_ORIGINS</b> to <b>*</b> and restart Ollama. The Knowvia desktop app does this for you.</p></details>`}`}
    ${(DESK ? DESK.models : ollamaModels).length ? `<div class="field"><label for="ol-model">Offline model</label><select id="ol-model" data-in="model">${(DESK ? DESK.models : ollamaModels).map((m) => `<option value="${esc(m)}" ${m === t.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>` : ''}
    <p class="sub-h">Cloud tutors</p>
    <div class="clouds-slot">${cloudListHtml()}</div>
  </section>
  <section class="setting pn-strong"><h3>Permissions</h3>
    <p class="help">Knowvia asks only when it needs something, and tells you why first.</p>
    <div class="field"><label>Keep my progress safe</label><p class="help" id="perm-storage">Checking...</p><div class="row-actions"><button class="btn" data-act="persist">Protect my progress</button></div></div>
    <p class="help"><b>Files, photos and camera.</b> Asked only when you add your own sources. <b>Notifications.</b> Not used yet; study reminders will ask first. <b>Installing the offline tutor.</b> Always asks before downloading anything.</p></section>
  <section class="setting pn-strong"><h3>About and data</h3>
    <p class="help">Knowvia version ${APP_VERSION}. Everything you do is saved on this device only.</p>
    ${window.KVUpdate && !DESK && !isNative() ? window.KVUpdate.card().line + window.KVUpdate.card().btn : ''}
    <details class="help" style="margin-top:6px"><summary style="cursor:pointer">App info for support</summary><p class="help" style="margin:6px 0">If something is not working, tap Copy and send this to the person who gave you the app. It has no keys, courses or personal files.</p><div class="row-actions"><button class="btn sm" data-act="info-copy">Copy app info</button></div><pre id="info-box" hidden style="white-space:pre-wrap;font-size:12px"></pre></details>
    ${isNative() ? '' : '<p class="help sign">Created by <b>Harry Precious</b> · HP Studio<br>Built with the HP Intelligence Framework</p>'}
    <div class="field"><label for="my-name">Your name</label><input id="my-name" data-in="myname" value="${esc(S.name || '')}" maxlength="24" autocomplete="off" placeholder="What should Amani call you?"></div>
    <div class="row-actions"><button class="btn" data-act="tour">Replay the welcome tour</button></div>
    ${DESK ? `<div class="field"><label>Install an update</label><p class="help">Drop the update file anywhere on this window, or choose it here. Your progress is kept.</p><input type="file" accept=".zip" data-in="updfile"></div>` : ''}
    <div class="row-actions"><button class="btn" data-act="resetask">Reset my progress</button><button class="btn" data-act="freshask">Start fresh</button></div></section></div>`;
}

/* ---------------- Render pipeline ---------------- */
function renderScreen() {
  const sc = $('#scroll');
  let html = '';
  if (REG.screens[route.name]) html = REG.screens[route.name](route);
  else switch (route.name) {
    case 'home': html = screenHome(); break;
    case 'learn': html = screenLearn(); break;
    case 'library': html = screenLibrary(); break;
    case 'practice': html = screenPractice(); break;
    case 'progress': html = screenProgress(); break;
    case 'me': html = screenMe(); break;
    case 'sources': html = screenSources(); break;
    case 'cards': html = screenCards(); break;
    case 'weak': html = screenWeak(); break;
    case 'lesson': {
      const ls = lessons(), idx = ls.findIndex((l) => l.id === route.id);
      html = lessonHtml(ls[idx], idx, ls.length); break;
    }
  }
  sc.innerHTML = html;
  renderBrand();
  sc.scrollTop = 0;
  clearTimeout(aliveT);
  if (route.name === 'home') { renderBrand(); requestAnimationFrame(startAlive); }
  if (route.name === 'lesson') {
    const d = prog().lessons[route.id] || {};
    prog().last = route.id; save();
    requestAnimationFrame(() => {
      if (route.resume && d.scroll > 0.02 && !d.done) { sc.scrollTop = d.scroll * (sc.scrollHeight - sc.clientHeight); }
      onScroll();
    });
  } else { setProgressBar(0); $('#pbar').style.visibility = 'hidden'; }
  if (route.name === 'lesson') $('#pbar').style.visibility = 'visible';
  if (REG.hooks.afterScreen) REG.hooks.afterScreen(route.name);
}
function onRoute() {
  const prev = route;
  route = parseHash();
  if (route.name === 'home' && prev && prev.name !== 'home') tutorOpen = false;
  if (route.name === 'lesson' && prev && prev.name !== 'lesson') tutorOpen = window.innerWidth >= 1180;
  mdlOpen = false;
  if (route.name !== 'cards') cardRun = null;
  if (route.name !== 'home') FACTS = FACTS; /* keep the same ideas during a session */
  if (route.name === 'lesson' && window.__resume) { route.resume = true; window.__resume = false; }
  renderTop(); renderScreen(); renderTutor(); touchSess();
}
let scrollT = 0;
function onScroll() {
  if (route.name !== 'lesson') return;
  const sc = $('#scroll'), max = sc.scrollHeight - sc.clientHeight, f = max > 0 ? sc.scrollTop / max : 0;
  setProgressBar(f);
  clearTimeout(scrollT);
  scrollT = setTimeout(() => { const pr = prog(); pr.lessons[route.id] = Object.assign(pr.lessons[route.id] || {}, { scroll: Math.round(f * 1000) / 1000 }); save(); }, 400);
}

/* ---------------- Tutor ---------------- */
let busy = false, ctrl = null, ollamaInfo = null, mdlOpen = false, ollamaModels = [];
function chatKey() { return pack().id + ':' + (route.name === 'lesson' ? route.id : 'pack'); }
const tutorRoute = () => route.name === 'lesson' || route.name === 'home';
function chat() { const k = chatKey(); if (!S.chats[k]) S.chats[k] = []; return S.chats[k]; }
function tutorContext() {
  if (route.name === 'lesson') {
    const l = lessonById(route.id), ls = lessons();
    const terms = (l.terms && l.terms.length ? l.terms : Array.from(new Set((String(l.body || '').match(/\*\*([^*\n]{2,40})\*\*/g) || []).map((x) => x.replace(/\*/g, '').trim())))).slice(0, 14);
    return { title: l.title, n: ls.findIndex((x) => x.id === l.id) + 1, terms, text: (l.title + '\n' + l.subtitle + '\n\n' + plainText(l.body)).slice(0, 7000) };
  }
  if (route.name === 'home' && pack()) {
    const p = pack(), ls = lessons();
    return { title: p.title, n: 0, home: true, text: ('COURSE: ' + p.title + '\n' + (p.outcome || '') + '\nLESSONS:\n' + ls.map((l, i) => (i + 1) + '. ' + l.title + ': ' + l.subtitle).join('\n')).slice(0, 5000) };
  }
  return null;
}
/* the best cloud model that is connected, whatever the chat is using. Building courses and writing lessons always use this, never an offline model. */
function bestCloud() {
  const t = S.tutor; let ids = [];
  if (t.brain === 'cloud' && cloudCfg(t.provider).key) ids.push(t.provider);
  PROV_TOP.concat(PROV_ALT).forEach((id) => { const c = cloudCfg(id); if (c.key && c.ok && !ids.includes(id)) ids.push(id); });
  const id = ids[0]; if (!id) return null; const c = cloudCfg(id); const m = c.model || (c.models || [])[0]; return m ? { k: 'cloud', p: id, m } : null;
}
function nowUsing() {
  const t = S.tutor, m = activeModelName();
  if (!m || (t.brain === 'cloud' && !cloudCfg(t.provider).key)) return 'No tutor is connected yet. Set one up below.';
  return t.brain === 'local' ? `Amani is using <b>${esc(m)}</b>, offline on this device.` : `Amani is using <b>${esc(m)}</b> from ${esc(PROV[t.provider].name)} (cloud).`;
}
function statusLine() {
  const t = S.tutor, m = activeModelName();
  if (!m || (t.brain === 'cloud' && !cloudCfg(t.provider).key)) return 'No tutor is connected yet. Open the model menu beside the text box, or set one up in Me.';
  if (t.brain === 'local') return `<span>Using <b>${esc(m)}</b> · offline on this device. <b>Private, slower, simpler answers.</b> ${REG.hooks.offlineLine ? REG.hooks.offlineLine() : ''}</span>`;
  return `<span>Using <b>${esc(m)}</b> · cloud via ${esc(PROV[t.provider].name)}. Smartest answers, needs internet.</span>`;
}
const SUGG = {};
function netErr(e) { const m = (e && e.message) || String(e); return !navigator.onLine || /Failed to fetch|NetworkError|getaddrinfo|HTTP 502|HTTP 504|Load failed|ECONN|timed out|network/i.test(m); }
function canGoOffline() { return !!(localModelList().length && S.tutor.brain === 'cloud'); }
function msgHtml(m, i) {
  if (m.role === 'user') return `<div class="bubble user">${m.quote ? `<blockquote class="uq">${esc(m.quote.length > 220 ? m.quote.slice(0, 220) + '…' : m.quote)}</blockquote>` : ''}<span>${esc(m.text)}</span></div>`;
  if (m.err) return `<div class="bubble bot raised err" role="alert">${renderMd(m.text)}<div class="erract"><button class="btn sm primary" data-act="retryask">${ic(I.refresh, 16, 2)}Try again</button>${canGoOffline() ? '<button class="btn sm" data-act="useoffline">Use the offline tutor</button>' : ''}<button class="btn sm" data-act="nav" data-r="me">Tutor settings</button><button class="btn sm" data-act="errdismiss">Dismiss</button></div></div>`;
  const listen = m.text && canSpeakNow() ? `<button class="listen" data-act="listen" data-i="${i}" aria-label="Listen to this answer" title="Listen">${ic(I.speaker, 16, 1.9)}</button>` : '';
  return `<div class="bubble bot raised">${m.text ? botMd(m.text) : '<span class="typing"><i></i><i></i><i></i></span>'}${listen}</div>`;
}
/* Amani ends each answer with a hidden line of suggested next taps. We hide it while streaming and read it afterwards. */
function visibleText(raw) { const i = raw.search(/<<|<\s*$/); return (i < 0 ? raw : raw.slice(0, i)).replace(/\s+$/, ''); }
function splitNext(raw) {
  const i = raw.search(/<<\s*next/i);
  if (i < 0) return { text: visibleText(raw), next: [] };
  const m = raw.slice(i).match(/<<\s*next\s*:?\s*([\s\S]*?)(?:>>|$)/i);
  const next = m ? m[1].split('|').map((x) => x.replace(/^["'\s\-*]+|["'\s*]+$/g, '').trim()).filter((x) => x && x.length <= 70) : [];
  return { text: raw.slice(0, i).trim(), next: next.slice(0, 4) };
}
const POOL_L = ['Quiz me on this', 'Give me another example', 'Explain it simpler', 'Why does this matter?', 'Sum it up in 3 points', 'What mistake do people make here?', 'How would I use this?', 'Test me with a harder one'];
const POOL_H = ['Quiz me on this course', 'How do I study this?', 'What should I learn first?', 'Give me a study tip', 'What will I be able to do?'];
const QUIZ_RE = /^(quiz|test) me/i;
function fallbackSugg(ctx, text) {
  if (/(^|\n)\s*\**A[).:]\**\s.+\n[\s\S]*\bB[).:]/.test(text) && /\?/.test(text)) return ['A', 'B', 'C', 'Give me a hint'];
  const n = S.sugN = (S.sugN || 0) + 1, pool = ctx && ctx.home ? POOL_H : POOL_L;
  const rest = pool.filter((x) => !QUIZ_RE.test(x)), pick = [];
  for (let k = 0; pick.length < 2 && k < rest.length; k++) pick.push(rest[(n * 2 + k * 3) % rest.length]);
  const uniq = Array.from(new Set(pick));
  return ensureQuiz(uniq.length >= 2 ? uniq : rest.slice(0, 2), ctx, n);
}
function ensureQuiz(list, ctx, n) {
  const hasQ = list.some((x) => QUIZ_RE.test(x));
  if (hasQ || /^[A-C]$/.test(list[0] || '')) return list.slice(0, 4);
  n = n || S.sugN || 1;
  /* quiz help comes up in two of every three suggestion sets */
  if (n % 3 === 0) return list.slice(0, 3);
  const q = ctx && ctx.home ? 'Quiz me on this course' : 'Quiz me on this';
  return [q].concat(list.slice(0, 2));
}
function chipsHtml(ctx) {
  const list = SUGG[chatKey()] || (ctx.home ? ['How do I study this?', 'What will I learn?', 'Study tips'] : ['Explain simpler', 'Give an example', 'Quiz me']);
  return list.map((t, i) => `<button class="btn sm round chip-in" style="--d:${i}" data-act="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('');
}

function menuHtml() {
  const t = S.tutor, loc = localModelList();
  const row = (k, p, m, sel) => `<button class="mi" role="menuitemradio" aria-checked="${sel}" data-act="pickmodel" data-k="${k}" data-p="${p}" data-m="${esc(m)}"><span class="ck">${sel ? ic(I.check, 16, 2.6) : ''}</span><span>${esc(m)}</span></button>`;
  let h = '<h4>On this device · offline</h4><p class="mnote">Private, works with no internet. Slower, simpler answers, default Amani voice. Chat only.</p>';
  h += loc.length ? loc.map((m) => row('local', '', m, t.brain === 'local' && t.model === m)).join('') : '<p class="none">No offline model installed yet.</p>';
  let any = false, any1 = false;
  PROV_TOP.concat(PROV_ALT).forEach((id) => {
    const c = cloudCfg(id); if (!c.ok) return; any = true;
    const list = c.models.length ? c.models : [c.model];
    h += `<h4>${esc(PROV[id].name)} · cloud</h4>` + (any1 ? '' : '<p class="mnote">Smartest answers and your full Amani voice. Needs internet. Builds courses.</p>') + list.map((m) => row('cloud', id, m, t.brain === 'cloud' && t.provider === id && c.model === m)).join(''); any1 = true;
  });
  if (!any) h += '<h4>Cloud</h4><p class="none">No cloud model connected yet.</p>';
  return h + '<div class="addmore"><button class="btn sm" data-act="nav" data-r="me" style="width:100%">Connect more models</button></div>';
}
async function loadMenuModels() {
  try {
    if (DESK) { const st = await studio('status'); if (st.ok) DESK = st; }
    else ollamaModels = (await fetchOllamaModels()).models;
  } catch (e) { /* no offline engine reachable: the menu says so */ }
  if (mdlOpen) renderTutor();
}
function qFab() {
  const n = (SUGG[chatKey()] || []).length || 3, open = chipsOpen;
  return `<button type="button" class="sugg-fab" id="sfab" data-act="qtoggle" aria-expanded="${open}" aria-label="${open ? 'Hide suggestions' : 'Show suggestions'}" title="${open ? 'Hide suggestions' : 'Show suggestions'}"><span class="sf-i sf-spark">${ic(I.spark, 19, 1.9)}</span><span class="sf-i sf-chev">${ic(I.down, 19, 2.3)}</span><em>${n}</em></button>`;
}
function setChips(v) {
  chipsOpen = v;
  const w = $('#qwrap'), t = $('#tutor'), f = $('#sfab'); if (!w || busy) return;
  w.classList.toggle('open', v); if (t) t.classList.toggle('qc', !v);
  if (f) { f.setAttribute('aria-expanded', v); const l = v ? 'Hide suggestions' : 'Show suggestions'; f.setAttribute('aria-label', l); f.title = l; }
}
function setFull(v) {
  tutorFull = v; const t = $('#tutor'); if (!t) return;
  t.classList.remove('fx'); void t.offsetWidth; t.classList.add('fx');
  renderTutor();
}
function attachText(txt) {
  txt = (txt || '').replace(/\s+/g, ' ').trim().slice(0, 1200); if (!txt) return;
  attached = txt; attachedKey = chatKey(); tutorOpen = true;
  renderTop(); renderTutor();
  setTimeout(() => { const i = $('#tin'); if (i) i.focus({ preventScroll: true }); }, 60);
}
function renderTutor() {
  const el = $('#tutor'), fab = $('#fab'), scrim = $('#scrim'), isL = tutorRoute();
  const narrow = window.innerWidth < 860;
  const open = isL && tutorOpen;
  el.hidden = !open; fab.hidden = !(isL && !open && narrow); scrim.hidden = !(open && (narrow || window.innerWidth < 1180));
  el.classList.toggle('thinking', !!busy);
  if (!open) { tutorFull = false; el.classList.remove('full'); document.documentElement.classList.remove('tfull'); return; }
  if (attachedKey !== chatKey()) { attached = ''; attachedKey = chatKey(); }
  el.classList.toggle('full', tutorFull); document.documentElement.classList.toggle('tfull', tutorFull);
  const keep = ($('#tin') || {}).value || '', hadFocus = !!($('#tin') && document.activeElement === $('#tin'));
  const ctx = tutorContext(), t = S.tutor;
  const msgs = chat();
  const hello = ctx.home ? `Hi${S.name ? ' ' + esc(S.name) : ''}, I'm Amani. Ask me about your course, or how to study it.` : 'Ask me anything about this lesson. I can explain it more simply, give you an example, or quiz you.';
  const ctxLine = busy ? 'Amani is thinking' : (ctx.home ? 'Ask about ' + esc(ctx.title) : 'Reading Lesson ' + ctx.n + ', ' + esc(ctx.title));
  el.innerHTML = `<div aria-hidden="true" style="height:1px;background:var(--hair);flex:none"></div>
    <div class="t-head"><div class="t-row"><h2><span class="t-av ${busy ? 'live' : ''}" data-amani="30"></span>Amani</h2><div class="t-row">
      <button class="btn icon" data-act="tfull" aria-label="${tutorFull ? 'Exit full screen' : 'Full screen chat'}" title="${tutorFull ? 'Exit full screen' : 'Full screen chat'}" style="border:0;background:none;box-shadow:none">${ic(tutorFull ? I.shrink : I.expand, 21, 1.8)}</button>
      <button class="btn icon" data-act="nav" data-r="amani" aria-label="Amani's personality" title="Amani's personality" style="border:0;background:none;box-shadow:none">${ic(I.gear, 21, 1.8)}</button>
      <button class="btn icon" data-act="tutor" aria-label="Close Amani" style="border:0;background:none;box-shadow:none">${ic(I.close, 22, 2)}</button></div></div>
      <div class="ctx inset"><span class="dot ${busy ? 'pulse' : ''}" style="background:var(--accent-text)"></span><span>${ctxLine}${busy ? '<span class="dots3"><i></i><i></i><i></i></span>' : ''}</span></div></div>
    <div class="msgs" id="msgs" aria-live="polite">${msgs.length ? msgs.map(msgHtml).join('') : `<p class="bubble bot raised">${hello}</p>`}</div>
    <div class="qwrap ${chipsOpen && !busy ? 'open' : ''} ${busy ? 'busy' : ''}" id="qwrap"><div class="qbox"><div class="qclip"><div class="quick" id="quick">${busy ? '' : chipsHtml(ctx)}</div></div></div>${qFab()}</div>
    <form class="t-input" id="tform">
      ${attached ? `<div class="attach" id="attach">${ic(I.quote, 18, 1.9)}<div class="aq"><b>Asking about</b><span>${esc(attached.length > 160 ? attached.slice(0, 160) + '…' : attached)}</span></div><button type="button" class="btn icon sm" data-act="unattach" aria-label="Remove the attached text">${ic(I.close, 16, 2.2)}</button></div>` : ''}
      <button type="button" class="mdl-btn" data-act="mdl" aria-label="Choose the model Amani uses" aria-haspopup="menu" aria-expanded="${mdlOpen}">${ic(I.spark, 20, 1.9)}<span class="cv">${ic(I.down, 16, 2.2)}</span></button>
      <input id="tin" aria-label="${ctx.home ? 'Ask Amani' : 'Ask about this lesson'}" placeholder="${attached ? 'Type what you want to know about it' : ctx.home ? 'Ask Amani anything' : 'Ask about this lesson'}" autocomplete="off">
      ${busy ? `<button type="button" class="btn primary send" data-act="stop" aria-label="Stop">${ic(I.stop, 18, 2)}</button>` : `<button type="submit" class="btn primary send" aria-label="Send">${ic(I.send, 20, 2)}</button>`}
      ${mdlOpen ? `<div class="mdl-menu pn-strong" id="mdlmenu" role="menu" aria-label="Available models">${menuHtml()}</div>` : ''}</form>
    <p class="t-status" id="t-status"><span class="dot" style="background:${t.brain === 'local' ? 'var(--ok)' : 'var(--accent-text)'}"></span>${statusLine()}</p>`;
  const tin = $('#tin'); if (tin && keep) tin.value = keep;
  if (tin && hadFocus) { tin.focus({ preventScroll: true }); try { tin.setSelectionRange(tin.value.length, tin.value.length); } catch (x) {} el.classList.add('typing'); }
  el.classList.toggle('qc', !(chipsOpen && !busy));
  const m = $('#msgs'); m.scrollTop = m.scrollHeight;
  renderBrand();
}
/* Offline models are small and slow, so they get a short, plain prompt: no personality, a trimmed lesson, short answers. Your Amani style comes back on a cloud model. */
function leanPrompt(ctx) {
  const lesson = ctx.home ? 'The learner is on the home screen of a course. Course outline:\n' : 'The learner is reading this lesson. Answer from it. If the answer is not in it, say so in one short sentence, then help briefly.\nLESSON:\n';
  return 'You are Amani, a friendly study helper in the Knowvia app. Answer in plain, simple English in under 120 words. Be accurate and never invent facts. If asked to quiz, ask ONE question with options A, B and C. If the learner says "Continue", carry on from where your last answer stopped.\n' + lesson + String(ctx.text || '').slice(0, 1500);
}
function systemPrompt(ctx) {
  if (S.tutor.brain === 'local') return leanPrompt(ctx);
  const who = 'You are Amani, a study companion inside the learning app Knowvia. ';
  const persona = REG.hooks.persona ? REG.hooks.persona(ctx) : 'Be warm and patient. ';
  const earlier = 'Earlier replies in this chat may have been written by a different model or in a different voice. From now on, always speak as the character above. ';
  const rules = 'Keep explanations easy to follow. The language, tone and length rules in YOUR CHARACTER above come first. Never invent facts, statistics or sources. Examples in the lesson marked as invented are for practice only. When asked to quiz, ask ONE question with options A, B and C and wait for the reply.\n' +
    'After your answer, add ONE final line in exactly this form: <<next: first idea | second idea | third idea>>. These are things the learner might tap next, written in the learner\'s voice, under 8 words each, and specific to what you just said (a follow-up question, a harder example, or a request to be quizzed). Include a quiz request in most replies. If you just asked a quiz question, give the answer options instead, for example <<next: A | B | C>>. Never mention or explain this line.\n\n';
  if (ctx.home) return who + persona + earlier + 'The learner is on the home screen. They may ask about the course below or about how to study. Answer using the course. If something is not in the course, say so briefly and help from general knowledge, labelled as general knowledge. ' + rules + ctx.text;
  return who + persona + earlier + 'The learner is reading the lesson below. Answer using the lesson. If the answer is not in the lesson, say so in one short sentence, then help from general knowledge and label it as general knowledge. ' + rules +
    'THE LESSON ON SCREEN (Lesson ' + ctx.n + ' of the course "' + pack().title + '"):\n' + ctx.text;
}
const QUICK = {
  simple: ['Explain this lesson more simply', 'Explain this lesson in simple words in about five short sentences, as if to a beginner.'],
  example: ['Give me an example', 'Give me one new, realistic example from a small Nigerian business that shows the main idea of this lesson. Mark it as an invented example.'],
  quiz: ['Quiz me on this lesson', 'Ask me ONE multiple-choice question about this lesson with options A, B and C. Wait for my answer before telling me the result.'],
  quizhome: ['Quiz me on this course', 'Ask me ONE multiple-choice question about this course with options A, B and C. Wait for my answer before telling me the result.'],
  plan: ['How do I study this course?', 'Give me a simple 3-step plan to study this course, based on its lessons. Keep it short and encouraging.'],
  learn: ['What will I learn?', 'In plain words, what will I be able to do after finishing this course? Use a short list.'],
  tips: ['Give me study tips', 'Give me 3 short, practical study tips for learning this course.']
};
const CHIP_MAP = { 'Explain simpler': 'simple', 'Give an example': 'example', 'Quiz me': 'quiz', 'How do I study this?': 'plan', 'What will I learn?': 'learn', 'Study tips': 'tips' };
function clearErrors(msgs) { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].err || msgs[i].failed) msgs.splice(i, 1); }
async function askTutor(shown, prompt, quote) {
  if (busy) return;
  const ctx = tutorContext(); if (!ctx) return;
  stopSpeak(); mdlOpen = false;
  const key = chatKey(), msgs = chat();
  clearErrors(msgs);
  const um = { role: 'user', text: shown }, reply = { role: 'tutor', text: '' }, raw = { v: '' };
  const origPrompt = prompt;
  if (quote) { um.quote = quote; prompt = 'The learner selected this passage: "' + quote + '"\nTheir request about it: ' + (prompt || shown) + '\nAnswer about that passage specifically, using the lesson for context.'; }
  msgs.push(um); msgs.push(reply);
  busy = true; chipsOpen = true; renderTutor();
  const offline = S.tutor.brain === 'local';
  const history = msgs.slice(0, -2).filter((m) => m.text).slice(offline ? -4 : -8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: (m.quote ? '[Selected passage: "' + m.quote.slice(0, 300) + '"] ' : '') + (offline ? m.text.slice(0, 700) : m.text) }));
  const remind = !offline && REG.hooks.personaReminder ? REG.hooks.personaReminder() : '';
  const payload = [{ role: 'system', content: systemPrompt(ctx) }].concat(history, [{ role: 'user', content: (prompt || shown) + remind }]);
  try { const gnd = REG.hooks.ground ? await REG.hooks.ground(prompt || shown, ctx, quote) : ''; if (gnd) payload[0].content += gnd; } catch (e) { /* answer without excerpts */ }
  ctrl = new AbortController();
  const live = () => { const nodes = $$('#msgs .bubble.bot'); return nodes[nodes.length - 1]; };
  const onChunk = (c) => { raw.v += c; reply.text = visibleText(raw.v); const n = live(); if (n) { n.innerHTML = reply.text ? botMd(reply.text) : '<span class="typing"><i></i><i></i><i></i></span>'; const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; } };
  let ok = false;
  try {
    if (S.tutor.brain === 'local') await streamOllama(payload, onChunk, ctrl.signal);
    else await streamCloud(payload, onChunk, ctrl.signal);
    const sp = splitNext(raw.v);
    reply.text = sp.text;
    if (!reply.text.trim()) throw new Error('empty');
    SUGG[key] = (sp.next.length >= 2 ? ensureQuiz(sp.next, ctx) : fallbackSugg(ctx, sp.text)).slice(0, 4);
    if (offline && lastCut) SUGG[key] = ['Continue'].concat(SUGG[key].filter((x) => x !== 'Continue')).slice(0, 4);
    ok = true;
    if (REG.hooks.netOk) REG.hooks.netOk();
  } catch (e) {
    if (e && e.name === 'AbortError') { const sp = splitNext(raw.v); if (sp.text) { reply.text = sp.text; } else { msgs.splice(msgs.length - 2, 2); } }
    else {
      um.failed = true; reply.err = true; reply.retry = { shown, prompt: origPrompt, quote: quote };
      reply.net = netErr(e); um.net = reply.net;
      reply.text = (e && e.message === 'empty') ? 'The model sent an empty answer. Try again, or pick another model from the menu beside the text box.' : errText(e);
      if (netErr(e) && S.tutor.brain === 'cloud' && REG.hooks.netFail) REG.hooks.netFail();
    }
  }
  busy = false; ctrl = null;
  if (msgs.length > 40) msgs.splice(0, msgs.length - 40);
  save(); renderTutor();
}
function errText(e) {
  const m = (e && e.message) || String(e);
  if (S.tutor.brain === 'local' && isNative()) {
    if (/HTTP 404/.test(m)) return 'This offline model is not on your phone yet. Open Me, then Offline tutor, and download one. Or pick a cloud model from the menu beside the text box.';
    return 'The offline tutor on your phone could not answer (' + m.slice(0, 140) + '). Try again, or pick a cloud model from the menu beside the text box.';
  }
  if (S.tutor.brain === 'local' && DESK) {
    if (/HTTP 404/.test(m)) return 'The tutor model is not installed yet. Open Me and use Tutor setup, or switch the model.';
    return 'The tutor is not running yet. Open Me and press the setup button. It will start or install what is missing.';
  }
  if (S.tutor.brain === 'local') {
    if (/HTTP 404/.test(m)) return 'Ollama is running but this model is not installed. Open the tutor settings, press Check connection, and pick an installed model, or run: ollama pull llama3.2:3b';
    return 'I could not reach Ollama. Check that Ollama is running and a model is installed. If you opened this app by double-clicking the file, Ollama may need OLLAMA_ORIGINS set to *, or use start.bat. Details are in the tutor settings.';
  }
  if (/HTTP 401|HTTP 403/.test(m)) return 'The cloud provider refused the request. Check your API key in Me, under Cloud tutors.';
  if (!cloudCfg(S.tutor.provider).key) return 'Cloud answers need an API key. Open Me, pick a cloud tutor and connect it, or switch to the offline model from the menu beside the text box.';
  if (/HTTP 429/.test(m)) return 'This model has hit its free limit for now. Pick a different model from the menu beside the text box, or wait a little.';
  if (/HTTP 404/.test(m)) return 'The provider does not know this model name any more. Pick another model from the menu beside the text box.';
  if (netErr(e)) return 'Knowvia could not reach ' + PROV[S.tutor.provider].name + '. Your internet may be off or very slow. This message goes away by itself once the connection is back.';
  return 'The cloud tutor did not answer (' + m.slice(0, 160) + '). Try again, or pick another model from the menu beside the text box.';
}
/* Listen: the device reads an answer aloud with its own voice. Character voices for Amani come later. */
let speaking = -1;
const canSpeakNow = () => (REG.hooks.canSpeak ? REG.hooks.canSpeak() : 'speechSynthesis' in window);
function stopSpeak() { try { if (REG.hooks.stopSpeech) REG.hooks.stopSpeech('chat'); else window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} speaking = -1; $$('.listen.on').forEach((b) => b.classList.remove('on')); }
function speak(i) {
  const m = chat()[i]; if (!m || !m.text) return;
  if (speaking === i) { stopSpeak(); return; }
  stopSpeak();
  if (REG.hooks.speakText) {
    speaking = i; const bt = document.querySelector('.listen[data-i="' + i + '"]'); if (bt) bt.classList.add('on', 'busy');
    if (!REG.hooks.speakText(m.text, { key: 'chat' + i, title: 'Amani', done: () => { if (speaking === i) stopSpeak(); } })) { stopSpeak(); toast('No voice is ready. Open Me, then Voice.'); }
    return;
  }
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(m.text.replace(/[*_`#>|]/g, ' ').replace(/\s+/g, ' '));
  const v = REG.hooks.voice ? REG.hooks.voice() : {}; u.rate = v.rate || 1; u.pitch = v.pitch || 1; u.lang = 'en';
  u.onend = u.onerror = () => { if (speaking === i) stopSpeak(); };
  speaking = i; const b = document.querySelector('.listen[data-i="' + i + '"]'); if (b) b.classList.add('on');
  window.speechSynthesis.speak(u);
}
let lastCut = false;
async function streamOllama(messages, onChunk, signal) {
  const t = S.tutor;
  if (!t.model) {
    const info = await fetchOllamaModels();
    if (info.models.length) { t.model = info.models[0]; save(); } else throw new Error('No model installed');
  }
  const r = await fetch(t.url.replace(/\/$/, '') + '/api/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: t.model, messages, stream: true, options: { temperature: 0.3, num_predict: isNative() ? 240 : 520 } }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  lastCut = false;
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      try { const j = JSON.parse(line); if (j.message && j.message.content) onChunk(j.message.content); if (j.done && j.done_reason === 'length') lastCut = true; } catch (e) {}
    }
  }
}
async function streamCloud(messages, onChunk, signal) {
  const id = S.tutor.provider, c = cloudCfg(id);
  if (!c.key) throw new Error('No API key');
  const r = await cloudFetch(id, '/chat/completions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: c.model, messages, stream: true, temperature: 0.4 }) });
  if (!r.ok) { let b = ''; try { b = (await r.text()).slice(0, 160); } catch (e) { /* ignore */ } throw new Error('HTTP ' + r.status + (b ? ' ' + b : '')); }
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (d === '[DONE]') return;
      try { const j = JSON.parse(d), c0 = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c0) onChunk(c0); } catch (e) { /* skip */ }
    }
  }
}
async function fetchOllamaModels() {
  const r = await fetch(S.tutor.url.replace(/\/$/, '') + '/api/tags');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return { models: (j.models || []).map((m) => m.name) };
}
async function checkOllama() {
  const st = $('#ol-status'), sel = $('#ol-model');
  st.textContent = 'Checking...';
  try {
    const info = await fetchOllamaModels();
    if (!info.models.length) { st.textContent = 'Connected, but no models are installed. Run: ollama pull llama3.2:3b'; return; }
    ollamaModels = info.models;
    if (!info.models.includes(S.tutor.model)) S.tutor.model = info.models[0];
    if (sel) sel.innerHTML = info.models.map((m) => `<option value="${esc(m)}" ${m === S.tutor.model ? 'selected' : ''}>${esc(m)}</option>`).join('');
    st.textContent = `Connected. ${info.models.length} model${info.models.length > 1 ? 's' : ''} found.`; save();
  } catch (e) {
    st.textContent = 'Could not connect. Make sure Ollama is running. If you opened the app by double-clicking, see the note below.';
  }
}


/* ---------------- Desktop launcher (setup and updates) ---------------- */
let DESK = null, setupOpen = false, setupPoll = 0;
async function studio(path, opts) { const r = await fetch('/__studio/' + path, opts); return r.json(); }
function setupCardHtml(st) {
  if (window.KVOffline) return window.KVOffline.card(st);
  const j = st.job || {};
  if (j.running) return `<h3>Setting up your tutor</h3><p class="help">${esc(j.msg || 'Working...')}</p><div class="bar" role="progressbar" aria-valuenow="${j.pct || 0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${j.pct || 0}%"></i></div><p class="help">You can keep reading while this runs. It continues if you close this box.</p>`;
  if (j.error) return `<h3>Setup stopped</h3><p class="help">${esc(j.error)}</p><div class="row-actions"><button class="btn primary" data-act="setup">Try again</button></div>`;
  if (st.ready) return `<h3>Your tutor is ready</h3><p class="help">Using <b>${esc(S.tutor.model || st.pick)}</b> on this laptop. It works offline.</p><div class="row-actions"><button class="btn" data-act="setupcheck">Check again</button></div>`;
  let why, btn;
  if (!st.installed) { why = 'Ollama, the engine that runs the tutor on your laptop, is not installed yet. Setup downloads it (roughly 1 GB) and then a small tutor model (about 2 GB). You need internet for this once. After that the tutor works offline.'; btn = 'Set up my tutor'; }
  else if (!st.running) { why = 'Ollama is installed but not running. Setup will start it for you.'; btn = 'Start my tutor'; }
  else { why = 'Ollama is running but no tutor model is downloaded yet. Setup will download one (about 2 GB, once).'; btn = 'Download the tutor model'; }
  return `<h3>Set up your tutor</h3><p class="help">${why}</p><div class="row-actions"><button class="btn primary" data-act="setup">${btn}</button>${st.windows && !st.installed ? '<a class="btn" href="https://ollama.com/download" target="_blank" rel="noopener">Install by hand instead</a>' : ''}</div>`;
}
function renderSetup() {
  if (!DESK) return;
  const slot = $('#setup-slot'); if (slot) slot.innerHTML = setupCardHtml(DESK);
  const oslot = $('#ob-setup-slot'); if (oslot) oslot.innerHTML = setupCardHtml(DESK);
  obTutorUpdate();
  let ov = $('#setup-ov');
  if (setupOpen) {
    if (!ov) { ov = document.createElement('div'); ov.id = 'setup-ov'; ov.className = 'ov'; document.body.appendChild(ov); }
    ov.innerHTML = `<div class="ov-card pn-strong" role="dialog" aria-modal="true" aria-label="Set up your tutor">${setupCardHtml(DESK)}<div class="row-actions"><button class="btn sm" data-act="setupskip">${DESK.ready ? 'Close' : 'Not now'}</button></div></div>`;
  } else if (ov) ov.remove();
}
async function refreshDesk() {
  try {
    const st = await studio('status'); if (!st.ok) return;
    const wasRunning = DESK && DESK.job && DESK.job.running;
    DESK = st; APP_VERSION = st.version || APP_VERSION;
    if (st.pick && (!S.tutor.model || !st.models.includes(S.tutor.model))) { S.tutor.model = st.pick; save(); }
    if (st.ready && !Object.keys(S.tutor.clouds).some((k) => S.tutor.clouds[k] && S.tutor.clouds[k].ok)) { S.tutor.brain = 'local'; save(); }
    if (wasRunning && st.job && st.job.done) { toast('Your tutor is ready'); setTimeout(() => { setupOpen = false; renderSetup(); }, 1600); }
    renderSetup();
    clearTimeout(setupPoll);
    if (st.job && st.job.running || setupOpen) setupPoll = setTimeout(refreshDesk, 900);
  } catch (e) { /* launcher gone */ }
}
async function installUpdate(file) {
  if (!file || !/\.zip$/i.test(file.name)) { toast('Choose the update .zip file'); return; }
  toast('Installing update...');
  try {
    const r = await (await fetch('/__studio/update', { method: 'POST', body: file })).json();
    if (!r.ok) { toast(r.error || 'Update failed'); return; }
    toast('Updated ' + r.from + ' to ' + r.to + '. Reloading...');
    setTimeout(() => location.reload(), 1300);
  } catch (e) { toast('Update failed'); }
}
async function initNative() {
  const D = window.KVDevice; if (!D || !D.native) return;
  S.tutor.url = location.origin + '/ollama';
  try {
    await D.refresh();
    ollamaModels = D.installedIds();
    if (ollamaModels.length && (!S.tutor.model || !ollamaModels.includes(S.tutor.model))) S.tutor.model = ollamaModels[0];
    save();
  } catch (e) { /* engine not reachable: cloud tutors still work */ }
}
async function initDesktop() {
  if (location.protocol !== 'http:' || !/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return;
  try {
    const st = await studio('status'); if (!st.ok) return;
    DESK = st; APP_VERSION = st.version || APP_VERSION;
    S.tutor.brain = S.tutor.brain || 'local';
    S.tutor.url = location.origin + '/ollama';
    if (st.pick && (!S.tutor.model || !st.models.includes(S.tutor.model))) S.tutor.model = st.pick;
    save();
    const hb = () => fetch('/__studio/hb').catch(() => {});
    hb(); setInterval(hb, 5000);
    window.addEventListener('pagehide', () => { try { navigator.sendBeacon('/__studio/bye'); } catch (e) {} });
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); installUpdate(f); } });
    if (S.onboarded && !st.ready && !st.job.running && !tutorReady()) { setupOpen = true; }
    renderSetup(); renderScreen();
    if (obActive() && OB[ob.step] === 'tutor') { const pn = $('#ob-tutor-panel'); if (pn) pn.innerHTML = obTutorPanel(); obTutorUpdate(); }
    if (setupOpen || (st.job && st.job.running)) refreshDesk();
  } catch (e) { /* normal browser or file: no launcher */ }
}


let lastBrain = null;
function afterTutorChange() {
  const was = lastBrain; lastBrain = S.tutor.brain;
  renderTutor(); const n = $('#tutor-now'); if (n) n.innerHTML = nowUsing(); obTutorUpdate();
  if (S.onboarded && was && was !== S.tutor.brain && !obActive()) { if (S.tutor.brain === 'local' && REG.hooks.offlineOn) REG.hooks.offlineOn(); else if (S.tutor.brain === 'cloud' && REG.hooks.offlineOff) REG.hooks.offlineOff(); }
}
async function permStatus() {
  const el = $('#perm-storage'); if (!el) return;
  try {
    if (!(navigator.storage && navigator.storage.persisted)) { el.textContent = 'This browser cannot protect saved progress. It is still saved on this device.'; return; }
    const pr = await navigator.storage.persisted();
    el.textContent = pr ? 'Protected. Your browser will not clear your progress automatically.' : 'Not protected yet. Your browser may clear saved progress if storage runs low.';
  } catch (e) { el.textContent = 'Could not check.'; }
}
/* ---------------- Onboarding ---------------- */
const OB = ['splash', 'v1', 'v2', 'v3', 'v4', 'v5', 'theme', 'check', 'tutor', 'ready'];
const ob = { step: 0, replay: false, tab: null, checks: null, rec: null, online: true, dev: null, running: false, done: false, verdict: null, limited: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNative = () => !!(window.KVDevice && window.KVDevice.native);
const isDeskOrigin = () => location.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
const obActive = () => !!$('#ob');
function obEl() { let el = $('#ob'); if (!el) { el = document.createElement('div'); el.id = 'ob'; el.className = 'ob'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Welcome to Knowvia'); document.body.appendChild(el); } return el; }
function obClose() { const el = $('#ob'); if (el) el.remove(); clearTimeout(ob.timer); }
function obOpen(step, replay) { ob.replay = !!replay; ob.step = step; ob.checks = null; ob.done = false; ob.running = false; ob.limited = false; obRender(); }
function obGo(n) { ob.step = Math.max(0, Math.min(OB.length - 1, n)); if (!ob.replay) { S.ob.step = ob.step; save(); } obRender(); }
function deviceInfo() {
  const cores = navigator.hardwareConcurrency || 2, mem = navigator.deviceMemory || null;
  const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (touch && window.innerWidth < 820);
  return { cores, mem, touch, phone };
}
const VALS = [
  { eye: 'Welcome', h: 'Learn anything, even with no internet.', p: 'Knowvia keeps your courses on your device. Study on a bus, in a power cut, or anywhere data is slow.', scene: 'offline' },
  { eye: 'Meet Amani', h: 'A study companion that reads along with you.', p: 'Amani sees the lesson you are on. Ask it to explain, give an example, or quiz you. It answers from your course, not from guesswork.', scene: 'amani' },
  { eye: 'Three ways to learn', h: 'Courses, your own sources, or build one.', p: 'Start with polished built-in courses, or have Amani build a whole course on any topic. Or add your own PDFs, links, notes and photos of pages, and learn from them step by step.', scene: 'ways' },
  { eye: 'Made for you', h: 'Three looks. One calm place to study.', p: 'Frost Glass, Soft Clay, or Charcoal and Gold. Choose the one that feels right, and change it any time.', scene: 'themes' },
  { eye: 'Private by design', h: 'Your progress stays on your device.', p: 'No account is needed to start. Knowvia asks for a permission only at the moment it needs it, and always tells you why.', scene: 'private' }
];
function obScene(k) {
  const t = resolvedTheme(), KV = window.KV;
  if (k === 'offline') return `<div class="ob-scene"><div class="orb pn-strong">${KV.flow(t, 110, { bare: true })}</div>
    <span class="chip pn-strong float-chip" style="left:4%;top:16%;animation-delay:-1s"><span class="dot"></span>Works offline</span>
    <span class="chip pn-strong float-chip" style="right:3%;bottom:14%;animation-delay:-3.2s">${ic(I.shield, 16, 2)}Private</span></div>`;
  if (k === 'amani') return `<div class="ob-scene"><div class="sc-amani"><div class="row"><span style="display:block;width:56px;height:56px;flex:none">${KV.amani(t, 56, { round: true })}</span><div class="bub pn-strong" style="--d:0">Hi, I'm Amani. What would you like to understand?</div></div>
    <div class="row me"><div class="bub" style="--d:1">Explain this in simpler words</div></div>
    <div class="row"><span style="display:block;width:56px;height:56px;flex:none;opacity:0"></span><div class="bub pn-strong" style="--d:2">Of course. Think of it like this...</div></div></div></div>`;
  if (k === 'ways') return `<div class="ob-scene" style="height:auto;padding:6px 0"><div style="display:flex;flex-direction:column;gap:12px;align-items:center;width:100%">
    <div class="way pn-strong" style="--d:0"><span class="ico">${ic(I.book, 22, 1.8)}</span><span><b>Built-in courses</b><span class="s">Ready to study, work offline</span></span></div>
    <div class="way pn-strong" style="--d:1"><span class="ico">${ic(I.upload, 22, 1.8)}</span><span><b>Your own sources</b><span class="s">PDFs, links and notes, taught step by step</span></span></div>
    <div class="way pn-strong" style="--d:2"><span class="ico">${ic(I.spark, 22, 1.8)}</span><span><b>Build a course</b><span class="s">Pick a topic, Amani builds it</span></span></div></div></div>`;
  if (k === 'themes') return `<div class="ob-scene" style="gap:18px">${[['frost-light', 0], ['clay', -1.6], ['gold', -3.2]].map(([n, dl]) => `<span style="display:block;width:92px;height:92px;animation:kvFloat 5s ease-in-out infinite;animation-delay:${dl}s;filter:drop-shadow(0 14px 18px rgba(40,40,80,.25))">${KV.flow(n, 92)}</span>`).join('')}</div>`;
  return `<div class="ob-scene"><div class="orb pn-strong"><span style="color:var(--accent-text);display:flex;width:60%;height:60%">${ic(I.lock, 80, 1.5)}</span></div>
    <span class="chip pn-strong float-chip" style="left:5%;top:18%;animation-delay:-2s">No sign-up needed</span>
    <span class="chip pn-strong float-chip" style="right:4%;bottom:14%;animation-delay:-.6s">You choose what to share</span></div>`;
}
function obThemeHtml() {
  const t = resolvedTheme(), KV = window.KV;
  return `<div class="themes ob-th">${themeCard('frost', 'Frost Glass', 'Airy and modern. Light and dark.')}${themeCard('clay', 'Soft Clay', 'Warm, soft and tactile.')}${themeCard('gold', 'Charcoal and Gold', 'Luxurious and bold.')}</div>
    ${S.theme === 'frost' ? `<div class="field"><label>Frost Glass mode</label>${seg('frostmode', S.frostMode, [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Automatic']])}</div>` : ''}
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px 16px;padding:14px 16px;border-radius:var(--r-md)" class="pn-strong"><span style="display:block;width:64px;height:64px;flex:none">${KV.flow(t, 64)}</span><span style="display:block;width:64px;height:64px;flex:none">${KV.amani(t, 64, { round: true })}</span><span class="help" style="margin:0;font-size:14.5px;line-height:1.5;color:var(--muted);flex:1 1 100%;min-width:0">Your app icon and Amani change with the look you pick.</span></div>`;
}
function obThemeUpdate() { const sl = $('#ob-theme-slot'); if (sl) { sl.innerHTML = obThemeHtml(); sl.classList.add('noanim'); } }
function crowInner(c) {
  const icon = c.state === 'ok' ? `<span class="st ok">${ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 18, 2.6)}</span>` : c.state === 'info' ? `<span class="st warn">${ic('<path d="M12 7.5v6M12 16.6v.4"/>', 18, 2.4)}</span>` : c.state === 'run' ? '<span class="st"><span class="spin"></span></span>' : '<span class="st warn" style="opacity:.35"></span>';
  return icon + `<span><b>${esc(c.label)}</b><span class="s">${esc(c.detail || (c.state === 'run' ? 'Checking...' : 'Waiting'))}</span></span>`;
}
function obCheckRow(i) { const r = document.getElementById('crow-' + i); if (r) r.innerHTML = crowInner(ob.checks[i]); }
function obVerdictHtml() {
  const d = ob.dev || deviceInfo(), hasEngine = !!DESK;
  let rec = 'cloud', title = 'A cloud tutor is the quickest start', text = '';
  if (!hasEngine) text = d.phone ? 'Phones answer best with a cloud tutor. It is fast and uses very little battery. Free options are ready for you on the next screen.' + (isNative() ? ' You can also add a small offline tutor later, in Me.' : '') : 'The offline tutor engine comes with the Knowvia desktop app. In this browser, a cloud tutor is the quickest way to start, and free options are ready on the next screen.';
  else if (!ob.online) { rec = 'local'; title = 'Set up the offline tutor'; text = 'You look offline right now, so the offline tutor is the one to set up first. It works with no internet once it is installed.'; }
  else if (d.cores >= 8) { rec = 'local'; title = 'Your device can run the offline tutor well'; text = 'You can set up the offline tutor and keep everything on your device. A cloud tutor is also available if you want stronger answers.'; }
  else text = 'Your laptop can run an offline tutor, but small models answer slowly on a processor like this. A free cloud tutor will feel much faster. You can set up the offline one too, so Amani still works with no internet.';
  ob.rec = rec; if (!ob.tab) ob.tab = rec;
  return `<div class="verdict pn-strong"><p class="eyebrow">Our recommendation</p><h3>${title}</h3><p>${text}</p></div>`;
}
async function obRunChecks() {
  if (ob.running) return; ob.running = true; ob.done = false;
  const dev = ob.dev = deviceInfo();
  const defs = [
    ['Your device', async () => ({ ok: true, detail: `${dev.phone ? 'Phone or tablet' : 'Computer'} · ${dev.cores} processor threads${dev.mem ? ' · about ' + dev.mem + ' GB memory' : ''}` })],
    ['Screen and controls', async () => ({ ok: true, detail: `${window.innerWidth} × ${window.innerHeight} · ${dev.touch ? 'Touch screen' : 'Keyboard and mouse'}` })],
    ['Saving your progress', async () => {
      try { localStorage.setItem('kv.t', '1'); localStorage.removeItem('kv.t'); } catch (e) { return { ok: false, detail: 'This browser blocks saving, so progress will not be kept after you close it.' }; }
      let persisted = false;
      try { if (navigator.storage && navigator.storage.persist) { persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } } catch (e) { /* ignore */ }
      return { ok: true, detail: persisted ? 'Saved on this device and protected from automatic clean-up.' : 'Saved on this device. Your browser may clear it if storage runs low.' };
    }],
    ['Internet', async () => {
      try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 6000); const r = await fetch('https://openrouter.ai/api/v1/models', { signal: ac.signal }); clearTimeout(tm); if (r.ok) { ob.online = true; return { ok: true, detail: 'Online. Cloud tutors can work.' }; } } catch (e) { /* fall through */ }
      ob.online = false; return { ok: false, detail: navigator.onLine ? 'Could not reach the internet check. Cloud tutors may not work right now.' : 'No internet right now. The offline tutor still works.' };
    }],
    ['Offline tutor engine', async () => {
      if (isDeskOrigin() && !DESK) { try { const st = await studio('status'); if (st.ok) DESK = st; } catch (e) { /* ignore */ } }
      if (DESK) { try { const st = await studio('status'); if (st.ok) DESK = st; } catch (e) { /* ignore */ }
        return DESK.ready ? { ok: true, detail: 'Ready. ' + (DESK.models[0] || '') + ' is installed.' } : { ok: false, detail: DESK.installed ? 'Ollama is installed. Knowvia will start it and add a model for you.' : 'Not installed yet. Knowvia can install it for you.' }; }
      return { ok: false, detail: 'Comes with the Knowvia desktop app. Not available in this browser.' };
    }]
  ];
  ob.checks = defs.map((d) => ({ label: d[0], state: 'wait', detail: '' }));
  obRender();
  for (let i = 0; i < defs.length; i++) {
    ob.checks[i].state = 'run'; obCheckRow(i);
    const t0 = Date.now(); let r;
    try { r = await defs[i][1](); } catch (e) { r = { ok: false, detail: 'Could not check this.' }; }
    await sleep(Math.max(0, 640 - (Date.now() - t0)));
    ob.checks[i].state = r.ok ? 'ok' : 'info'; ob.checks[i].detail = r.detail; obCheckRow(i);
  }
  ob.running = false; ob.done = true;
  if (OB[ob.step] === 'check') { const v = $('#ob-verdict'); if (v) { v.innerHTML = obVerdictHtml(); setTimeout(() => { try { v.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ } }, 120); } const b = $('#ob-next'); if (b) b.disabled = false; }
}
function obTutorTop() {
  const rec = ob.rec || 'cloud', tab = ob.tab || rec;
  const locOk = !!(DESK && DESK.ready && localModelList().length), cloudOk = Object.keys(S.tutor.clouds).some((k) => S.tutor.clouds[k] && S.tutor.clouds[k].ok);
  const card = (k, ico, t, d, ok) => `<button class="optcard" data-act="obtab" data-k="${k}" aria-pressed="${tab === k}"><span class="ico">${ic(ico, 22, 1.8)}</span><span><b>${t}${rec === k ? '<span class="badge">Recommended</span>' : ''}${ok ? '<span class="badge ok">Ready</span>' : ''}</b><span class="s">${d}</span></span></button>`;
  return `<div class="opts2">${card('cloud', I.cloud, 'Cloud tutor', 'Smartest answers, fast, your full Amani voice, and it builds courses. Needs internet. Free options available.', cloudOk)}${card('local', I.laptop, 'Offline tutor', 'Private, works with no internet. Slower, simpler answers in the default Amani voice. Chat only.', locOk)}</div>`;
}
function obTutorPanel() {
  const tab = ob.tab || ob.rec || 'cloud';
  if (tab === 'cloud') return `<div class="panelbox pn-strong"><h3>Set up a cloud tutor</h3><div class="clouds-slot">${cloudListHtml()}</div></div>`;
  if (DESK) return `<div class="panelbox pn-strong"><h3>Set up the offline tutor</h3><div id="ob-setup-slot">${setupCardHtml(DESK)}</div><p class="help">Knowvia asks before it downloads anything. You can keep this window open while it works.</p></div>`;
  return `<div class="panelbox pn-strong"><h3>The offline tutor needs the desktop app</h3><p class="help">This browser version cannot install or start the offline engine. Open Knowvia from the desktop icon on your laptop to set it up there. Meanwhile, a cloud tutor works right here.</p><div class="row-actions"><button class="btn primary" data-act="obtab" data-k="cloud">Set up a cloud tutor</button></div></div>`;
}
function obTutorUpdate() {
  if (OB[ob.step] !== 'tutor') return;
  const top = $('#ob-tutor-top'); if (top) top.innerHTML = obTutorTop();
  const b = $('#ob-next'); if (b) b.disabled = !(tutorReady() || ob.replay || ob.limited);
  const n = $('#ob-ready-note'); if (n) n.innerHTML = tutorReady() ? 'Great. ' + nowUsing() : 'Set up at least one tutor to continue. You can add the other later.';
}
function obRender() {
  const el = obEl(), id = OB[ob.step]; clearTimeout(ob.timer);
  const KV = window.KV, t = resolvedTheme();
  const top = id === 'splash' ? '' : `<div class="ob-top"><div class="ob-dots" aria-hidden="true">${OB.slice(1).map((x, i) => `<i class="${i + 1 === ob.step ? 'on' : ''}"></i>`).join('')}</div>${ob.step >= 1 && ob.step <= 5 ? '<button class="ob-skip" data-act="obtour">Skip tour</button>' : (ob.replay ? '<button class="ob-skip" data-act="obexit">Close</button>' : '<span></span>')}</div>`;
  let body = '', foot = '';
  const nav = (next, label, dis) => `<div class="ob-foot"><button class="btn" data-act="obback" ${ob.step <= 1 ? 'style="visibility:hidden"' : ''}>Back</button><button class="btn primary" id="ob-next" data-act="${next}" ${dis ? 'disabled' : ''}>${label}</button></div>`;
  if (id === 'splash') {
    body = `<div class="ob-body splash" data-act="obnext" id="ob-body"><div class="mk">${KV.flow(t, 132)}</div><div class="wm" aria-label="Knowvia">${'Knowvia'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div><div class="tg">A path to knowing</div></div>`;
    ob.timer = setTimeout(() => { if (OB[ob.step] === 'splash' && obActive()) obGo(1); }, 4300);
  } else if (/^v\d$/.test(id)) {
    const v = VALS[+id[1] - 1];
    body = `<div class="ob-body" id="ob-body"><div class="ob-wrap"><div class="kv-in">${obScene(v.scene)}</div><p class="eyebrow kv-in" style="--d:1">${v.eye}</p><h1 class="kv-in" style="--d:2">${v.h}</h1><p class="lede kv-in" style="--d:3">${v.p}</p></div></div>`;
    foot = nav('obnext', ob.step === 5 ? 'Choose your look' : 'Next');
  } else if (id === 'theme') {
    body = `<div class="ob-body" id="ob-body"><div class="ob-wrap wide"><p class="eyebrow kv-in">Your look</p><h2 class="kv-in" style="--d:1">Choose how Knowvia feels.</h2><div id="ob-theme-slot" class="kv-in" style="--d:2;display:flex;flex-direction:column;gap:16px">${obThemeHtml()}</div></div></div>`;
    foot = nav('obnext', 'Continue');
  } else if (id === 'check') {
    const rows = (ob.checks || []).map((c, i) => `<div class="crow pn-strong" id="crow-${i}" style="--d:${i}">${crowInner(c)}</div>`).join('');
    body = `<div class="ob-body" id="ob-body"><div class="ob-wrap"><p class="eyebrow kv-in">System check</p><h2 class="kv-in" style="--d:1">Checking what your device can do.</h2><p class="lede kv-in" style="--d:2">This takes a few seconds. Nothing is installed or changed.</p><div class="checks">${rows}</div><div id="ob-verdict">${ob.done ? obVerdictHtml() : ''}</div></div></div>`;
    foot = nav('obnext', 'Continue', !ob.done);
    if (!ob.checks) setTimeout(obRunChecks, 400);
  } else if (id === 'tutor') {
    if (!ob.rec) obVerdictHtml();
    const limited = !ob.online && !DESK;
    body = `<div class="ob-body" id="ob-body"><div class="ob-wrap wide"><p class="eyebrow kv-in">Your tutor</p><h2 class="kv-in" style="--d:1">Set up Amani's brain.</h2><p class="lede kv-in" style="--d:2">Amani needs a model to think with. Set up at least one. You can add the other any time in Me.</p>
      <div id="ob-tutor-top">${obTutorTop()}</div><div id="ob-tutor-panel">${obTutorPanel()}</div>
      ${limited ? `<div class="verdict pn-strong"><h3>No internet and no offline engine</h3><p>That means no tutor can run right now. You can still read lessons and use flashcards, and Amani will be waiting once you are online.</p><div class="row-actions"><button class="btn" data-act="oblimited">Continue without a tutor for now</button></div></div>` : ''}
      <p class="ob-note" id="ob-ready-note">${tutorReady() ? 'Great. ' + nowUsing() : 'Set up at least one tutor to continue. You can add the other later.'}</p></div></div>`;
    foot = nav('obnext', 'Continue', !(tutorReady() || ob.replay || ob.limited));
  } else {
    body = `<div class="ob-body" id="ob-body"><div class="ob-wrap" style="align-items:flex-start"><div class="kv-in" style="width:112px;height:112px;animation-name:kvPop">${KV.amani(t, 112, { round: true })}</div><p class="eyebrow kv-in" style="--d:1">You are all set</p><h1 class="kv-in" style="--d:2">Meet Amani, your study companion.</h1><p class="lede kv-in" style="--d:3">I will be beside every lesson. Ask me to explain, to give an example, or to test you.</p>
      <div class="field kv-in" style="--d:4;width:100%"><label for="ob-name">What should I call you?</label><input id="ob-name" maxlength="24" value="${esc(S.name || '')}" placeholder="Your first name" autocomplete="given-name"></div><p class="ob-note kv-in" style="--d:5;text-align:left">${nowUsing()}</p></div></div>`;
    foot = nav('obfinish', ob.replay ? 'Back to Knowvia' : 'Open Knowvia');
  }
  el.innerHTML = top + body + foot;
  renderBrand();
  const b = $('#ob-body'); if (b) b.scrollTop = 0;
}

/* ---------------- Events ---------------- */
document.addEventListener('click', (ev) => {
  if (mdlOpen && !ev.target.closest('.mdl-menu') && !ev.target.closest('.mdl-btn')) { mdlOpen = false; renderTutor(); }
  const t = ev.target.closest('[data-act], #scrim');
  if (!t) return;
  if (t.id === 'scrim') { tutorOpen = false; tutorFull = false; renderTutor(); renderTop(); return; }
  const a = t.dataset.act, d = t.dataset;
  switch (a) {
    case 'setup': studio('setup', { method: 'POST', body: JSON.stringify({ model: (DESK && DESK.defaultModel) || '' }) }).then((st) => { DESK = st; renderSetup(); refreshDesk(); }); break;
    case 'setupcheck': refreshDesk(); break;
    case 'setupskip': setupOpen = false; renderSetup(); break;
    case 'setupopen': setupOpen = true; renderSetup(); refreshDesk(); break;
    case 'nav': go(d.r); break;
    case 'obnext': obGo(ob.step + 1); break;
    case 'obback': obGo(ob.step - 1); break;
    case 'obtour': obGo(6); break;
    case 'obexit': obClose(); break;
    case 'obtab': { ob.tab = d.k; const a = $('#ob-tutor-top'), b = $('#ob-tutor-panel'); if (a) a.innerHTML = obTutorTop(); if (b) b.innerHTML = obTutorPanel(); break; }
    case 'oblimited': ob.limited = true; obTutorUpdate(); toast('You can set up a tutor later in Me'); break;
    case 'obfinish': {
      const nm = ($('#ob-name') || {}).value; if (nm !== undefined) S.name = nm.trim();
      if (!ob.replay) { S.onboarded = true; S.ob.step = 0; }
      save(); obClose(); FACTS = null; go('home'); break;
    }
    case 'tour': obOpen(1, true); break;
    case 'cloudopen': cloudOpen = cloudOpen === d.p ? '' : d.p; refreshCloudSlots(); break;
    case 'ckeypaste': { try { navigator.clipboard.readText().then((t) => { const k = document.getElementById('k-' + d.p); t = String(t || '').trim(); if (!t) { toast('Nothing copied yet. Copy the key first.'); return; } cloudCfg(d.p).key = t; if (k) k.value = t; save(); toast('Pasted. Now tap Connect.'); }).catch(() => toast('Press and hold in the key box, then choose Paste.')); } catch (e) { toast('Press and hold in the key box, then choose Paste.'); } break; }
    case 'cloudconnect': { const k = document.getElementById('k-' + d.p); if (k) cloudCfg(d.p).key = k.value.trim(); save(); connectCloud(d.p); break; }
    case 'mdl': mdlOpen = !mdlOpen; renderTutor(); if (mdlOpen) loadMenuModels(); break;
    case 'tocloud': { const bc = bestCloud(); if (!bc) { go('me'); break; } S.tutor.brain = 'cloud'; S.tutor.provider = bc.p; save(); afterTutorChange(); toast('Amani is back on a cloud model'); break; }
    case 'pickmodel': {
      if (d.k === 'local') { S.tutor.brain = 'local'; S.tutor.model = d.m; }
      else { S.tutor.brain = 'cloud'; S.tutor.provider = d.p; cloudCfg(d.p).model = d.m; }
      mdlOpen = false; save(); afterTutorChange(); toast('Amani now uses ' + d.m); break;
    }
    case 'askamani': {
      tutorOpen = true; renderTop(); renderTutor();
      if (d.q) askTutor('Tell me more: ' + d.q.slice(0, 110), 'Explain this idea simply and give one short example: ' + d.q);
      else { const i = $('#tin'); if (i) i.focus(); }
      break;
    }
    case 'soon': { const x = SOON[d.k]; if (x) showOv(`<h3>${esc(x[0])}</h3><p class="help">${esc(x[1])}</p><p class="help"><b>${esc(x[2])}</b></p>`); break; }
    case 'ovclose': { const ov = $('#info-ov'); if (ov) ov.remove(); break; }
    case 'persist': { try { navigator.storage.persist().then(() => permStatus()); } catch (e) { permStatus(); } break; }
    case 'back': goBack(); break;
    case 'lesson': if (d.resume) window.__resume = true; go('lesson/' + d.id); break;
    case 'openpack': S.activePack = d.id; save(); go('learn'); break;
    case 'finish': {
      const pr = prog(); pr.lessons[d.id] = Object.assign(pr.lessons[d.id] || {}, { done: true, scroll: 1 }); save();
      if (d.next) go('lesson/' + d.next); else { toast('Pack finished. Well done.'); go('progress'); }
      break;
    }
    case 'answer': {
      const q = qById(d.q), pr = prog();
      if (pr.answers[q.id] !== undefined) return;
      pr.answers[q.id] = d.o; save();
      const card = t.closest('[data-qcard]'); card.outerHTML = checkHtml(q, ($('.lbl', card) || {}).textContent);
      break;
    }
    case 'retry': {
      const q = qById(d.q), pr = prog(); delete pr.answers[q.id]; save();
      const card = t.closest('[data-qcard]'); const lab = ($('.lbl', card) || {}).textContent; card.outerHTML = checkHtml(q, lab);
      break;
    }
    case 'size': {
      if (d.d === 'cycle') S.size = (S.size + 1) % 3; else S.size = Math.max(0, Math.min(2, S.size + Number(d.d)));
      save(); applyTheme(); break;
    }
    case 'sizeset': S.size = Number(d.v); save(); applyTheme(); renderScreen(); break;
    case 'tutor': tutorOpen = !tutorOpen; if (!tutorOpen) tutorFull = false; renderTop(); renderTutor(); break;
    case 'tfull': setFull(!tutorFull); break;
    case 'qtoggle': setChips(!chipsOpen); break;
    case 'unattach': attached = ''; renderTutor(); setTimeout(() => { const i = $('#tin'); if (i) i.focus({ preventScroll: true }); }, 30); break;
    case 'brain': S.tutor.brain = d.v; save(); renderTutor(); if (route.name === 'me') renderScreen(); break;
    case 'quick': { const q = QUICK[d.k]; askTutor(q[0], q[1]); break; }
    case 'chip': {
      const tx = d.t, home = tutorContext() && tutorContext().home;
      if (QUIZ_RE.test(tx)) { const q = home ? QUICK.quizhome : QUICK.quiz; askTutor(tx, q[1]); }
      else if (CHIP_MAP[tx]) { const q = QUICK[CHIP_MAP[tx]]; askTutor(q[0], q[1]); }
      else if (/^[A-C]$/.test(tx)) askTutor(tx, 'My answer is ' + tx + '. Tell me if I am right, and explain briefly.');
      else askTutor(tx, tx);
      break;
    }
    case 'retryask': { const msgs = chat(), i = msgs.findIndex((m) => m.err); if (i < 0) break; const r = msgs[i].retry || {}; msgs.splice(Math.max(0, i - 1), 2); renderTutor(); askTutor(r.shown || '', r.prompt || r.shown || '', r.quote); break; }
    case 'errdismiss': { clearErrors(chat()); save(); renderTutor(); break; }
    case 'useoffline': if (REG.hooks.switchOffline) REG.hooks.switchOffline(); break;
    case 'listen': speak(+d.i); break;
    case 'keysoff': S.hints.keysUntil = Date.now() + 3 * 86400000; save(); renderScreen(); break;
    case 'nudgeoff': S.hints.offlineUntil = Date.now() + 7 * 86400000; save(); renderScreen(); break;
    case 'freshask': t.outerHTML = '<span class="help">This erases your progress, your name, your chosen look and any saved API keys on this device, then shows the welcome again. Courses you built stay. </span><button class="btn" data-act="freshyes">Yes, start fresh</button> <button class="btn" data-act="nav" data-r="me">Cancel</button>'; break;
    case 'freshyes': try { localStorage.removeItem(KEY); } catch (e) {} S = defaults(); window.__fresh = true; location.hash = ''; location.reload(); break;
    case 'stop': if (ctrl) ctrl.abort(); break;
    case 'theme': S.theme = d.t; save(); applyTheme(); renderScreen(); if (obActive()) obThemeUpdate(); break;
    case 'frostmode': S.frostMode = d.v; save(); applyTheme(); renderScreen(); if (obActive()) obThemeUpdate(); break;
    case 'reduce': S.reduce = d.v; save(); applyTheme(); renderScreen(); break;
    case 'checkollama': checkOllama(); break;
    case 'flip': cardRun.flip = !cardRun.flip; renderScreen(); break;
    case 'rate': {
      const r = cardRun, c = r.deck[r.i], pr = prog(), days = [0, 1, 3, 7, 14], cur = (pr.cards[c.id] || { box: 0 }).box;
      const box = d.v === 'good' ? Math.min(5, cur + 1) : 1;
      pr.cards[c.id] = { box, due: d.v === 'good' ? Date.now() + (days[Math.min(box - 1, 4)] || 0) * 86400000 : Date.now() };
      if (d.v === 'good') r.good++;
      r.i++; r.flip = false; save(); renderScreen(); break;
    }
    case 'resetask': t.outerHTML = '<span class="help">This clears lessons, answers and flashcards. </span><button class="btn" data-act="resetyes">Yes, reset</button> <button class="btn" data-act="nav" data-r="me">Cancel</button>'; break;
    case 'resetyes': S.progress = {}; S.chats = {}; save(); cardRun = null; toast('Progress reset'); go('learn'); break;
    default: if (REG.acts[a]) REG.acts[a](t, d, ev);
  }
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.act === 'night') { S.night = t.checked; save(); applyTheme(); return; }
  const k = t.dataset.in; if (!k) return;
  const pid = t.dataset.p;
  if (REG.ins[k]) { REG.ins[k](t, pid); save(); return; }
  if (k === 'url') S.tutor.url = t.value.trim();
  if (k === 'updfile') { installUpdate(t.files && t.files[0]); return; }
  if (k === 'model') { S.tutor.model = t.value; S.tutor.brain = 'local'; afterTutorChange(); }
  if (k === 'ckey' && pid) { const c = cloudCfg(pid); if (c.key !== t.value.trim()) { c.key = t.value.trim(); c.ok = false; delete cloudStatus[pid]; } }
  if (k === 'cbase' && pid) cloudCfg(pid).base = t.value.trim();
  if ((k === 'cmodel' || k === 'cmodeltxt') && pid) { cloudCfg(pid).model = t.value.trim(); if (cloudCfg(pid).ok) { S.tutor.provider = pid; S.tutor.brain = 'cloud'; afterTutorChange(); } }
  if (k === 'myname') S.name = t.value.trim();
  save();
});
document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'tform') return;
  ev.preventDefault();
  const i = $('#tin'); let v = i.value.trim(); const q = attached;
  if (!v && !q) return;
  if (!v) v = 'Explain this simply';
  i.value = ''; attached = '';
  i.blur(); /* close the keyboard so the answer and the new suggestions are fully visible */
  askTutor(v, v, q);
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && tutorFull) { setFull(false); return; } if (ev.key === 'Escape' && tutorOpen && route.name === 'lesson' && window.innerWidth < 1180) { tutorOpen = false; renderTutor(); renderTop(); } });
document.addEventListener('scroll', (ev) => { if (ev.target && ev.target.id === 'scroll') onScroll(); }, true);
let rz = 0, lastW = window.innerWidth;
/* A phone keyboard only changes the height. Rebuilding the chat then would drop the text box and close the keyboard, so only a real width change redraws. */
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; renderTop(); renderTutor(); }, 120);
});
/* While typing on a phone, give the chat the room: hide the status lines and fold the suggestions. */
document.addEventListener('focusin', (e) => { if (e.target && e.target.id === 'tin') { document.body.classList.add('kb-typing'); const t = $('#tutor'); if (t) t.classList.add('typing'); setTimeout(() => { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; }, 250); } });
document.addEventListener('focusout', (e) => { if (e.target && e.target.id === 'tin') { document.body.classList.remove('kb-typing'); const t = $('#tutor'); if (t) t.classList.remove('typing'); } });

/* ---------------- Select text: a small action pop-up (lessons and Amani's answers) ---------------- */
const SEL = { t: 0, txt: '' };
function selInfo() {
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const txt = sel.toString().replace(/\s+/g, ' ').trim();
  if (txt.length < 2) return null;
  const r = sel.getRangeAt(0), n = r.commonAncestorContainer, el = n.nodeType === 1 ? n : n.parentElement;
  if (!el || !el.closest || !el.closest('.prose, #msgs .bubble.bot')) return null;
  if (el.closest('input,textarea,button,.selpop')) return null;
  return { txt, rect: r.getBoundingClientRect() };
}
function selHide() { const p = $('#selpop'); if (p) p.remove(); SEL.txt = ''; }
function selShow() {
  const info = selInfo(); if (!info) { selHide(); return; }
  const { txt, rect } = info; if (rect.width === 0 && rect.height === 0) return;
  SEL.txt = txt;
  let p = $('#selpop');
  const lesson = !!$('#scroll .prose');
  const btn = (a, ico, label, extra) => `<button type="button" class="sp-b ${extra || ''}" data-sel="${a}" aria-label="${label}" title="${label}">${ic(ico, 18, 1.9)}<span>${label}</span></button>`;
  const html = btn('ask', I.chat, 'Ask Amani', 'main') + btn('simple', I.bulb, 'Explain simply') + btn('copy', I.copy, 'Copy') + (canSpeakNow() ? (lesson && REG.hooks.listenFrom ? btn('from', I.speaker, 'Listen from here') : '') + btn('listen', I.speaker, 'Listen') : '');
  if (!p) { p = document.createElement('div'); p.id = 'selpop'; p.className = 'selpop'; p.setAttribute('role', 'toolbar'); p.setAttribute('aria-label', 'Actions for the selected text'); document.body.appendChild(p); }
  p.innerHTML = html;
  const w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, touch = matchMedia('(pointer:coarse)').matches;
  let top = touch ? rect.bottom + 18 : rect.top - h - 12, below = touch;
  if (top < 8) { top = rect.bottom + 12; below = true; }
  if (top + h > window.innerHeight - 8) { top = Math.max(8, rect.top - h - 12); below = false; }
  let left = rect.left + rect.width / 2 - w / 2; left = Math.max(8, Math.min(vw - w - 8, left));
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.classList.toggle('below', below); p.classList.add('on');
  void lesson;
}
document.addEventListener('selectionchange', () => { clearTimeout(SEL.t); SEL.t = setTimeout(selShow, 260); });
document.addEventListener('mouseup', () => { clearTimeout(SEL.t); SEL.t = setTimeout(selShow, 30); });
['mousedown', 'pointerdown'].forEach((e) => document.addEventListener(e, (ev) => { if (ev.target.closest && ev.target.closest('#selpop')) ev.preventDefault(); }, true));
document.addEventListener('scroll', (ev) => { if (ev.target && (ev.target.id === 'scroll' || ev.target.id === 'msgs')) selHide(); }, true);
document.addEventListener('click', (ev) => {
  const b = ev.target.closest && ev.target.closest('[data-sel]'); if (!b) return;
  const txt = SEL.txt, a = b.dataset.sel; if (!txt) return;
  const done = () => { try { window.getSelection().removeAllRanges(); } catch (e) {} selHide(); };
  if (a === 'ask') { done(); attachText(txt); }
  else if (a === 'simple') { done(); tutorOpen = true; attached = ''; renderTop(); renderTutor(); askTutor('Explain this simply', 'Explain this passage in simple words, then give one short example.', txt.slice(0, 1200)); }
  else if (a === 'copy') {
    const ok = () => { toast('Copied'); done(); };
    try { navigator.clipboard.writeText(txt).then(ok, () => { fallbackCopy(txt); ok(); }); } catch (e) { fallbackCopy(txt); ok(); }
  }
  else if (a === 'from') { try { if (REG.hooks.listenFrom) REG.hooks.listenFrom(); } catch (e) { toast('Could not start from there'); } done(); }
  else if (a === 'listen') {
    try { stopSpeak(); if (REG.hooks.speakText) { if (!REG.hooks.speakText(txt, { key: 'sel', title: 'Selected text' })) toast('No voice is ready. Open Me, then Voice.'); } else { const u = new SpeechSynthesisUtterance(txt); const v = speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang)); if (v) u.voice = v; u.rate = 0.95; speechSynthesis.speak(u); } } catch (e) {}
    done();
  }
});
REG.acts['copy-code'] = (t) => {
  const f = t.closest('figure.code'), c = f && f.querySelector('code'); if (!c) return; const txt = c.textContent;
  const ok = () => { toast('Code copied'); t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy'; }, 1600); };
  try { navigator.clipboard.writeText(txt).then(ok, () => { fallbackCopy(txt); ok(); }); } catch (e) { fallbackCopy(txt); ok(); }
};
function fallbackCopy(t) { const x = document.createElement('textarea'); x.value = t; x.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove(); }
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('#selpop')) { selHide(); } });

/* ---------------- One-shot model call (used by Build a course) ---------------- */
async function llm(messages, o) {
  o = o || {};
  const sel = o.model || { k: S.tutor.brain === 'local' ? 'local' : 'cloud', p: S.tutor.provider, m: activeModelName() };
  const sig = o.signal;
  if (sel.k === 'local') {
    const r = await fetch(S.tutor.url.replace(/\/$/, '') + '/api/chat', { method: 'POST', signal: sig, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: sel.m || S.tutor.model, messages, stream: false, options: { temperature: o.temp === undefined ? 0.5 : o.temp, num_predict: o.max || 3000 } }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); return (j.message && j.message.content) || '';
  }
  const c = cloudCfg(sel.p);
  const body = { model: sel.m || c.model, messages, temperature: o.temp === undefined ? 0.5 : o.temp, stream: false };
  if (o.max) body.max_tokens = o.max;
  if (o.fast && /gpt-oss|gemini-(2\.5|3)/i.test(String(body.model))) body.reasoning_effort = 'low';
  const post = () => cloudFetch(sel.p, '/chat/completions', { method: 'POST', signal: sig, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let r = await post();
  if (!r.ok && r.status === 400 && body.reasoning_effort) { let t0 = ''; try { t0 = await r.clone().text(); } catch (e) { /* ignore */ } if (/reasoning|unknown|unrecognized|unsupported/i.test(t0)) { delete body.reasoning_effort; r = await post(); } }
  if (!r.ok) { let b = ''; try { b = (await r.text()).slice(0, 420); } catch (e) { /* ignore */ } throw new Error('HTTP ' + r.status + (b ? ' ' + b : '')); }
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}
function switchToOffline(auto) {
  const loc = localModelList(); if (!loc.length) return false;
  if (auto) S.tutor.prev = { provider: S.tutor.provider, model: cloudCfg(S.tutor.provider).model };
  S.tutor.brain = 'local'; if (!loc.includes(S.tutor.model)) S.tutor.model = loc[0];
  save(); afterTutorChange(); return true;
}
REG.hooks.switchOffline = () => { if (switchToOffline(true)) { toast('Amani now uses the offline tutor'); clearErrors(chat()); renderTutor(); } };

/* ---------------- Coming back to the app ---------------- */
const RESUME_MS = 30 * 60 * 1000;
function touchSess() { if (!S.onboarded || exiting) return; S.sess = { t: Date.now(), h: curHash || '#/home' }; saveNow(); }
setInterval(() => { if (!document.hidden) touchSess(); }, 15000);
document.addEventListener('visibilitychange', () => { if (document.hidden) touchSess(); });
window.addEventListener('pagehide', touchSess);
function returnSplash(mode) {
  const t = resolvedTheme(), KV = window.KV; if (!KV) return;
  const el = document.createElement('div'); el.id = 'rs'; el.className = 'ob rs'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="ob-body splash"><div class="mk">${KV.flow(t, 132)}</div><div class="wm">${'Knowvia'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div><div class="tg">A path to knowing</div><p class="rs-hi">${mode === 'resume' ? 'Picking up where you left off' : 'Welcome back'}${S.name ? ', ' + esc(S.name) : ''}</p></div>`;
  document.body.appendChild(el);
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = Date.now(), end = () => { if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 700); };
  el.addEventListener('click', () => { if (Date.now() - t0 > 1800) end(); else if (calm) end(); }); setTimeout(end, calm ? 1400 : 4300);
}

window.KVApp = {
  get S() { return S; }, save, saveNow, $, $$, esc, ic, I, go, goBack, toast, get route() { return route; }, renderScreen, renderTutor, renderTop, PACKS, prog, lessons, pack, lessonById,
  qualityInfo, PROV, PROV_TOP, PROV_ALT, cloudCfg, cloudFetch, localModelList, activeModelName, tutorReady, showOv, studio, get DESK() { return DESK; }, inline, renderMd, parseBlocks, plainText,
  askTutor, chat, clearErrors, afterTutorChange, bestCloud, setLocalModels(l) { ollamaModels = (l || []).slice(); }, isNative, llm, switchToOffline, applyTheme, resolvedTheme, sleep, shuffle, get version() { return APP_VERSION; }, get busy() { return busy; },
  openTutor() { tutorOpen = true; renderTop(); renderTutor(); },
  openProvider(id) { cloudOpen = id; go('me'); setTimeout(() => { const e = document.querySelector('[data-p="' + id + '"]'); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'center' }); }, 350); },
  renderSetup, refreshDesk,
  openSetup() { setupOpen = true; renderSetup(); refreshDesk(); }, defaults, renderBrand, netErr,
  addPack(p) { const i = PACKS.findIndex((x) => x.id === p.id); if (i >= 0) PACKS[i] = p; else PACKS.push(p); }, removePack(id) { const i = PACKS.findIndex((x) => x.id === id); if (i >= 0) PACKS.splice(i, 1); if (S.activePack === id) S.activePack = PACKS[0] ? PACKS[0].id : null; save(); },
  setActivePack(id) { S.activePack = id; save(); FACTS = null; }
};

/* ---------------- Start ---------------- */
(function boot() {
  let mode = '';
  if (!S.onboarded) { if (!S.ob || !S.ob.step) { S.theme = 'frost'; S.frostMode = 'light'; S.night = false; } }
  else { const gap = S.sess && S.sess.t ? Date.now() - S.sess.t : Infinity; mode = gap < RESUME_MS ? 'resume' : 'away'; }
  if (mode === 'resume' && S.sess.h && !/^#\/?(home)?$/.test(S.sess.h)) { curHash = S.sess.h; setHash(curHash); window.__resume = true; }
  else if (mode) { curHash = '#/home'; setHash('#/home'); }
  applyTheme(); lastBrain = S.tutor.brain;
  if (mode) returnSplash(mode);
  shell();
  route = parseHash();
  if (route.name === 'lesson' && window.__resume) { route.resume = true; window.__resume = false; }
  if (route.name === 'home') tutorOpen = false;
  renderTop(); renderScreen(); renderTutor(); touchSess();
  if (!S.onboarded) obOpen(S.ob && S.ob.step > 0 ? S.ob.step : 0, false);
  window.KVApp.deskReady = initDesktop();
  window.KVApp.nativeReady = initNative();
  initBack();
  REG.ready.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
})();
})();
