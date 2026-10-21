/* Knowvia updates: a quiet check after the app opens, a clear pop-up when a new version is ready, and a guided install.
   Web app: refreshes the app files. Android app: downloads the new app file and opens the Android installer. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const UP = () => { try { return native ? ((cap.Plugins && cap.Plugins.KnowviaUpdate) || (cap.registerPlugin && (UP._c = UP._c || cap.registerPlugin('KnowviaUpdate')))) : null; } catch (e) { return null; } };
const CH = () => cap && cap.Plugins && cap.Plugins.CapacitorHttp;
const PAGES = 'https://preciousbearing-dot.github.io/Knowvia/';
const REL = 'https://api.github.com/repos/preciousbearing-dot/Knowvia/releases/tags/apk-latest';
const KEY = 'kv.upd';
const CUR = () => String(window.KV_VERSION || (A() && A().version) || '0.0.0');
const inLauncher = () => !!(A() && A().DESK);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rd = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const wr = (o) => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(rd(), o))); } catch (e) { /* storage unavailable */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function vcmp(a, b) { const x = String(a).split('.').map((n) => parseInt(n, 10) || 0), y = String(b).split('.').map((n) => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; }

/* phase: none | avail | perm | dl | ready | err | web */
const U = { checking: false, info: null, phase: 'none', dl: null, err: '', mandatory: false, last: rd().last || 0, shown: false, msg: '', poll: null };
const subs = [];
const emit = () => { paintLine(); paintOv(); subs.forEach((f) => { try { f(U); } catch (e) { /* ignore */ } }); };

/* ---------- ask the servers what the newest version is ---------- */
async function getJson(url, native_) {
  if (native_ && CH()) { const r = await CH().request({ url, method: 'GET', headers: { Accept: 'application/json' }, responseType: 'json', connectTimeout: 12000, readTimeout: 15000 }); if (r.status >= 400) throw new Error('HTTP ' + r.status); return typeof r.data === 'string' ? JSON.parse(r.data) : r.data; }
  const c = new AbortController(), t = setTimeout(() => c.abort(), 15000);
  try { const r = await fetch(url, { cache: 'no-store', signal: c.signal, headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function fetchLatest() {
  if (!native) { const j = await getJson('version.json?t=' + Date.now(), false); return { version: String(j.version || ''), notes: j.notes || [], min: j.min || '0.0.0', web: true }; }
  const rel = await getJson(REL, true);
  const m = String((rel && (rel.name || rel.tag_name)) || '').match(/(\d+\.\d+\.\d+)/);
  const as = ((rel && rel.assets) || []).find((a) => /\.apk$/i.test(a.name || '')) || {};
  if (!m || !as.browser_download_url) throw new Error('No release found');
  let notes = [], min = '0.0.0';
  try { const j = await getJson(PAGES + 'version.json?t=' + Date.now(), true); if (j && vcmp(j.version || '0', m[1]) === 0) { notes = j.notes || []; min = j.min || '0.0.0'; } } catch (e) { /* notes are optional */ }
  return { version: m[1], notes, min, apk: as.browser_download_url, bytes: as.size || 0 };
}

/* ---------- the check ---------- */
async function check(opt) {
  opt = opt || {};
  if (inLauncher() || U.checking) return;
  if (U.phase === 'dl' || U.phase === 'ready') { if (opt.manual) showOv(); return; }
  if (navigator.onLine === false) { if (opt.manual) { U.msg = 'No internet right now. Try again when you are online.'; emit(); } return; }
  U.checking = true; if (opt.manual) { U.msg = 'Checking…'; emit(); }
  try {
    const info = await fetchLatest();
    U.last = Date.now(); wr({ last: U.last });
    if (info.version && vcmp(info.version, CUR()) > 0) {
      U.info = info; U.mandatory = vcmp(info.min || '0.0.0', CUR()) > 0;
      U.msg = 'Version ' + info.version + ' is ready.';
      const sk = rd().skip || {};
      const quiet = !opt.manual && !U.mandatory && sk.v === info.version && Date.now() - (sk.at || 0) < 24 * 36e5;
      if (U.phase === 'none' || U.phase === 'avail') U.phase = 'avail';
      if (!quiet) offer(opt.manual); else emit();
    } else { U.info = null; U.msg = 'You have the latest version (' + CUR() + ').'; if (U.phase === 'avail') U.phase = 'none'; emit(); }
  } catch (e) {
    U.msg = opt.manual ? 'Could not check right now. Make sure you are online and try again.' : U.msg; emit();
  } finally { U.checking = false; }
}
/* show the pop-up when nothing else is in the way */
function offer(manual, tries) {
  tries = tries || 0;
  const busy = document.querySelector('.ov:not(#upd-ov), .splash, #ob-body');
  if (busy && !manual && tries < 8) { setTimeout(() => offer(false, tries + 1), 15000); return; }
  showOv();
}

/* ---------- the pop-up ---------- */
const mb = (n) => (n / 1048576).toFixed(1);
function ovBody() {
  const i = U.info || {}, cur = CUR();
  const notes = (i.notes || []).slice(0, 4).map((n) => `<li>${esc(n)}</li>`).join('');
  const head = (eye, h) => `<span class="eyebrow">${esc(eye)}</span><h3>${esc(h)}</h3>`;
  if (U.phase === 'perm') return head('One-time permission', 'Allow Knowvia to install updates') +
    `<p class="help">Android needs your OK once before Knowvia can install its own updates. On the next screen, switch on <b>Allow from this source</b>, then come back here. Knowvia continues by itself.</p>
     <div class="row-actions"><button class="btn primary" data-act="upd-perm">Open the settings screen</button><button class="btn" data-act="upd-later">Not now</button></div>`;
  if (U.phase === 'dl') {
    const d = U.dl || {}, pct = d.pct || 0, waiting = d.state === 'waiting';
    const right = waiting ? 'Waiting for internet' : d.speed ? (d.speed / 1048576).toFixed(1) + ' MB/s' : '';
    return head('Updating', 'Getting version ' + esc(i.version || '')) +
      `<p class="help">${waiting ? 'The connection dropped. The download continues by itself when you are back online.' : 'Keep Knowvia open for a moment. Your courses, progress and keys are kept.'}</p>
       <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
       <p class="meta of-meta"><span>${pct}%${d.total ? ' · ' + mb(d.done || 0) + ' of ' + mb(d.total) + ' MB' : ''}</span><span>${esc(right)}</span></p>
       <div class="row-actions"><button class="btn" data-act="upd-cancel">Cancel</button></div>`;
  }
  if (U.phase === 'ready') return head('Ready to install', 'Version ' + esc(i.version || '') + ' is downloaded') +
    `<p class="help">Android now shows an install screen. Tap <b>Install</b>, and when it finishes tap <b>Open</b> to start the new Knowvia. Your courses, progress and keys are kept.</p>
     <div class="row-actions"><button class="btn primary" data-act="upd-install">Install now</button><button class="btn" data-act="upd-later">Later</button></div>`;
  if (U.phase === 'err') return head('Update', 'The update did not finish') +
    `<p class="help">${esc(U.err || 'Something went wrong.')} Nothing was changed on your phone.</p>
     <div class="row-actions"><button class="btn primary" data-act="upd-now">Try again</button><button class="btn" data-act="upd-later">Close</button></div>`;
  if (U.phase === 'web') return head('Updating', 'Restarting Knowvia') + `<p class="help">Loading the new version. This takes a moment.</p><div class="bar"><i style="width:70%"></i></div>`;
  /* avail */
  return head('A new version is ready', 'Knowvia ' + esc(i.version || '')) +
    `<p class="help">You have version ${esc(cur)}. ${native ? 'Knowvia will download the update (about ' + (i.bytes ? Math.round(i.bytes / 1048576) : 25) + ' MB), then Android asks you to tap Install.' : 'Knowvia will reload with the new version.'} Your courses, progress and keys are kept.</p>
     ${notes ? `<div class="note-box inset"><b>What is new</b><ul style="margin:6px 0 0 18px;padding:0">${notes}</ul></div>` : ''}
     ${U.mandatory ? '<p class="help"><b>This update is needed to keep Knowvia working properly.</b></p>' : ''}
     <div class="row-actions"><button class="btn primary" data-act="upd-now">Update now</button>${U.mandatory ? '' : '<button class="btn" data-act="upd-later">Later</button>'}</div>`;
}
function showOv() {
  U.shown = true; let o = document.getElementById('upd-ov');
  if (!o) { o = document.createElement('div'); o.id = 'upd-ov'; o.className = 'ov'; o.innerHTML = '<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true" aria-live="polite"></div>'; document.body.appendChild(o); }
  paintOv();
}
function paintOv() { const o = document.getElementById('upd-ov'); if (o) o.querySelector('.ov-card').innerHTML = ovBody(); }
function closeOv() { const o = document.getElementById('upd-ov'); if (o) o.remove(); U.shown = false; }
function paintLine() { const e = document.getElementById('upd-line'); if (e) e.textContent = lineText(); const b = document.getElementById('upd-btn'); if (b) b.textContent = U.info && U.phase !== 'none' ? 'Update to ' + U.info.version : 'Check for updates'; }
function lineText() {
  if (U.phase === 'dl') return 'Downloading the update…' ;
  if (U.phase === 'ready') return 'The update is downloaded and ready to install.';
  if (U.info && vcmp(U.info.version, CUR()) > 0) return 'Version ' + U.info.version + ' is ready to install.';
  if (U.msg) return U.msg;
  return U.last ? 'Last checked ' + new Date(U.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '. You have the latest version.' : 'Knowvia checks for new versions by itself when you are online.';
}

/* ---------- doing the update ---------- */
async function apply() {
  if (!U.info) return;
  if (!native) {
    U.phase = 'web'; emit();
    try {
      const urls = Array.from(document.querySelectorAll('script[src],link[rel="stylesheet"]')).map((n) => n.getAttribute('src') || n.getAttribute('href')).filter((u) => u && !/^https?:\/\//.test(u));
      urls.push('index.html', 'version.json', 'sw.js');
      await Promise.race([Promise.allSettled(urls.map((u) => fetch(u, { cache: 'reload' }))), sleep(12000)]);
      const regs = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistrations() : [];
      for (const r of regs) { try { await r.update(); } catch (e) { /* ignore */ } }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    } catch (e) { /* reload anyway */ }
    location.reload(); return;
  }
  const p = UP(); if (!p) { U.phase = 'err'; U.err = 'The updater is not available in this version of the app.'; emit(); return; }
  try {
    let st = await p.status();
    if (st && st.allowed === false) { U.phase = 'perm'; emit(); return; }
    U.phase = 'dl'; U.dl = { state: 'running', pct: 0 }; emit();
    st = await p.download({ url: U.info.apk, bytes: U.info.bytes || 0 }); U.dl = st; emit(); pollDl();
  } catch (e) { U.phase = 'err'; U.err = (e && e.message) || 'The download could not start.'; emit(); }
}
function pollDl() {
  clearInterval(U.poll);
  U.poll = setInterval(async () => {
    const p = UP(); if (!p) return;
    try {
      const st = await p.status(); U.dl = st;
      if (st.state === 'ready') { clearInterval(U.poll); U.phase = 'ready'; emit(); install(); }
      else if (st.state === 'idle' && U.phase === 'dl') { clearInterval(U.poll); U.phase = 'avail'; emit(); }
      else if (st.state === 'error' && U.phase === 'dl') { U.dl.state = 'running'; U.dl.retrying = true; emit(); }
      else emit();
    } catch (e) { /* keep polling */ }
  }, 700);
  /* a download that keeps failing: stop after a while and say so */
  const t0 = Date.now(); const guard = setInterval(() => { if (U.phase !== 'dl') { clearInterval(guard); return; } if (U.dl && U.dl.state === 'error' && Date.now() - t0 > 60000) { clearInterval(U.poll); clearInterval(guard); U.phase = 'err'; U.err = U.dl.error || 'The download kept failing.'; emit(); } }, 4000);
}
async function install() {
  const p = UP(); if (!p) return;
  try { await p.install(); } catch (e) { U.phase = 'err'; U.err = (e && e.message) || 'Android could not open the installer.'; emit(); }
}
function later() {
  if (U.info) wr({ skip: { v: U.info.version, at: Date.now() } });
  if (U.phase === 'perm' || U.phase === 'err') U.phase = 'avail';
  closeOv(); emit();
}

REG.acts['upd-check'] = () => { if (U.info && vcmp(U.info.version, CUR()) > 0) { showOv(); } else check({ manual: true }); };
REG.acts['upd-now'] = () => { apply(); };
REG.acts['upd-later'] = () => later();
REG.acts['upd-cancel'] = async () => { clearInterval(U.poll); try { const p = UP(); if (p) await p.cancel(); } catch (e) { /* ignore */ } U.phase = 'avail'; U.dl = null; closeOv(); emit(); };
REG.acts['upd-perm'] = async () => { try { await UP().openSettings(); } catch (e) { /* ignore */ } };
REG.acts['upd-install'] = () => { install(); };

/* coming back from Android's settings screen: carry on */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (U.phase === 'perm' && native) { try { const st = await UP().status(); if (st.allowed !== false) apply(); } catch (e) { /* ignore */ } }
  else if (U.phase === 'none' && Date.now() - U.last > 2 * 36e5) check({});
});

/* the Me screen card text */
function card() {
  const sign = '<p class="help sign">Created by <b>Harry Precious</b> · HP Studio<br>Built with the HP Intelligence Framework</p>';
  const btn = `<div class="row-actions"><button class="btn" id="upd-btn" data-act="upd-check">${U.info ? 'Update to ' + esc(U.info.version) : 'Check for updates'}</button></div>`;
  return { sign, line: `<p class="help" id="upd-line" role="status">${esc(lineText())}</p>`, btn };
}

/* App info a friend can copy and send when something is wrong. It never includes keys or your courses. */
async function infoText() {
  const S = (A() && A().S) || {}, t = S.tutor || {}; let store = '';
  try { const e = await navigator.storage.estimate(); store = Math.round((e.usage || 0) / 1048576) + ' MB used of ' + Math.round((e.quota || 0) / 1048576) + ' MB'; } catch (e) { store = 'unknown'; }
  const clouds = Object.keys(t.clouds || {}).filter((k) => t.clouds[k] && t.clouds[k].ok).join(', ') || 'none';
  const v = (S.voice || {});
  return ['Knowvia ' + CUR() + (native ? ' (Android app)' : ' (web app)'), 'Phone: ' + (navigator.userAgent || '').replace(/^Mozilla\/5.0 /, '').slice(0, 140),
    'Screen: ' + window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x, ' + (navigator.language || ''), 'Online: ' + (navigator.onLine !== false), 'Memory: ' + (navigator.deviceMemory || '?') + ' GB, cores: ' + (navigator.hardwareConcurrency || '?'),
    'Storage: ' + store, 'Tutor: ' + (t.brain || '?') + ' / ' + (t.provider || '-') + ' / ' + (t.brain === 'local' ? (t.model || '-') : '-'), 'Cloud connected: ' + clouds, 'Voice: ' + (v.engine || 'auto'),
    'Last update check: ' + (U.last ? new Date(U.last).toISOString() : 'never')].join('\n');
}
REG.acts['info-copy'] = async () => {
  const t = await infoText();
  try { await navigator.clipboard.writeText(t); A().toast('App info copied'); } catch (e) { const el = document.getElementById('info-box'); if (el) { el.textContent = t; el.hidden = false; } A().toast('Press and hold the text to copy it'); }
};

/* start: a quiet check shortly after the app has loaded, then now and then while it stays open */
function start() {
  if (inLauncher()) return;
  const r = rd(), cur = CUR();
  if (r.ver && vcmp(cur, r.ver) > 0) { setTimeout(() => { try { A().toast('Knowvia updated to ' + cur); } catch (e) { /* ignore */ } }, 2500); const p = UP(); if (p) p.cleanup().catch(() => {}); }
  wr({ ver: cur });
  setTimeout(() => check({}), 9000);
  setInterval(() => { if (document.visibilityState === 'visible') check({}); }, 6 * 36e5);
}
REG.ready.push(start);
window.KVUpdate = { U, check, card, infoText, vcmp, apply, CUR, subs };
})();
