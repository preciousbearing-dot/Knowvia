/* Library: three shelves (official, your uploads, built for you) and the store that keeps built courses as files. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const LKEY = 'kv.packs';

/* ---- Store: the desktop launcher keeps each course as a file; the browser keeps them in local storage ---- */
function lsRead() { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (e) { return []; } }
function lsWrite(l) { try { localStorage.setItem(LKEY, JSON.stringify(l)); return true; } catch (e) { return false; } }
/* a second home for courses that do not fit in local storage (big prepared books) */
let pdb = null;
function packDb() {
  if (pdb) return pdb;
  pdb = new Promise((res, rej) => { let r; try { r = indexedDB.open('knowvia-packs', 1); } catch (e) { rej(e); return; } r.onupgradeneeded = () => { r.result.createObjectStore('p'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return pdb;
}
async function pdbDo(mode, fn) { const d = await packDb(); return new Promise((res, rej) => { const tx = d.transaction('p', mode), q = fn(tx.objectStore('p')); let out; if (q) q.onsuccess = () => { out = q.result; }; tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('abort')); }); }
const Store = {
  async list() {
    let out = [];
    if (A().DESK) { try { const r = await fetch('/__studio/packs').then((x) => x.json()); if (r && r.ok) out = r.packs || []; } catch (e) { /* old launcher */ } }
    const seen = new Set(out.map((p) => p.id));
    lsRead().forEach((p) => { if (!seen.has(p.id)) { out.push(p); seen.add(p.id); } });
    try { const big = await pdbDo('readonly', (st) => st.getAll()); (big || []).forEach((p) => { if (p && p.id && !seen.has(p.id)) { out.push(p); seen.add(p.id); } }); } catch (e) { /* no second store */ }
    return out;
  },
  async save(pack) {
    if (A().DESK) { try { const r = await fetch('/__studio/packs', { method: 'POST', body: JSON.stringify(pack) }).then((x) => x.json()); if (r && r.ok) return 'file'; } catch (e) { /* fall back */ } }
    const l = lsRead().filter((p) => p.id !== pack.id); l.push(pack);
    if (lsWrite(l)) { try { await pdbDo('readwrite', (st) => st.delete(pack.id)); } catch (e) { /* ignore */ } return 'browser'; }
    lsWrite(l.filter((p) => p.id !== pack.id));
    try { await pdbDo('readwrite', (st) => st.put(pack, pack.id)); return 'browser'; } catch (e) { throw new Error('This device has no room to store the course. Free some space and try again.'); }
  },
  async remove(id) {
    if (A().DESK) { try { await fetch('/__studio/packs/delete', { method: 'POST', body: JSON.stringify({ id }) }); } catch (e) { /* ignore */ } }
    lsWrite(lsRead().filter((p) => p.id !== id));
    try { await pdbDo('readwrite', (st) => st.delete(id)); } catch (e) { /* ignore */ }
  }
};
window.KVStore = Store;

const filt = { q: '', f: 'all' };
const originOf = (p) => p.origin || 'official';
function lessonsOf(p) { return p.modules.reduce((a, m) => a.concat(m.lessons), []); }
function stats(p) {
  const a = A(), pr = a.prog(p), ls = lessonsOf(p), n = ls.filter((l) => (pr.lessons[l.id] || {}).done).length, st = ls.some((l) => (pr.lessons[l.id] || {}).scroll > 0.02);
  return { n, total: ls.length, state: n >= ls.length && ls.length ? 'done' : (n > 0 || st ? 'going' : 'new') };
}
const PAL = [['#5662EE', '#4FB6F0'], ['#E9906A', '#EAB65B'], ['#2B6A5B', '#79A98F'], ['#8F7CFF', '#FFA6D5'], ['#C89A45', '#EACB82'], ['#3F7FBF', '#8EB0D6']];
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function cover(p) {
  const a = A(), c = PAL[hash(p.id) % PAL.length], st = stats(p), o = originOf(p), lab = o === 'official' ? 'Official' : o === 'upload' ? 'Your upload' : 'Built for you';
  const del = o !== 'official' ? `<button class="cv-del" data-act="lib-del" data-id="${p.id}" aria-label="Remove this course" title="Remove">${a.ic(a.I.close, 16, 2.2)}</button>` : '';
  return `<div class="cvwrap" data-title="${a.esc((p.title + ' ' + (p.subtitle || '')).toLowerCase())}" data-st="${st.state}"><button class="cover raised" data-act="openpack" data-id="${p.id}">
    <span class="cv-art" style="--c1:${c[0]};--c2:${c[1]}"><span class="cv-mono">${a.esc((p.title.match(/[A-Za-z0-9]/) || ['K'])[0].toUpperCase())}</span><span class="cv-badge">${lab}</span></span>
    <span class="cv-body"><b>${a.esc(p.title)}</b><span class="s">${a.esc(p.level || '')} · ${st.total} lessons · about ${p.estimatedHours || '?'} h</span>
      <span class="bar"><i style="width:${st.total ? Math.round(st.n / st.total * 100) : 0}%"></i></span><span class="s">${p.building ? (window.KVBuild && window.KVBuild.building && window.KVBuild.building(p.id) ? 'Still building: ' + p.building.done + ' of ' + p.building.total + ' lessons ready' : 'Unfinished: ' + p.building.done + ' of ' + p.building.total + ' lessons') : st.state === 'done' ? 'Finished' : st.state === 'going' ? st.n + ' of ' + st.total + ' done' : 'Not started'}</span></span></button>${del}</div>`;
}
function shelf(title, sub, packs, empty) {
  const a = A();
  return `<section class="shelf kv-in"><div class="shelf-h"><h2>${title}</h2><span class="count">${packs.length}</span></div><p class="help shelf-s">${sub}</p>
    ${packs.length ? `<div class="cvgrid">${packs.map(cover).join('')}</div>` : `<div class="shelf-empty inset">${empty}</div>`}</section>`;
}
function screen() {
  const a = A(), all = a.PACKS;
  const off = all.filter((p) => originOf(p) === 'official'), up = all.filter((p) => originOf(p) === 'upload'), bu = all.filter((p) => originOf(p) === 'built');
  const bj = window.KVBuild && window.KVBuild.running && window.KVBuild.running();
  return `<div class="page lib"><div class="lib-top"><h1 class="h-title">Library</h1>
    <div class="lib-tools"><label class="lsearch inset">${a.ic('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', 18, 2)}<input id="lib-q" type="search" placeholder="Search your courses" value="${a.esc(filt.q)}" autocomplete="off" aria-label="Search your courses"></label>
    <div class="seg inset" role="group" aria-label="Filter">${[['all', 'All'], ['going', 'In progress'], ['done', 'Finished']].map(([v, n]) => `<button data-act="lib-f" data-v="${v}" aria-pressed="${filt.f === v}">${n}</button>`).join('')}</div></div></div>
    ${bj ? `<button class="lib-job pn-strong" data-act="nav" data-r="build"><span class="spin"></span><span><b>Building a course</b><span class="s">${a.esc(bj.title)} · ${bj.pct}%. Tap to watch.</span></span></button>` : ''}
    ${window.KVCourseStore ? window.KVCourseStore.bar() : ''}
    ${shelf('Official courses', 'Made by Knowvia. They work offline and are updated over time.', off, 'No official courses yet.')}
    ${shelf('Your own sources', 'Courses made from your PDFs, links and notes. Kept on this device.', up, `Nothing here yet. Add a PDF, a link, a video or some notes and Amani turns it into a study path with questions and flashcards.`)}
    <div class="row-actions" style="margin-top:-6px"><button class="btn sm primary" data-act="nav" data-r="mysources">${a.ic(a.I.upload, 16, 2)}Add a source</button><button class="btn sm" data-act="nav" data-r="mysources">Manage sources</button></div>
    ${shelf('Built for you', 'Courses Amani built on topics you picked. Stored on this device.', bu, `Nothing here yet. <button class="btn sm primary" data-act="nav" data-r="build" style="margin-left:6px">${a.ic(a.I.spark, 16, 2)}Build a course</button>`)}
    <p class="meta lib-none" id="lib-none" hidden>No course matches your search.</p></div>`;
}
function applyFilter() {
  const a = A(); let shown = 0;
  a.$$('.cvwrap').forEach((w) => {
    const okQ = !filt.q || w.dataset.title.includes(filt.q.toLowerCase()), okF = filt.f === 'all' || w.dataset.st === filt.f;
    w.hidden = !(okQ && okF); if (!w.hidden) shown++;
  });
  const n = a.$('#lib-none'); if (n) n.hidden = shown > 0 || !a.PACKS.length;
}
REG.screens.library = screen;
const prevAfter = REG.hooks.afterScreen;
REG.hooks.afterScreen = (name) => { if (prevAfter) prevAfter(name); if (name === 'library') applyFilter(); };
document.addEventListener('input', (ev) => { if (ev.target && ev.target.id === 'lib-q') { filt.q = ev.target.value.trim(); applyFilter(); } });
REG.acts['lib-f'] = (t, d) => { filt.f = d.v; A().renderScreen(); };
REG.acts['lib-del'] = (t, d) => {
  const a = A(), p = a.PACKS.find((x) => x.id === d.id); if (!p) return;
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'lib-ov';
  ov.innerHTML = `<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"><h3>Remove this course?</h3><p class="help"><b>${a.esc(p.title)}</b> and your progress in it will be removed from this device. This cannot be undone.</p><div class="row-actions"><button class="btn" data-act="lib-no">Keep it</button><button class="btn primary" data-act="lib-yes" data-id="${p.id}">Remove</button></div></div>`;
  document.body.appendChild(ov);
};
REG.acts['lib-no'] = () => { const o = document.getElementById('lib-ov'); if (o) o.remove(); };
REG.acts['lib-yes'] = async (t, d) => {
  const a = A(); const o = document.getElementById('lib-ov'); if (o) o.remove();
  await Store.remove(d.id); delete a.S.progress[d.id]; delete a.S.chats[d.id + ':pack'];
  a.removePack(d.id); a.save(); a.renderScreen(); a.toast('Course removed');
};

REG.ready.push(async () => {
  const a = A();
  a.PACKS.forEach((p) => { if (!p.origin) p.origin = 'official'; });
  try { await a.deskReady; } catch (e) { /* ignore */ }
  try {
    const list = await Store.list();
    list.forEach((p) => { if (p && p.id && p.modules) { p.origin = p.origin || 'built'; a.addPack(p); } });
    if (list.length && ['library', 'home'].includes(a.route.name)) a.renderScreen();
  } catch (e) { /* the library still shows the official courses */ }
});
})();
