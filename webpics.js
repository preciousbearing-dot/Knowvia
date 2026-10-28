/* Knowvia web pictures: Amani can ask for a real picture with   ![what it shows](web:short search words)
   Nothing is fetched until the learner taps. The picture comes from Wikimedia Commons (free licences only), is shown with its
   author and licence, and is then kept on this device so it works offline afterwards. Only the search words leave the device. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; });
const DB = 'knowvia-webpics', ST = 'p', MAX_KEEP = 80, MAX_BYTES = 1500000;
const API = 'https://commons.wikimedia.org/w/api.php';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanQ = (q) => String(q || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const keyOf = (q) => 'q:' + cleanQ(q).toLowerCase();
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore(ST, { keyPath: 'key' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => { const t = d.transaction(ST, mode), q = fn(t.objectStore(ST)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
const getKept = (key) => tx('readonly', (s) => s.get(key)).catch(() => null);
async function keep(rec) {
  try {
    await tx('readwrite', (s) => s.put(rec));
    const all = await tx('readonly', (s) => s.getAll()); if (all && all.length > MAX_KEEP) { const old = all.sort((a, b) => a.t - b.t).slice(0, all.length - MAX_KEEP); await tx('readwrite', (s) => { old.forEach((o) => s.delete(o.key)); }); }
  } catch (e) { /* not kept: it is shown now and fetched again next time */ }
}
const okLicence = (name) => { const n = String(name || '').trim(); return !!n && /^(cc0|cc[ -]by([ -]sa)?\b|public domain|pd\b|attribution)/i.test(n) && !/\b(nc|nd)\b|non-?commercial|no-?deriv/i.test(n); };
const plain = (html) => { try { const d = new DOMParser().parseFromString(String(html || ''), 'text/html'); d.querySelectorAll('script,style,noscript').forEach((n) => n.remove()); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } };
/* ask Wikimedia Commons, take the first picture with a free licence that is small enough */
async function find(q, signal) {
  const url = API + '?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=900';
  const r = await fetch(url, { signal }); if (!r.ok) throw new Error('search ' + r.status);
  const j = await r.json(), pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  let freeSeen = 0;
  for (const pg of pages) {
    const ii = (pg.imageinfo || [])[0]; if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) continue;
    const md = ii.extmetadata || {}, lic = (md.LicenseShortName || {}).value; if (!okLicence(lic)) continue; freeSeen++;
    const thumb = ii.thumburl || ii.url; if (!/^https:\/\/upload\.wikimedia\.org\//.test(thumb || '')) continue;
    let blob; try { const rr = await fetch(thumb, { signal }); if (!rr.ok) continue; blob = await rr.blob(); } catch (e) { if (e && e.name === 'AbortError') throw e; continue; }
    if (!blob || blob.size < 1500 || blob.size > MAX_BYTES) continue;
    return { blob, title: plain((md.ObjectName || {}).value) || String(pg.title || '').replace(/^File:/, '').replace(/\.\w+$/, ''), author: plain((md.Artist || {}).value).slice(0, 80) || 'Unknown author', licence: String(lic).slice(0, 40), licUrl: /^https:\/\//.test((md.LicenseUrl || {}).value || '') ? md.LicenseUrl.value : '', page: /^https:\/\/commons\.wikimedia\.org\//.test(ii.descriptionurl || '') ? ii.descriptionurl : '' };
  }
  const e = new Error(freeSeen ? 'download' : 'none'); throw e;
}
function credit(rec) {
  const a = document.createElement('span'); a.className = 'wp-credit';
  const t = (s) => document.createTextNode(s);
  a.appendChild(t('Picture: ' + rec.author + '. '));
  if (rec.licUrl) { const l = document.createElement('a'); l.href = rec.licUrl; l.target = '_blank'; l.rel = 'noopener noreferrer nofollow'; l.textContent = rec.licence; a.appendChild(l); } else a.appendChild(t(rec.licence));
  a.appendChild(t(', via '));
  if (rec.page) { const l = document.createElement('a'); l.href = rec.page; l.target = '_blank'; l.rel = 'noopener noreferrer nofollow'; l.textContent = 'Wikimedia Commons'; a.appendChild(l); } else a.appendChild(t('Wikimedia Commons'));
  return a;
}
function show(fig, rec) {
  const cap = fig.dataset.cap || rec.title || 'Picture';
  const box = fig.querySelector('.pic-box'); if (!box) return;
  const img = document.createElement('img'); img.alt = cap; img.decoding = 'async'; img.setAttribute('data-act', 'pic-zoom'); img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', 'Open this picture full screen');
  img.src = URL.createObjectURL(rec.blob); box.replaceChildren(img);
  fig.classList.remove('wp-wait', 'wp-busy'); fig.classList.add('wp-done');
  let fc = fig.querySelector('figcaption'); if (!fc) { fc = document.createElement('figcaption'); fig.appendChild(fc); }
  fc.replaceChildren(document.createTextNode(cap)); const br = document.createElement('br'); fc.appendChild(br); fc.appendChild(credit(rec));
}
function note(fig, msg, canRetry) {
  fig.classList.remove('wp-busy'); const m = fig.querySelector('.wp-msg'); if (m) m.textContent = msg;
  const b = fig.querySelector('button.wp-btn'); if (b) { b.disabled = false; b.textContent = canRetry ? 'Try again' : 'Show the picture'; }
}
const live = new Map();
async function load(fig) {
  const q = fig.dataset.webq; if (!q || fig.classList.contains('wp-busy')) return;
  const k = keyOf(q), hit = await getKept(k);
  if (hit && hit.blob) { show(fig, hit); return; }
  if (!navigator.onLine) { note(fig, 'This picture needs the internet once. Connect, then tap again. After that it stays on this device.', true); return; }
  fig.classList.add('wp-busy'); const b = fig.querySelector('button.wp-btn'); if (b) { b.disabled = true; b.textContent = 'Finding a picture'; } const m = fig.querySelector('.wp-msg'); if (m) m.textContent = '';
  const ctrl = new AbortController(); live.set(fig, ctrl); const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const rec = await find(q, ctrl.signal); rec.key = k; rec.q = q; rec.t = Date.now(); await keep(rec); show(fig, rec);
  } catch (e) {
    const msg = e && e.message === 'none' ? 'No free picture was found for this. The words above still explain it.' : e && e.name === 'AbortError' ? 'This took too long. Check your internet and try again.' : e && e.message === 'download' ? 'A picture was found but could not be downloaded. Try again.' : 'The picture could not be loaded. Check your internet and try again.';
    note(fig, msg, !(e && e.message === 'none'));
  } finally { clearTimeout(timer); live.delete(fig); }
}
/* pictures already kept on this device appear by themselves, with no network */
let hq = 0;
function hydrate() {
  cancelAnimationFrame(hq); hq = requestAnimationFrame(() => {
    document.querySelectorAll('figure.webpic:not([data-wok])').forEach((fig) => {
      fig.dataset.wok = '1'; const q = fig.dataset.webq; if (!q) return;
      getKept(keyOf(q)).then((hit) => { if (hit && hit.blob && fig.isConnected) show(fig, hit); });
    });
  });
}
try { new MutationObserver(hydrate).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { /* placeholders still work on tap */ }
REG.acts['web-load'] = (t) => { const fig = t.closest('figure.webpic'); if (fig) load(fig); };
window.KVWebPics = { cleanQ, keyOf, okLicence, find, load, getKept, html(cap, q) { const c = cleanQ(q); if (c.length < 3) return ''; return `<figure class="pic nofollow webpic wp-wait" data-webq="${esc(c)}" data-cap="${esc(cap)}"><div class="pic-box wp-box"><span class="wp-ic" aria-hidden="true">&#9638;</span><p class="wp-t">${esc(cap || c)}</p><p class="wp-s">A free picture from Wikimedia Commons. Only these search words are sent: <i>${esc(c)}</i></p><p class="wp-msg" role="status"></p><button type="button" class="btn sm wp-btn" data-act="web-load">Show the picture</button></div></figure>`; } };
})();
