/* Course store: official courses hosted online, installed and updated from inside the app.
   The catalog is courses/catalog.json next to the app. Progress lives under the course id, so an update keeps it. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const CK = 'kv.catalog';
const ST = { cat: null, state: 'idle', err: '', busy: {}, at: 0 };

try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && c.courses) ST.cat = c; } catch (e) { /* no cache */ }

const vn = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0);
function vcmp(a, b) { const x = vn(a), y = vn(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; }
const mine = (id) => A().PACKS.find((p) => p.id === id);
function status(c) {
  if (c.status === 'soon') return 'soon';
  const p = mine(c.id);
  if (!p) return 'get';
  return vcmp(c.version, p.version) > 0 ? 'update' : 'have';
}
function updates() { return ST.cat ? ST.cat.courses.filter((c) => status(c) === 'update') : []; }
const size = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

async function load(force) {
  if (ST.state === 'loading') return;
  if (!force && ST.at && Date.now() - ST.at < 60000) return;
  ST.state = 'loading'; paint();
  try {
    const r = await fetch('courses/catalog.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const c = await r.json();
    if (!c || !Array.isArray(c.courses)) throw new Error('bad catalog');
    ST.cat = c; ST.at = Date.now(); if (window.KVRequest) window.KVRequest.sync(c); ST.state = 'ok'; ST.err = '';
    try { localStorage.setItem(CK, JSON.stringify(c)); } catch (e) { /* ignore */ }
  } catch (e) {
    ST.state = 'err';
    ST.err = navigator.onLine === false ? 'You are offline. The store needs the internet to look for courses.' : 'Could not reach the course store. Try again in a moment.';
  }
  paint();
}
function paint() { const r = A() && A().route; if (r && (r.name === 'store' || r.name === 'library')) A().renderScreen(); }

async function install(id) {
  const a = A(), c = ST.cat && ST.cat.courses.find((x) => x.id === id); if (!c || ST.busy[id]) return;
  const wasUpdate = status(c) === 'update';
  ST.busy[id] = 1; paint();
  try {
    const r = await fetch(c.file + '?v=' + encodeURIComponent(c.version), { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const p = await r.json();
    if (!p || p.id !== id || !Array.isArray(p.modules) || !p.modules.length) throw new Error('This course file is not valid.');
    p.origin = 'official';
    await window.KVStore.save(p);
    a.addPack(p); a.save();
    a.toast(wasUpdate ? p.title + ' updated. Your progress is kept.' : p.title + ' added to your library.');
  } catch (e) {
    a.toast(navigator.onLine === false ? 'You are offline. Connect and try again.' : 'Could not download that course. Try again.');
  }
  delete ST.busy[id]; paint();
}

function card(c) {
  const a = A(), s = status(c), p = mine(c.id), busy = ST.busy[c.id];
  const meta = [c.level, c.lessons ? c.lessons + ' lessons' : '', c.hours ? 'about ' + c.hours + ' h' : '', c.bytes && s !== 'have' && s !== 'soon' ? size(c.bytes) : ''].filter(Boolean).join(' · ');
  let act = '', tag = '', notes = '';
  if (s === 'get') act = `<button class="btn sm primary" data-act="st-get" data-id="${a.esc(c.id)}">${busy ? 'Downloading…' : 'Add to library'}</button>`;
  else if (s === 'update') { tag = `<span class="st-tag up">Update ready</span>`; notes = (c.notes && c.notes.length) ? `<ul class="st-notes">${c.notes.map((n) => `<li>${a.esc(n)}</li>`).join('')}</ul>` : ''; act = `<button class="btn sm primary" data-act="st-get" data-id="${a.esc(c.id)}">${busy ? 'Updating…' : 'Update'}</button>`; }
  else if (s === 'have') { tag = `<span class="st-tag ok">In your library</span>`; act = `<button class="btn sm" data-act="openpack" data-id="${a.esc(c.id)}">Open</button>`; }
  else tag = `<span class="st-tag soon">Coming soon</span>`;
  return `<article class="st-card pn-strong ${s}"><div class="st-top"><b>${a.esc(c.title)}</b>${tag}</div><p class="help">${a.esc(c.sub || '')}</p><p class="meta">${a.esc(meta)}${p && s === 'update' ? ' · you have v' + a.esc(p.version) : ''}</p>${notes}${act ? `<div class="row-actions">${act}</div>` : ''}</article>`;
}

function screen() {
  const a = A(), cat = ST.cat;
  const ready = cat ? cat.courses.filter((c) => c.status !== 'soon') : [], soon = cat ? cat.courses.filter((c) => c.status === 'soon') : [];
  const up = updates();
  let body;
  if (!cat) body = ST.state === 'err' ? `<div class="note-box inset"><p>${a.esc(ST.err)}</p><div class="row-actions"><button class="btn sm primary" data-act="st-refresh">Try again</button></div></div>` : `<div class="inset shelf-empty"><span class="spin"></span> Looking for courses…</div>`;
  else body = `${ST.state === 'err' ? `<p class="meta">${a.esc(ST.err)} Showing what was last found.</p>` : ''}
    ${up.length ? `<p class="help"><b>${up.length} ${up.length === 1 ? 'course has' : 'courses have'} an update.</b> Your progress and notes stay exactly as they are.</p>` : ''}
    <div class="st-grid">${ready.map(card).join('') || '<p class="meta">No courses published yet.</p>'}</div>
    ${soon.length ? `<div class="shelf-h" style="margin-top:22px"><h2>Coming soon</h2><span class="count">${soon.length}</span></div><div class="st-grid">${soon.map(card).join('')}</div>` : ''}`;
  return `<div class="page store"><button class="btn sm back-l" data-act="nav" data-r="library">${a.ic(a.I.back, 18, 2)}Library</button>
    <div class="b-hero kv-in"><p class="eyebrow">Course store</p><h1>Courses made by Knowvia</h1><p class="lede">Add a course once and it works offline. When we improve it, you update it here without reinstalling the app.</p></div>
    ${body}
    <div class="row-actions"><button class="btn sm" data-act="st-refresh">${ST.state === 'loading' ? 'Checking…' : 'Check for new courses'}</button></div>
    ${window.KVRequest ? window.KVRequest.cta() : ''}</div>`;
}

REG.screens.store = screen; REG.names.store = 'Course store';
const prevAfter = REG.hooks.afterScreen;
REG.hooks.afterScreen = (name) => { if (prevAfter) prevAfter(name); if (name === 'store') load(); };
REG.acts['st-get'] = (t, d) => install(d.id);
REG.acts['st-refresh'] = () => load(true);

/* Library hook: a Course store entry with an update badge */
window.KVCourseStore = { updates, load, status, vcmp, state: ST, bar() {
  const a = A(), n = updates().length;
  return `<button class="lib-store pn-strong" data-act="nav" data-r="store"><span class="ls-ic">${a.ic(a.I.cloud, 22, 1.8)}</span><span class="grow"><b>Course store</b><span class="s">${n ? n + (n === 1 ? ' course has an update' : ' courses have updates') : 'Get more courses made by Knowvia'}</span></span>${n ? `<span class="st-badge">${n}</span>` : ''}</button>`;
} };

REG.ready.push(() => { setTimeout(() => { if (navigator.onLine !== false) load(true); }, 12000); });
})();
