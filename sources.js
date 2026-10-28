/* Sources engine: reads files, links and pasted text into clean "units" (pages, slides, parts), finds chapters,
   keeps them on this device, and finds the best passages for a question. Nothing here needs the internet except web links and YouTube. */
(function () {
'use strict';
const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const KINDS = {
  pdf: { name: 'PDF', unit: 'page' }, docx: { name: 'Word document', unit: 'section' }, pptx: { name: 'PowerPoint', unit: 'slide' }, xlsx: { name: 'Excel sheet', unit: 'rows' },
  epub: { name: 'EPUB book', unit: 'section' }, photo: { name: 'Photos of pages', unit: 'photo' }, text: { name: 'Text', unit: 'part' }, web: { name: 'Website', unit: 'part' }, youtube: { name: 'YouTube video', unit: 'time' }, bundle: { name: 'Course from several sources', unit: 'part' }
};
const EXT = { pdf: 'pdf', docx: 'docx', pptx: 'pptx', xlsx: 'xlsx', epub: 'epub', txt: 'text', md: 'text', markdown: 'text', csv: 'text', tsv: 'text', json: 'text', html: 'web', htm: 'web', rtf: 'text', log: 'text', jpg: 'photo', jpeg: 'photo', png: 'photo', webp: 'photo', heic: 'photo' };
const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.epub,.txt,.md,.csv,.html,.htm,.json,.jpg,.jpeg,.png,.webp';
const LIMIT_MB = 120;
const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clean = (s) => String(s || '').replace(/ /g, ' ').replace(/[​-‍﻿]/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }
class SrcError extends Error { constructor(msg, code) { super(msg); this.code = code || 'bad'; } }

/* ---------------- Store: details in IndexedDB, a light list in local storage ---------------- */
const LK = 'kv.srcs';
function listRead() { try { return JSON.parse(localStorage.getItem(LK) || '[]'); } catch (e) { return []; } }
function listWrite(l) { try { localStorage.setItem(LK, JSON.stringify(l)); } catch (e) { /* ignore */ } }
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let r; try { r = indexedDB.open('knowvia-sources', 1); } catch (e) { rej(new SrcError('This browser cannot store sources.', 'nostore')); return; }
    r.onupgradeneeded = () => { r.result.createObjectStore('src'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(new SrcError('This browser cannot store sources.', 'nostore'));
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('src', mode), st = tx.objectStore('src'); let out; const q = fn(st); if (q) q.onsuccess = () => { out = q.result; }; tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('abort')); });
}
const cache = new Map();
const Store = {
  list: () => listRead().sort((a, b) => b.addedAt - a.addedAt),
  peek: (id) => cache.get(id),
  meta: (id) => listRead().find((s) => s.id === id),
  async get(id) { if (cache.has(id)) return cache.get(id); const s = await idb('readonly', (st) => st.get(id)); if (s) cache.set(id, s); return s; },
  async put(src) {
    await idb('readwrite', (st) => st.put(src, src.id)); cache.set(src.id, src);
    const l = listRead().filter((x) => x.id !== src.id);
    l.push({ id: src.id, title: src.title, kind: src.kind, addedAt: src.addedAt, units: src.units.length, chapters: src.chapters.length, chars: src.stats.chars, url: src.url || '', name: src.name || '' }); listWrite(l);
  },
  /* the original PDF or the photos are kept beside the text so pages can be read as images later */
  putFile: (id, blob) => idb('readwrite', (st) => st.put(blob, 'file:' + id)),
  getFile: (id) => idb('readonly', (st) => st.get('file:' + id)),
  putImg: (id, n, blob) => idb('readwrite', (st) => st.put(blob, 'img:' + id + ':' + n)),
  getImg: (id, n) => idb('readonly', (st) => st.get('img:' + id + ':' + n)),
  removeImgs: (id, prefix) => idb('readwrite', (st) => st.delete(IDBKeyRange.bound('img:' + id + ':' + prefix, 'img:' + id + ':' + prefix + '\uffff'))),
  async remove(id) {
    try { await idb('readwrite', (st) => { st.delete('file:' + id); return st.delete(IDBKeyRange.bound('img:' + id + ':', 'img:' + id + ':\uffff')); }); } catch (e) { /* ignore */ }
    try { await idb('readwrite', (st) => st.delete(id)); } catch (e) { /* ignore */ } cache.delete(id); IDX.delete(id); closeDoc(id); listWrite(listRead().filter((x) => x.id !== id));
  }
};

/* ---------------- Little helpers shared by the readers ---------------- */
function chunkParas(paras, target) {
  const out = []; let cur = '';
  paras.forEach((p0) => {
    const head = /^\n|^#{1,3}\s/.test(p0), p = clean(p0); if (!p) return;
    if (cur && (head && cur.length > 250 || cur.length + p.length > target)) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
    while (cur.length > target * 1.8) { let k = cur.lastIndexOf('. ', target * 1.4); if (k < target * 0.5) k = target * 1.4; out.push(cur.slice(0, k + 1)); cur = cur.slice(k + 1).trim(); }
  });
  if (cur) out.push(cur); return out;
}
function groupChapters(n, size, nameFn) { const ch = []; for (let a = 1; a <= n; a += size) ch.push({ title: nameFn(a, Math.min(n, a + size - 1)), from: a, to: Math.min(n, a + size - 1) }); return ch; }
function tc(s) { return String(s || '').toLowerCase().replace(/(^|[\s(/\-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|And|The|In|On|For|To|A|An|By|With)\b(?!$)/g, (m, w, o) => (o === 0 ? m : w.toLowerCase())); }

/* ---------------- ZIP reader (Word, PowerPoint, Excel and EPUB files are zips) ---------------- */
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), td = new TextDecoder('utf-8');
  let e = u8.length - 22; const lo = Math.max(0, u8.length - 66000);
  for (; e >= lo; e--) if (dv.getUint32(e, true) === 0x06054b50) break;
  if (e < lo) throw new SrcError('This file is not a valid Office or EPUB file. It may be damaged.', 'bad');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    files[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lho }; p += 46 + nl + el + cl;
  }
  const get = async (name) => {
    const f = files[name]; if (!f) return null;
    const nl = dv.getUint16(f.lho + 26, true), el = dv.getUint16(f.lho + 28, true), st = f.lho + 30 + nl + el, data = u8.subarray(st, st + f.csize);
    if (f.method === 0) return data;
    if (f.method !== 8) throw new SrcError('This file uses a compression type Knowvia cannot read.', 'bad');
    if (typeof DecompressionStream === 'undefined') throw new SrcError('This browser is too old to open this kind of file. Update your browser or use the Android app.', 'old');
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
  return { names: Object.keys(files), get, text: async (n2) => { const d = await get(n2); return d ? td.decode(d) : null; } };
}
const xml = (s, type) => new DOMParser().parseFromString(s, type || 'application/xml');
const byTag = (root, ns, name) => Array.from(root.getElementsByTagNameNS('*', name));

/* ---------------- Pictures inside Word, PowerPoint and Excel files ---------------- */
const VIS_MAX = 40, VIS_BYTES = 400 * 1024, VIS_TOTAL = 12 * 1048576, VIS_SIDE = 1400, VIS_MIN_SIDE = 90, VIS_MIN_BYTES = 800;
const IMG_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const relId = (el) => el.getAttributeNS(RNS, 'embed') || el.getAttribute('r:embed') || '';
function relPath(base, target) {
  if (!target || /^[a-z]+:/i.test(target)) return '';
  if (target.charAt(0) === '/') return target.slice(1);
  const parts = base.split('/'); parts.pop();
  target.split('/').forEach((p) => { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); });
  return parts.join('/');
}
async function readRels(z, relFile) {
  const x = await z.text(relFile), m = {}; if (!x) return m;
  byTag(xml(x), '', 'Relationship').forEach((r) => { m[r.getAttribute('Id')] = { t: r.getAttribute('Target') || '', ty: r.getAttribute('Type') || '' }; });
  return m;
}
function hashBytes(u8) { let h = 2166136261; const step = Math.max(1, (u8.length / 2048) | 0); for (let i = 0; i < u8.length; i += step) { h ^= u8[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + u8.length; }
async function shrinkVisual(u8, mime) {
  let bmp = null; const blob = new Blob([u8], { type: mime });
  try { bmp = await createImageBitmap(blob); } catch (e) { bmp = null; }
  if (!bmp) return null;
  const w = bmp.width, h = bmp.height; if (Math.min(w, h) < VIS_MIN_SIDE || w * h < 12000) { if (bmp.close) bmp.close(); return { small: 1 }; }
  for (const [side, q] of [[VIS_SIDE, 0.85], [1100, 0.7], [800, 0.6]]) {
    const k = Math.min(1, side / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const cx = cv.getContext('2d', { alpha: false }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
    const out = await new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', q)); const ow = cv.width, oh = cv.height; cv.width = cv.height = 0;
    if (out && out.size <= VIS_BYTES) { if (bmp.close) bmp.close(); return { blob: out, w: ow, h: oh }; }
  }
  if (bmp.close) bmp.close(); return { big: 1 };
}
/* items: [{ get: async () => Uint8Array, ext, unit, alt }]. Keeps real pictures, drops icons, logos that repeat on many slides, and anything over the limits. */
async function collectVisuals(items, ctx) {
  const skip = { small: 0, repeat: 0, big: 0, bad: 0, cap: 0 }, seen = {}, raw = [];
  for (const it of items) {
    if (ctx && ctx.cancelled && ctx.cancelled()) throw new Cancelled();
    const mime = IMG_EXT[it.ext]; if (!mime) { skip.bad++; continue; }
    let u8; try { u8 = await it.get(); } catch (e) { u8 = null; } if (!u8 || u8.length < VIS_MIN_BYTES) { skip.small++; continue; }
    const hk = hashBytes(u8); (seen[hk] = seen[hk] || []).push({ it, u8, mime });
  }
  Object.keys(seen).forEach((k) => { const g = seen[k]; if (g.length >= 3) skip.repeat += g.length; else g.forEach((x) => raw.push(x)); });
  raw.sort((a, b) => a.it.order - b.it.order); const out = []; let total = 0;
  for (const x of raw) {
    if (out.length >= VIS_MAX || total > VIS_TOTAL) { skip.cap++; continue; }
    const r = await shrinkVisual(x.u8, x.mime); if (!r) { skip.bad++; continue; } if (r.small) { skip.small++; continue; } if (r.big) { skip.big++; continue; }
    total += r.blob.size; out.push({ unit: x.it.unit, alt: clean(x.it.alt || '').slice(0, 300), blob: r.blob, w: r.w, h: r.h });
  }
  return { list: out, skip };
}
function visNote(kindWord, got, skip, hadAny) {
  const n = got.length, miss = skip.small + skip.repeat + skip.big + skip.bad + skip.cap;
  if (!hadAny) return '';
  if (!n) return 'This ' + kindWord + ' has pictures, but none could be kept (they were too small, repeated on many pages, or not a picture type Knowvia can open).';
  return n + (n === 1 ? ' picture was' : ' pictures were') + ' kept from this ' + kindWord + ' and can be shown beside the lesson.' + (miss ? ' ' + miss + ' more were skipped: small icons, logos that repeat, or over the size limit.' : '');
}

/* ---------------- Readers: each returns { title, units:[{t, cite, s?, m?}], chapters:[{title,from,to}], notes:[] } ---------------- */
const R = {};

R.text = async (src) => {
  const raw = typeof src === 'string' ? src : await src.text(); const t = raw.replace(/\r/g, '');
  const lines = t.split('\n'), heads = []; let md = 0;
  lines.forEach((l) => { if (/^#{1,2}\s+\S/.test(l)) md++; });
  const paras = t.split(/\n{2,}/), units = chunkParas(paras, 2400).map((x, i) => ({ t: x, cite: 'part ' + (i + 1) }));
  let chapters = [];
  if (md >= 2) { units.forEach((u, i) => { const m = u.t.match(/^#{1,2}\s+(.+)$/m); if (m) chapters.push({ title: m[1].slice(0, 90), from: i + 1, to: i + 1 }); }); }
  else units.forEach((u, i) => { const m = u.t.match(/^\s*(chapter|unit|module|lesson|part|section)\s+([0-9]+|[ivxlc]+)\b[\s:.\-]*(.{0,80})/im); if (m) chapters.push({ title: (m[1] + ' ' + m[2] + (m[3] ? ': ' + m[3] : '')).trim(), from: i + 1, to: i + 1 }); });
  void heads;
  return { title: '', units, chapters, notes: [] };
};

R.web = async (html, base) => {
  const doc = xml(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,nav,footer,header,aside,form,iframe,svg,button,[role=navigation],[aria-hidden=true],.sidebar,.nav,.menu,.cookie,.ad,.ads,.comments').forEach((n) => n.remove());
  const title = clean((doc.querySelector('meta[property="og:title"]') || {}).content || (doc.querySelector('h1') || {}).textContent || (doc.title || ''));
  const root = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('[role=main]') || doc.body; if (!root) throw new SrcError('This page has no readable text.', 'empty');
  const paras = [], heads = [];
  root.querySelectorAll('h1,h2,h3,h4,p,li,pre,blockquote,td,th,figcaption').forEach((n) => {
    const t = clean(n.textContent); if (!t || (n.tagName === 'LI' && t.length < 3)) return;
    if (/^H[1-4]$/.test(n.tagName)) { paras.push('\n' + t); heads.push({ t, at: paras.length - 1 }); } else paras.push(n.tagName === 'LI' ? '• ' + t : t);
  });
  const text = Array.from(new Set(paras.filter((p, i) => !(p.length > 40 && paras.indexOf(p) !== i)))).join('\n\n');
  if (text.length < 200) throw new SrcError('Knowvia could not find the main text on this page. Some sites hide their text from apps. Open the page, copy the text, and use Copied text instead.', 'empty');
  const r = await R.text(text); const chapters = [];
  r.units.forEach((u, i) => { const m = u.t.match(/^\n?([^\n]{3,90})\n\n/); void m; });
  heads.filter((h) => h.t.length < 100).forEach((h) => { const i = r.units.findIndex((u) => u.t.includes(h.t)); if (i >= 0 && !chapters.some((c) => c.from === i + 1)) chapters.push({ title: h.t, from: i + 1, to: i + 1 }); });
  void base;
  return { title, units: r.units, chapters: chapters.length >= 2 ? chapters : [], notes: [] };
};

R.docx = async (buf, ctx) => {
  const z = await unzip(buf), x = await z.text('word/document.xml'); if (!x) throw new SrcError('This Word file has no document text. It may be an older .doc file; save it as .docx and try again.', 'bad');
  const d = xml(x), body = d.getElementsByTagNameNS('*', 'body')[0]; if (!body) throw new SrcError('This Word file has no readable text.', 'empty');
  const paras = [], heads = []; let docTitle = ''; const imgs = [], drel = await readRels(z, 'word/_rels/document.xml.rels');
  const ptext = (p) => { let s = ''; p.querySelectorAll ? null : null; const walk = (n) => { for (const c of Array.from(n.childNodes)) { const ln = c.localName; if (ln === 't') s += c.textContent; else if (ln === 'tab') s += ' '; else if (ln === 'br' || ln === 'cr') s += '\n'; else if (c.childNodes && ln !== 'instrText') walk(c); } }; walk(p); return s; };
  const doP = (p) => {
    const blips = byTag(p, '', 'blip'), dps = byTag(p, '', 'docPr'), marks = [];
    blips.forEach((b, k) => { const r = drel[relId(b)]; if (!r || !/image$/.test(r.ty)) return; const path = relPath('word/document.xml', r.t); if (!path) return; imgs.push({ path, alt: dps[k] ? (dps[k].getAttribute('descr') || '') : '', ext: (path.split('.').pop() || '').toLowerCase(), order: imgs.length }); marks.push('\u0001IMG' + (imgs.length - 1) + '\u0001'); });
    const t = clean(ptext(p)); if (!t) { if (marks.length) paras.push(marks.join('\n')); return; }
    const st = byTag(p, '', 'pStyle')[0], sv = st ? (st.getAttribute('w:val') || st.getAttribute('val') || '') : '';
    const m = sv.match(/^(?:heading|Heading|Title)\s*([1-3])?$/), mk = marks.length ? '\n' + marks.join('\n') : '';
    if (m && /^title$/i.test(sv)) { paras.push('\n' + t + mk); if (!docTitle) docTitle = t; } else if (m) { paras.push('\n' + t + mk); heads.push({ t, lvl: +(m[1] || 1), idx: paras.length - 1 }); } else paras.push((byTag(p, '', 'numPr').length ? '• ' + t : t) + mk);
  };
  Array.from(body.childNodes).forEach((c) => {
    if (c.localName === 'p') doP(c);
    else if (c.localName === 'tbl') byTag(c, '', 'tr').forEach((tr) => { const cells = byTag(tr, '', 'tc').map((tcl) => clean(byTag(tcl, '', 'p').map(ptext).join(' '))); if (cells.some(Boolean)) paras.push(cells.join(' | ')); });
  });
  const units = chunkParas(paras, 2600).map((x2, i) => ({ t: x2, cite: 'section ' + (i + 1) }));
  units.forEach((u, i) => { u.t = u.t.replace(/\u0001IMG(\d+)\u0001/g, (m0, k) => { if (imgs[+k]) imgs[+k].unit = i + 1; return ''; }).replace(/\n{3,}/g, '\n\n').trim(); });
  const lvl = heads.some((h) => h.lvl === 1) ? 1 : 2, chapters = [];
  heads.filter((h) => h.lvl <= lvl).forEach((h) => { const i = units.findIndex((u) => u.t.includes(h.t)); if (i >= 0 && !chapters.some((c) => c.from === i + 1)) chapters.push({ title: h.t.slice(0, 90), from: i + 1, to: i + 1 }); });
  const notes = [], vv = await collectVisuals(imgs.filter((x) => x.unit).map((x) => ({ get: () => z.get(x.path), ext: x.ext, unit: x.unit, alt: x.alt, order: x.order })), ctx);
  const vn = visNote('document', vv.list, vv.skip, imgs.length > 0); if (vn) notes.push(vn);
  const ti = await z.text('docProps/core.xml'); let title = ''; if (ti) { const t = xml(ti).getElementsByTagNameNS('*', 'title')[0]; title = t ? clean(t.textContent) : ''; }
  return { title: title || docTitle, units, chapters, notes, visuals: vv.list };
};

R.pptx = async (buf, ctx) => {
  const z = await unzip(buf), sl = z.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  if (!sl.length) throw new SrcError('This PowerPoint file has no slides Knowvia can read. If it is an old .ppt file, save it as .pptx and try again.', 'bad');
  const units = [], titles = [], notes = [], pitems = []; let pics = 0, empty = 0;
  for (let i = 0; i < sl.length; i++) {
    const d = xml(await z.text(sl[i])), lines = []; let title = '';
    byTag(d, '', 'sp').forEach((sp) => {
      const ph = byTag(sp, '', 'ph')[0], isTitle = ph && /title|ctrTitle/i.test(ph.getAttribute('type') || '');
      const t = byTag(sp, '', 'p').map((p) => clean(byTag(p, '', 't').map((x) => x.textContent).join(''))).filter(Boolean);
      if (isTitle && t.length && !title) title = t.join(' '); else lines.push(...t);
    });
    byTag(d, '', 'tr').forEach((tr) => { const cells = byTag(tr, '', 'tc').map((c) => clean(byTag(c, '', 't').map((x) => x.textContent).join(' '))); if (cells.some(Boolean)) lines.push(cells.join(' | ')); });
    const pl = byTag(d, '', 'pic'); pics += pl.length;
    const num = +sl[i].match(/(\d+)\.xml$/)[1], srel = pl.length ? await readRels(z, 'ppt/slides/_rels/slide' + num + '.xml.rels') : {};
    pl.forEach((pc) => { const bl = byTag(pc, '', 'blip')[0], r = bl && srel[relId(bl)]; if (!r || !/image$/.test(r.ty)) return; const path = relPath('ppt/slides/slide' + num + '.xml', r.t); if (!path) return; const cn = byTag(pc, '', 'cNvPr')[0]; pitems.push({ get: () => z.get(path), ext: (path.split('.').pop() || '').toLowerCase(), unit: i + 1, alt: cn ? (cn.getAttribute('descr') || '') : '', order: pitems.length }); });
    const nx = await z.text('ppt/notesSlides/notesSlide' + num + '.xml');
    let note = ''; if (nx) note = clean(byTag(xml(nx), '', 't').map((x) => x.textContent).join(' ')).replace(/^\d+\s*$/, '');
    const t = (title ? title + '\n' : '') + lines.join('\n') + (note && note.length > 5 ? '\nSpeaker notes: ' + note : '');
    if (clean(t).length < 8) empty++;
    units.push({ t: clean(t) || '(This slide has no text. It may be only a picture.)', cite: 'slide ' + (i + 1) }); titles.push(title);
  }
  const vv = await collectVisuals(pitems, ctx), vn = visNote('deck', vv.list, vv.skip, pics > 0); if (vn) notes.push(vn);
  if (empty > sl.length * 0.4) notes.push('Many slides have almost no text, so the course made from them may be thin. Pictures are not read.');
  const chapters = groupChapters(units.length, units.length > 40 ? 10 : 6, (a, b) => (titles[a - 1] || 'Slides ' + a + ' to ' + b) + (a === b ? '' : ''));
  return { title: titles.find(Boolean) || '', units, chapters: units.length > 8 ? chapters : [], notes, visuals: vv.list };
};

R.xlsx = async (buf, ctx) => {
  const z = await unzip(buf), wb = await z.text('xl/workbook.xml'); if (!wb) throw new SrcError('This Excel file has no sheets Knowvia can read. If it is an old .xls file, save it as .xlsx and try again.', 'bad');
  const rels = await z.text('xl/_rels/workbook.xml.rels'), relMap = {}; if (rels) byTag(xml(rels), '', 'Relationship').forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const ss = []; const sx = await z.text('xl/sharedStrings.xml'); if (sx) byTag(xml(sx), '', 'si').forEach((si) => ss.push(clean(byTag(si, '', 't').map((t) => t.textContent).join(''))));
  const sheets = byTag(xml(wb), '', 'sheet').map((s) => ({ name: s.getAttribute('name'), rid: s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id') }));
  const units = [], chapters = [], notes = [], xitems = []; let rowsTotal = 0, cut = false, xpics = 0;
  const col = (ref) => { const m = String(ref).match(/^([A-Z]+)/); let n = 0; if (m) for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  for (const sh of sheets) {
    let tgt = relMap[sh.rid] || ''; tgt = tgt.replace(/^\//, ''); const path = tgt.startsWith('xl/') ? tgt : 'xl/' + tgt; const sx2 = await z.text(path); if (!sx2) continue;
    const rows = []; byTag(xml(sx2), '', 'row').forEach((r) => {
      const cells = []; byTag(r, '', 'c').forEach((c) => { const t = c.getAttribute('t'), v = c.getElementsByTagNameNS('*', 'v')[0], is = c.getElementsByTagNameNS('*', 'is')[0]; let val = ''; if (t === 's' && v) val = ss[+v.textContent] || ''; else if (is) val = clean(is.textContent); else if (v) val = v.textContent; cells[col(c.getAttribute('r'))] = val; });
      const line = Array.from(cells, (x) => x === undefined ? '' : x).join(' | ').replace(/(\s\|)+\s*$/, ''); if (line.trim()) rows.push(line);
    });
    if (!rows.length) continue;
    const head = rows[0], room = Math.max(0, 15000 - rowsTotal); let use = rows; if (rows.length > room) { use = rows.slice(0, room); cut = true; }
    rowsTotal += use.length; const first = units.length + 1;
    for (let a = 0; a < use.length; a += 40) { const part = use.slice(a, a + 40); units.push({ t: (a ? 'Columns: ' + head + '\n' : '') + part.join('\n'), cite: sh.name + ' rows ' + (a + 1) + '-' + (a + part.length) }); }
    chapters.push({ title: 'Sheet: ' + sh.name, from: first, to: units.length });
    try {
      const srl = await readRels(z, path.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels')), dr = Object.keys(srl).map((k) => srl[k]).find((r) => /drawing$/.test(r.ty));
      if (dr) {
        const dpath = relPath(path, dr.t), dx = await z.text(dpath);
        if (dx) { const drel2 = await readRels(z, dpath.replace(/drawings\/([^/]+)$/, 'drawings/_rels/$1.rels'));
          byTag(xml(dx), '', 'pic').forEach((pc) => { xpics++; const bl = byTag(pc, '', 'blip')[0], r = bl && drel2[relId(bl)]; if (!r || !/image$/.test(r.ty)) return; const ip = relPath(dpath, r.t); const cn = byTag(pc, '', 'cNvPr')[0]; xitems.push({ get: () => z.get(ip), ext: (ip.split('.').pop() || '').toLowerCase(), unit: first, alt: cn ? (cn.getAttribute('descr') || '') : '', order: xitems.length }); }); }
      }
    } catch (e) { /* pictures are optional */ }
    if (cut) break;
  }
  if (!units.length) throw new SrcError('These sheets are empty.', 'empty');
  if (cut) notes.push('This workbook is very large, so only the first 15,000 rows were read.');
  const vv = await collectVisuals(xitems, ctx), vn = visNote('workbook', vv.list, vv.skip, xpics > 0); if (vn) notes.push(vn);
  notes.push('Excel files are read as tables of text. Formulas show their last saved results, and charts are not included.');
  return { title: '', units, chapters, notes, visuals: vv.list };
};

R.epub = async (buf) => {
  const z = await unzip(buf), cont = await z.text('META-INF/container.xml'); if (!cont) throw new SrcError('This EPUB file is damaged or protected, so Knowvia cannot read it.', 'bad');
  const opfPath = byTag(xml(cont), '', 'rootfile')[0].getAttribute('full-path'), opf = xml(await z.text(opfPath)), dir = opfPath.includes('/') ? opfPath.replace(/[^/]*$/, '') : '';
  const man = {}; byTag(opf, '', 'item').forEach((i) => { man[i.getAttribute('id')] = { href: i.getAttribute('href'), type: i.getAttribute('media-type') || '' }; });
  const spine = byTag(opf, '', 'itemref').map((i) => man[i.getAttribute('idref')]).filter((m) => m && /html|xml/.test(m.type));
  if (!spine.length) throw new SrcError('This EPUB has no readable chapters. It may be protected by DRM.', 'bad');
  const tit = byTag(opf, '', 'title')[0], units = [], chapters = [];
  for (const it of spine) {
    const path = dir + decodeURIComponent(it.href.split('#')[0]); const h = await z.text(path); if (!h) continue;
    const d = xml(h, 'text/html'); d.querySelectorAll('script,style,nav').forEach((n) => n.remove());
    const paras = []; (d.body || d).querySelectorAll('h1,h2,h3,p,li,pre,blockquote,td').forEach((n) => { const t = clean(n.textContent); if (t) paras.push(/^H[1-3]$/.test(n.tagName) ? '\n' + t : t); });
    const text = paras.join('\n\n'); if (text.length < 40) continue;
    const head = d.querySelector('h1,h2,h3'), first = units.length + 1;
    chunkParas(paras, 2600).forEach((x) => units.push({ t: x, cite: 'section ' + (units.length + 1) }));
    const ttl = head ? clean(head.textContent).slice(0, 90) : '';
    if (units.length >= first) { const last = chapters[chapters.length - 1]; if (ttl || !last || text.length > 1500) chapters.push({ title: ttl || 'Section ' + first, from: first, to: units.length }); else last.to = units.length; }
  }
  if (!units.length) throw new SrcError('This EPUB has no readable text.', 'empty');
  return { title: tit ? clean(tit.textContent) : '', units, chapters, notes: [] };
};

/* ---- PDF: read page by page with pdf.js, rebuild lines, remove running headers, find chapters ---- */
let pdfjs = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new SrcError('The PDF reader could not load. Check your internet and try again once; after that it works offline.', 'lib')); document.head.appendChild(s); }); }
async function getPdf() {
  if (pdfjs) return pdfjs;
  if (!window.pdfjsLib) await loadScript('vendor/pdf.min.js');
  pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; return pdfjs;
}
function pageLines(items) {
  const rows = [];
  items.forEach((it) => { if (!it.str && !it.hasEOL) return; const y = it.transform[5], x = it.transform[4], h = it.height || 10; let r = rows.find((q) => Math.abs(q.y - y) < Math.max(2.2, h * 0.45)); if (!r) { r = { y, parts: [], h }; rows.push(r); } r.parts.push({ x, w: it.width || 0, s: it.str }); });
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => { r.parts.sort((a, b) => a.x - b.x); let s = '', end = null; r.parts.forEach((p) => { if (end !== null && p.x - end > 1.5 && !/^\s/.test(p.s) && !/\s$/.test(s)) s += ' '; s += p.s; end = p.x + p.w; }); return { t: s.replace(/\s+/g, ' ').trim(), y: r.y }; }).filter((l) => l.t);
}
const GARB = /\b[LMNOPQ]{2,3}\b/g;
function mathScore(t) { const g = (t.match(GARB) || []).filter((x) => !/^(NO|ON|OP|MP|PM|MM|LP|NP|PO|OM|MO|NM|ML|LM|QP|PQ|MN)$/.test(x) || /^(LM|MN|OP|PQ|NM|QP)$/.test(x)).length; const sym = (t.match(/[∀-⋿←-⇿√∫]/g) || []).length; return g * 2 + (sym > 20 ? Math.floor(sym / 10) : 0); }
R.pdf = async (buf, ctx) => {
  const lib = await getPdf(); let doc;
  try { doc = await lib.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false }).promise; }
  catch (e) { if (e && e.name === 'PasswordException') throw new SrcError('This PDF is locked with a password. Remove the password, then add it again.', 'locked'); throw new SrcError('This PDF could not be opened. It may be damaged.', 'bad'); }
  const n = doc.numPages, pages = []; let sparse = 0; const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    if (ctx && ctx.cancelled()) { try { doc.destroy(); } catch (e) { /* ignore */ } throw new Cancelled(); }
    const pg = await doc.getPage(i), tcn = await pg.getTextContent(); const lines = pageLines(tcn.items); pg.cleanup();
    pages.push(lines); if (lines.reduce((a, l) => a + l.t.length, 0) < 40) sparse++;
    if (ctx && (i % 5 === 0 || i === n)) { const el = (Date.now() - t0) / 1000, rate = i / Math.max(0.1, el); ctx.progress('read', i / n, 'Reading page ' + i + ' of ' + n, Math.round((n - i) / rate)); }
    if (i % 25 === 0) await sleep(0);
  }
  let metaTitle = ''; try { const md = await doc.getMetadata(); metaTitle = clean((md.info && md.info.Title) || ''); if (/^(untitled|microsoft word|document\d*)/i.test(metaTitle) || metaTitle.length < 4) metaTitle = ''; } catch (e) { metaTitle = ''; }
  let outline = null; try { outline = await doc.getOutline(); } catch (e) { outline = null; }
  let outlineCh = [];
  if (outline && outline.length >= 3) {
    for (const o of outline) { try { let d = o.dest; if (typeof d === 'string') d = await doc.getDestination(d); if (d && d[0]) { const idx = await doc.getPageIndex(d[0]); outlineCh.push({ title: clean(o.title).slice(0, 90), from: idx + 1 }); } } catch (e) { /* skip */ } }
    outlineCh = outlineCh.filter((c, k, a) => c.title && (k === 0 || c.from >= a[k - 1].from)).filter((c, k, a) => k === 0 || c.from !== a[k - 1].from);
  }
  try { doc.destroy(); } catch (e) { /* ignore */ }
  const notes = [];
  const scanned = sparse > n * 0.5;
  if (scanned) {
    const units0 = pages.map((ls, i) => ({ t: '(This page has not been read yet. It is a picture of a page.)', e: 1, cite: 'p. ' + (i + 1), pg: i + 1, m: 0 }));
    return { title: metaTitle, units: units0, chapters: n > 12 ? groupChapters(n, n > 200 ? 25 : n > 60 ? 12 : 6, (a, b) => 'Pages ' + a + ' to ' + b) : [], notes: ['This PDF is made of pictures of pages, so there is no text to read yet. Amani reads each page as an image with a cloud model that can see images, when you open a lesson or press Read pages. Pages already read are kept.'], pdfPages: n, scanned: true };
  }
  if (sparse > n * 0.1) notes.push(sparse + ' pages have little or no text. They may be pictures or blank pages. Open one and press Read this page as an image if it matters.');
  /* running headers and footers: short lines at the top or bottom that repeat with only the number changing */
  const key = (s2) => s2.replace(/\d+(\.\d+)*/g, '#').replace(/\s+/g, ' ').trim().toLowerCase(), cnt = {};
  pages.forEach((ls) => { const seen = new Set(); ls.slice(0, 2).concat(ls.slice(-2)).forEach((l) => { if (l.t.length > 90) return; const k = key(l.t); if (!seen.has(k)) { seen.add(k); cnt[k] = (cnt[k] || 0) + 1; } }); });
  const hasNum = (s2) => /(^|\s)\d{1,2}\.\d{1,3}(\s|$)|^\d{1,4}$/.test(s2);
  const frequent = (l) => l.t.length <= 90 && (cnt[key(l.t)] || 0) >= (hasNum(l.t) ? 4 : Math.max(6, Math.round(n * 0.04)));
  const BL = /^(exercise|exercises|example|examples|solution|solutions|answers?|hints?|test|revision|summary|chapter|section|fig|figure|table|problems?|questions?|additional|multiple|fill|very|short|long)\b/i;
  const units = [], chap = {}, nameCh = {};
  pages.forEach((ls, i) => {
    let label = '', body = [];
    ls.forEach((l, k) => {
      const edge = k < 2 || k >= ls.length - 2;
      if (edge && frequent(l)) {
        const a1 = l.t.match(/^(\d{1,2})\.(\d{1,3})\s+(.+)$/), a2 = l.t.match(/^(.+?)\s+(\d{1,2})\.(\d{1,3})$/);
        const num = a1 ? [a1[1], a1[2], a1[3]] : a2 ? [a2[2], a2[3], a2[1]] : null;
        if (num) { label = num[0] + '.' + num[1]; const name = num[2].trim(), c = +num[0]; const q = (chap[c] = chap[c] || { from: i + 1, to: i + 1, names: {} }); q.to = i + 1; if (!BL.test(name) && /^[A-Za-z][A-Za-z ,\-'&/()\u2014:]{3,80}$/.test(name)) { q.names[name] = (q.names[name] || 0) + 1; (nameCh[name] = nameCh[name] || new Set()).add(c); } }
        else { const m = l.t.match(/^(\d{1,4})$/); if (m) label = m[1]; }
        return;
      }
      if (edge && /^\(?[ivxlc]+\)?$|^\d{1,4}$|^[-–]\s*\d+\s*[-–]$/i.test(l.t)) { if (!label) label = l.t.replace(/[^0-9ivxlc]/gi, ''); return; }
      body.push(l.t);
    });
    const t = body.join('\n').replace(/-\n(?=[a-z])/g, '').replace(/([^\n.:;?!])\n(?=[a-z(])/g, '$1 ');
    units.push({ t: t.trim() ? t : '(This page has no text. It may be a picture or a blank page.)', e: t.trim() ? 0 : 1, cite: 'p. ' + (label || (i + 1)), pg: i + 1, m: mathScore(t) >= 4 ? 1 : 0 });
  });
  const nCh = Object.keys(chap).length;
  Object.keys(chap).forEach((k) => { const q = chap[k], names = Object.keys(q.names).filter((nm) => nameCh[nm].size <= Math.max(2, nCh * 0.25)).sort((a, b) => q.names[b] - q.names[a]); q.title = names.length ? tc(names[0]) : ''; });
  let chapters = Object.keys(chap).filter((k) => chap[k].title).map((k) => ({ num: +k, title: chap[k].title, from: chap[k].from, to: chap[k].to })).sort((a, b) => a.from - b.from);
  if (chapters.length >= 3) { chapters.forEach((c, k) => { c.title = 'Chapter ' + c.num + ': ' + c.title; c.to = k + 1 < chapters.length ? chapters[k + 1].from - 1 : n; }); if (chapters[0].from > 3) chapters.unshift({ title: 'Before chapter 1 (cover, contents, syllabus)', from: 1, to: chapters[0].from - 1, front: true }); else chapters[0].from = 1; }
  else if (outlineCh.length >= 3) { chapters = outlineCh.map((c, k) => ({ title: c.title, from: c.from, to: k + 1 < outlineCh.length ? outlineCh[k + 1].from - 1 : n })); }
  else {
    const found = []; pages.forEach((ls, i) => { for (const l of ls.slice(0, 6)) { const m = l.t.match(/^(chapter|unit|module|part|lesson|section)\s+([0-9]+|[ivxlc]+)\b[\s:.\-–]*(.{0,70})$/i); if (m) { found.push({ title: (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + (m[3] ? ': ' + m[3] : '')).slice(0, 90), from: i + 1 }); break; } } });
    if (found.length >= 3) chapters = found.map((c, k) => ({ title: c.title, from: c.from, to: k + 1 < found.length ? found[k + 1].from - 1 : n }));
    else chapters = n > 12 ? groupChapters(n, n > 200 ? 25 : n > 60 ? 12 : 6, (a, b) => 'Pages ' + a + ' to ' + b) : [];
  }
  chapters = chapters.filter((c) => c.to >= c.from);
  const math = units.filter((u) => u.m).length;
  if (math) notes.push(math + ' of ' + n + ' pages contain maths or symbols that a text reader garbles (for example matrices and fractions). Amani reads them as page images when you prepare a lesson, so formulas come out right.');
  const info = await Promise.resolve(null);
  void info;
  return { title: metaTitle, units, chapters, notes, pdfPages: n };
};

/* ---- Websites and YouTube ---- */
const CH = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
async function httpText(url, o) {
  o = o || {};
  if (native && CH()) { const r = await CH().request({ url, method: o.method || 'GET', headers: o.headers || {}, data: o.body, responseType: 'text', connectTimeout: 20000, readTimeout: 30000 }); if (r.status >= 400) throw new SrcError('The site answered with an error (' + r.status + ').', 'http'); return typeof r.data === 'string' ? r.data : JSON.stringify(r.data); }
  if (window.KVApp && window.KVApp.DESK) { const r = await fetch('/__studio/fetch', { method: 'POST', body: JSON.stringify({ url, method: o.method || 'GET', headers: o.headers || {}, body: o.body || null }) }); const j = await r.json().catch(() => null); if (j && j.ok) return j.text; if (j && j.error) throw new SrcError(j.error, 'http'); }
  try { const r = await fetch(url, { method: o.method || 'GET', headers: o.headers, body: o.body, mode: 'cors' }); if (!r.ok) throw new SrcError('The site answered with an error (' + r.status + ').', 'http'); return await r.text(); }
  catch (e) { if (e instanceof SrcError) throw e; throw new SrcError(native ? 'The page could not be reached. Check your internet.' : 'This browser is not allowed to open other websites. It works in the Knowvia Android app and the desktop app. Here, open the page, copy its text, and use Copied text.', 'cors'); }
}
async function httpBlob(url) {
  const cap = LIMIT_MB * 1048576;
  if (native && CH()) {
    const r = await CH().request({ url, method: 'GET', responseType: 'blob', connectTimeout: 20000, readTimeout: 90000 });
    if (r.status >= 400) throw new SrcError('The site answered with an error (' + r.status + ').', 'http');
    const b64 = typeof r.data === 'string' ? r.data : ''; if (!b64) throw new SrcError('The file came back empty.', 'http');
    if (b64.length * 0.75 > cap) throw new SrcError('This file is too big (over ' + LIMIT_MB + ' MB).', 'big');
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: 'application/octet-stream' });
  }
  try { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new SrcError('The site answered with an error (' + r.status + ').', 'http'); const b = await r.blob(); if (b.size > cap) throw new SrcError('This file is too big (over ' + LIMIT_MB + ' MB).', 'big'); return b; }
  catch (e) { if (e instanceof SrcError) throw e; throw new SrcError('This file could not be downloaded here. It works in the Knowvia Android app.', 'cors'); }
}
/* ---------------- Google Drive: a file or Google Doc shared with "Anyone with the link" ---------------- */
function driveParse(u) {
  let x; try { u = String(u || '').trim(); x = new URL(/^https?:/i.test(u) ? u : 'https://' + u); } catch (e) { return null; }
  const h = x.hostname.replace(/^www\./, '');
  if (h === 'drive.google.com') {
    if (/\/folders\//.test(x.pathname)) return { type: 'folder' };
    const m = x.pathname.match(/\/file\/d\/([\w-]{10,})/), id = m ? m[1] : x.searchParams.get('id');
    return id && /^[\w-]{10,}$/.test(id) ? { type: 'file', id } : null;
  }
  if (h === 'docs.google.com') { const m = x.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]{10,})/); if (m) return { type: m[1] === 'document' ? 'doc' : m[1] === 'spreadsheets' ? 'sheet' : 'slides', id: m[2] }; }
  return null;
}
const driveUrl = (d) => d.type === 'doc' ? 'https://docs.google.com/document/d/' + d.id + '/export?format=docx' : d.type === 'sheet' ? 'https://docs.google.com/spreadsheets/d/' + d.id + '/export?format=xlsx' : d.type === 'slides' ? 'https://docs.google.com/presentation/d/' + d.id + '/export/pptx' : 'https://drive.usercontent.google.com/download?id=' + d.id + '&export=download&confirm=t';
/* says what a downloaded blob really is, from its first bytes (Drive does not tell us the file name) */
async function sniffExt(blob) {
  const h = new Uint8Array(await blob.slice(0, 16).arrayBuffer()), at = (s) => s.split('').every((c, i) => h[i] === c.charCodeAt(0));
  if (at('%PDF')) return 'pdf';
  if (h[0] === 0x89 && at('\x89PNG')) return 'png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'jpg';
  if (at('RIFF') && String.fromCharCode(h[8], h[9], h[10], h[11]) === 'WEBP') return 'webp';
  if (h[0] === 0x50 && h[1] === 0x4b) { try { const names = (await unzip(await blob.arrayBuffer())).names; if (names.includes('word/document.xml')) return 'docx'; if (names.includes('ppt/presentation.xml')) return 'pptx'; if (names.includes('xl/workbook.xml')) return 'xlsx'; if (names.includes('META-INF/container.xml')) return 'epub'; } catch (e) { /* not an office file */ } return ''; }
  const t = await blob.slice(0, 2000).text();
  if (/^\s*<(!doctype|html)/i.test(t)) return 'html';
  return t.indexOf('\ufffd') < 0 && t.indexOf('\u0000') < 0 ? 'txt' : '';
}
const DRIVE_PRIVATE = 'Google would not give this file out. In Drive, open the file, tap Share, set General access to "Anyone with the link" (Viewer), then paste the link again.';
async function driveFile(d, ctx) {
  if (!d) throw new SrcError('That does not look like a Google Drive or Google Docs link. Open the file in Drive, tap Share, then Copy link.', 'url');
  if (d.type === 'folder') throw new SrcError('Folders cannot be opened without signing in. Open the folder, then share and paste the link of each file you want.', 'url');
  ctx.progress('open', 0.06, 'Downloading from Google Drive');
  let blob; try { blob = await httpBlob(driveUrl(d)); } catch (e) { if (e instanceof SrcError && e.code === 'http' && /\((401|403|404)\)/.test(e.message)) throw new SrcError(DRIVE_PRIVATE, 'private'); throw e; }
  if (ctx.cancelled()) throw new Cancelled();
  const ext = await sniffExt(blob);
  if (ext === 'html') throw new SrcError(DRIVE_PRIVATE, 'private');
  if (!ext) throw new SrcError('This Drive file is not a type Knowvia can read. It reads PDF, Word, PowerPoint, Excel, EPUB, text and photos. For a Google Doc, Sheet or Slides, paste its link directly.', 'type');
  return new File([blob], 'Google Drive file.' + ext, { type: blob.type || '' });
}
const normUrl = (u) => { u = String(u || '').trim(); if (!u || /\s/.test(u)) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { const x = new URL(u); return /\./.test(x.hostname) || x.hostname === 'localhost' ? x.toString() : ''; } catch (e) { return ''; } };
const ytId = (u) => { try { const x = new URL(u); if (/youtu\.be$/.test(x.hostname)) return x.pathname.slice(1, 12); if (/youtube\.com$|youtube-nocookie\.com$/.test(x.hostname.replace(/^(www|m|music)\./, ''))) { if (x.searchParams.get('v')) return x.searchParams.get('v').slice(0, 11); const m = x.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/); if (m) return m[1]; } } catch (e) { /* not a url */ } return ''; };
const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function transcriptUnits(segs, title) {
  const units = []; let cur = '', start = 0, last = 0;
  segs.forEach((g) => { if (!cur) start = g.s; cur += (cur ? ' ' : '') + g.t; last = g.s; if (cur.length > 700 && /[.?!]$/.test(cur) || cur.length > 1100 || g.s - start > 75) { units.push({ t: cur, cite: mmss(start), s: start }); cur = ''; } });
  if (cur) units.push({ t: cur, cite: mmss(start), s: start }); void last; void title;
  const chapters = []; const total = units.length ? units[units.length - 1].s : 0, per = total > 3600 ? 600 : total > 1200 ? 300 : 180;
  let from = 1; units.forEach((u, i) => { if (i > 0 && u.s - units[from - 1].s >= per) { chapters.push({ title: 'From ' + mmss(units[from - 1].s), from, to: i }); from = i + 1; } }); if (units.length) chapters.push({ title: 'From ' + mmss(units[from - 1].s), from, to: units.length });
  return { units, chapters: chapters.length >= 2 ? chapters : [] };
}
function parseCaptionJson(txt) { let j; try { j = JSON.parse(txt); } catch (e) { return null; } const segs = []; (j.events || []).forEach((ev) => { if (!ev.segs) return; const t = clean(ev.segs.map((x) => x.utf8 || '').join('').replace(/\n/g, ' ')); if (t) segs.push({ s: (ev.tStartMs || 0) / 1000, t }); }); return segs; }
function parseCaptionXml(txt) { const d = xml(txt); const segs = []; Array.from(d.getElementsByTagName('text')).forEach((n) => { const t = clean(n.textContent.replace(/&#39;/g, "'")); if (t) segs.push({ s: parseFloat(n.getAttribute('start') || '0'), t }); }); return segs.length ? segs : null; }
const YT_MAX_SECS = 10 * 3600, YT_MAX_CHARS = 1500000;
async function youtube(url, prefLang) {
  const id = ytId(url); if (!id) throw new SrcError('This does not look like a YouTube video link. Paste the link from the Share button.', 'url');
  const ctxs = [
    { name: 'ANDROID', body: { context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, hl: 'en' } }, videoId: id, contentCheckOk: true, racyCheckOk: true }, ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip' },
    { name: 'WEB', body: { context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en' } }, videoId: id, contentCheckOk: true, racyCheckOk: true }, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
  ];
  let lastErr = null, found = null;
  for (const c of ctxs) {
    try {
      const txt = await httpText('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': c.name === 'ANDROID' ? '3' : '1' }, body: JSON.stringify(c.body) });
      const j = JSON.parse(txt), ps = j.playabilityStatus || {};
      if (ps.status && ps.status !== 'OK') { lastErr = new SrcError(ps.status === 'LOGIN_REQUIRED' ? 'YouTube needs a sign-in to show this video (it may be age-restricted or private). Knowvia cannot read it.' : 'YouTube would not give this video out: ' + (ps.reason || ps.status) + '.', 'yt'); continue; }
      const tr = (((j.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
      if (!tr.length) { lastErr = new SrcError('This video has no captions, so there is no transcript to read. Pick a video with captions, or paste its transcript using Copied text.', 'nocaps'); found = { title: (j.videoDetails || {}).title || '', none: true }; continue; }
      found = { title: (j.videoDetails || {}).title || '', author: (j.videoDetails || {}).author || '', tracks: tr, secs: +((j.videoDetails || {}).lengthSeconds || 0) }; lastErr = null; break;
    } catch (e) { lastErr = e instanceof SrcError ? e : new SrcError('YouTube could not be reached or changed how it works. You can paste the transcript instead: open the video, tap More, then Show transcript, copy it, and use Copied text.', 'yt'); }
  }
  if (!found || !found.tracks) throw lastErr || new SrcError('YouTube did not return a transcript.', 'yt');
  const hrs = found.secs / 3600;
  if (found.secs > YT_MAX_SECS) throw new SrcError('This video is about ' + (hrs >= 10 ? Math.round(hrs) : Math.round(hrs * 10) / 10) + ' hours long. That is too much for a phone to read in one go, and it could make Knowvia stop responding. Videos up to ' + (YT_MAX_SECS / 3600) + ' hours work. For a long course, add its parts one at a time (most long courses are split into lessons or playlists), or paste the part of the transcript you want using Copied text.', 'ytlong');
  const want = (prefLang || 'en').toLowerCase(), pick = found.tracks.find((t) => t.languageCode.toLowerCase() === want && t.kind !== 'asr') || found.tracks.find((t) => t.languageCode.toLowerCase().startsWith(want) && t.kind !== 'asr') || found.tracks.find((t) => t.languageCode.toLowerCase().startsWith(want)) || found.tracks.find((t) => t.kind !== 'asr') || found.tracks[0];
  let segs = null; const base = pick.baseUrl.replace(/&fmt=[^&]*/, '');
  try { segs = parseCaptionJson(await httpText(base + '&fmt=json3', { headers: { 'User-Agent': ctxs[1].ua } })); } catch (e) { segs = null; }
  if (!segs || !segs.length) { try { segs = parseCaptionXml(await httpText(base, { headers: { 'User-Agent': ctxs[1].ua } })); } catch (e) { segs = null; } }
  if (!segs || !segs.length) throw new SrcError('YouTube gave the caption list but no caption text. Paste the transcript using Copied text instead.', 'yt');
  if (segs.length > 120000 || segs.reduce((n, g) => n + g.t.length, 0) > YT_MAX_CHARS) throw new SrcError('The transcript of this video is far too long to read on this device. Add the video in smaller parts, or paste the part you want using Copied text.', 'ytlong');
  const r = transcriptUnits(segs, found.title), notes = [];
  if (pick.kind === 'asr') notes.push('These are automatic captions, so names, accents and technical words may be wrong.');
  return { title: found.title || 'YouTube video', units: r.units, chapters: r.chapters, notes, extra: { videoId: id, author: found.author, lang: pick.languageCode, secs: found.secs } };
}

/* ---------------- Ingest: turn one thing the user gave us into a stored source ---------------- */
function detect(file) { const ext = (file.name.split('.').pop() || '').toLowerCase(); if (EXT[ext]) return EXT[ext]; if (/pdf/.test(file.type)) return 'pdf'; if (/^text\//.test(file.type)) return 'text'; return ''; }
const NOTE_TOOBIG = 'This file is very large. Knowvia can open it, but it may take a few minutes on a phone.';
async function ingest(input, ctx) {
  ctx = ctx || {}; const cancelled = () => !!(ctx.signal && ctx.signal.aborted); ctx.cancelled = cancelled;
  const prog = ctx.onProgress || (() => {}); ctx.progress = (stage, frac, msg, eta) => prog({ stage, frac, msg, eta });
  let kind = input.kind, res, name = '', url = '', bytes = 0, keepFile = null; const sid = uid(); let photoBlobs = null;
  if (kind === 'web' && input.url && driveParse(input.url)) kind = 'drive';
  if (kind === 'drive') { url = String(input.url || '').trim(); input = { kind: 'file', file: await driveFile(driveParse(url), ctx) }; kind = 'file'; if (!/^https?:/i.test(url)) url = 'https://' + url; }
  if (kind === 'file' && input.file && detect(input.file) === 'photo') { input = { kind: 'photos', files: [input.file] }; kind = 'photos'; }
  if (kind === 'photos') {
    const files = (input.files || []).filter((f) => f && (/^image\//.test(f.type) || detect(f) === 'photo')); if (!files.length) throw new SrcError('Choose at least one photo.', 'empty');
    if (files.length > 60) throw new SrcError('That is ' + files.length + ' photos. Add up to 60 at a time.', 'big');
    if (!vision.candidates().length) throw new SrcError('Reading photos needs a cloud model that can see images. Gemini has a free plan that works well: connect it in Me, then add the photos again.', 'novision');
    kind = 'photo'; photoBlobs = [];
    for (let i = 0; i < files.length; i++) { if (cancelled()) throw new Cancelled(); ctx.progress('open', 0.03 + 0.12 * (i / files.length), 'Preparing photo ' + (i + 1) + ' of ' + files.length); photoBlobs.push(await shrinkImage(files[i])); }
    res = { title: 'Photos of pages', units: photoBlobs.map((b, i) => ({ t: '(This photo has not been read yet.)', e: 1, cite: 'photo ' + (i + 1), pg: i + 1 })), chapters: [], notes: [], scanned: true }; bytes = photoBlobs.reduce((a, b) => a + b.size, 0); name = files.length + ' photos';
  } else if (kind === 'file') {
    const f = input.file; name = f.name; bytes = f.size; kind = detect(f);
    if (!kind) throw new SrcError('Knowvia cannot read "' + f.name + '" yet. It reads PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), EPUB, text, Markdown, CSV and web pages (.html).', 'type');
    if (f.size > LIMIT_MB * 1048576) throw new SrcError('This file is ' + Math.round(f.size / 1048576) + ' MB. The limit is ' + LIMIT_MB + ' MB. Split it into smaller parts and add them one at a time.', 'big');
    if (!f.size) throw new SrcError('This file is empty.', 'empty');
    ctx.progress('open', 0.02, 'Opening ' + f.name);
    if (kind === 'text') res = await R.text(await f.text());
    else if (kind === 'web') res = await R.web(await f.text());
    else { const buf = await f.arrayBuffer(); if (cancelled()) throw new Cancelled(); res = await R[kind](buf, ctx); if (kind === 'pdf') keepFile = f; }
    if (f.size > 40 * 1048576) (res.notes = res.notes || []).push(NOTE_TOOBIG);
  } else if (kind === 'text') {
    const t = String(input.text || ''); if (clean(t).length < 40) throw new SrcError('That is too short to learn from. Paste at least a few sentences.', 'empty');
    res = await R.text(t); name = input.title || ''; bytes = t.length; res.title = clean(input.title || '');
  } else if (kind === 'web') {
    url = normUrl(input.url); if (!url) throw new SrcError('That does not look like a web address.', 'url');
    if (ytId(url)) { kind = 'youtube'; }
    else { ctx.progress('open', 0.1, 'Opening the page'); const h = await httpText(url, { headers: { 'Accept': 'text/html,application/xhtml+xml' } }); if (cancelled()) throw new Cancelled(); ctx.progress('read', 0.5, 'Reading the page'); res = await R.web(h, url); bytes = h.length; if (!res.title) res.title = new URL(url).hostname; }
  }
  if (kind === 'youtube') { url = normUrl(input.url); ctx.progress('open', 0.1, 'Asking YouTube for the transcript'); res = await youtube(url, input.lang); bytes = res.units.reduce((a, u) => a + u.t.length, 0); }
  if (cancelled()) throw new Cancelled();
  ctx.progress('clean', 0.86, 'Tidying the text');
  let units = res.units.filter((u) => u && clean(u.t)); if (!units.length) throw new SrcError('Knowvia could not find any readable text in this.', 'empty');
  units = units.map((u, i) => Object.assign({}, u, { n: i + 1, t: clean(u.t) }));
  const chars = units.reduce((a, u) => a + u.t.length, 0); if (chars < 120 && !res.scanned) throw new SrcError('There is almost no readable text here (' + chars + ' characters).', 'empty');
  let chapters = (res.chapters || []).filter((c) => c.from >= 1 && c.from <= units.length).map((c) => ({ title: clean(c.title) || 'Part', from: c.from, to: Math.min(units.length, c.to || c.from), front: !!c.front }));
  chapters.sort((a, b) => a.from - b.from); chapters.forEach((c, i) => { if (i + 1 < chapters.length && c.to >= chapters[i + 1].from) c.to = chapters[i + 1].from - 1; if (i + 1 < chapters.length && c.to < chapters[i + 1].from - 1) c.to = chapters[i + 1].from - 1; });
  if (chapters.length && chapters[0].from > 1) chapters[0].from = 1; if (chapters.length) chapters[chapters.length - 1].to = units.length;
  chapters = chapters.filter((c) => c.to >= c.from).map((c, i) => Object.assign(c, { id: 'c' + (i + 1) }));
  const ttl = clean(res.title) || clean(name).replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').split(/\s*--\s*/)[0].replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim() || (kind === 'text' ? clean(units[0].t.split('\n')[0]).slice(0, 60) : 'Untitled source');
  const ttl2 = /^Google Drive file/.test(ttl) ? (clean((units[0].t || '').split('\n')[0]).replace(/^[#*\s]+/, '').slice(0, 70) || ttl) : ttl;
  const src = { id: sid, v: 2, kind, title: ttl2.slice(0, 120), name, url, addedAt: Date.now(), bytes, units, chapters, notes: res.notes || [], extra: res.extra || null, scanned: !!res.scanned, hasFile: false, stats: { chars, units: units.length, math: units.filter((u) => u.m).length } };
  ctx.progress('save', photoBlobs ? 0.18 : 0.94, 'Saving on this device');
  try {
    if (keepFile) { await Store.putFile(sid, keepFile); src.hasFile = true; }
    if (photoBlobs) { for (let i = 0; i < photoBlobs.length; i++) await Store.putImg(sid, i + 1, photoBlobs[i]); src.hasFile = true; }
  } catch (e) { src.hasFile = false; src.notes.push('There was no room to keep the original file on this device, so pages cannot be read as images later.'); if (photoBlobs) { try { await Store.remove(sid); } catch (e2) { /* ignore */ } throw new SrcError('There is no room on this device to keep the photos. Free some space and try again.', 'nostore'); } }
  const vis = (res.visuals || []).filter((v) => v && v.blob && v.unit >= 1 && v.unit <= units.length);
  if (vis.length) {
    try { for (let i = 0; i < vis.length; i++) await Store.putImg(sid, 'v' + (i + 1), vis[i].blob); src.vis = vis.map((v, i) => ({ id: 'v' + (i + 1), unit: v.unit, alt: v.alt || '', w: v.w, h: v.h, bytes: v.blob.size })); }
    catch (e) { src.vis = []; src.notes = (src.notes || []).filter((n) => !/pictures? (was|were) kept/.test(n)); src.notes.push('There was no room to keep the pictures on this device, so only the text was kept.'); try { await Store.removeImgs(sid, 'v'); } catch (e2) { /* ignore */ } }
  }
  await Store.put(src);
  if (photoBlobs) {
    try {
      await readPages(sid, units.map((u) => u.n), { signal: ctx.signal, onProgress: (p) => ctx.progress('read', 0.2 + 0.7 * p.frac, p.msg, p.eta) });
      const fresh = await Store.get(sid), first = (fresh.units.find((u) => u.v && !u.e) || {}).t || '', line = clean(first.split('\n')[0]).replace(/^[#*\s]+/, '').slice(0, 60);
      if (line.length > 3) { fresh.title = 'Photos: ' + line; await Store.put(fresh); }
      return fresh;
    } catch (e) { try { await Store.remove(sid); } catch (e2) { /* ignore */ } throw e; }
  }
  ctx.progress('index', 0.98, 'Preparing search'); buildIndex(src);
  ctx.progress('done', 1, 'Ready');
  return src;
}

/* ---------------- Stage two: reading pages as images with a cloud model ---------------- */
const DOCS = new Map();
async function pdfDoc(srcId) {
  if (DOCS.has(srcId)) return DOCS.get(srcId);
  const f = await Store.getFile(srcId); if (!f) throw new SrcError('The original PDF is not stored on this device, so its pages cannot be read as images. Open the source and press Add the PDF again.', 'nofile');
  const lib = await getPdf(), buf = await f.arrayBuffer();
  let doc; try { doc = await lib.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false }).promise; } catch (e) { throw new SrcError('The stored PDF could not be opened again.', 'bad'); }
  DOCS.set(srcId, doc); return doc;
}
function closeDoc(srcId) { const d = DOCS.get(srcId); if (d) { try { d.destroy(); } catch (e) { /* ignore */ } DOCS.delete(srcId); } }
const blobUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('read')); r.readAsDataURL(b); });
async function renderPdfPage(doc, no, width, q) {
  const pg = await doc.getPage(no), v1 = pg.getViewport({ scale: 1 });
  const scale = Math.max(0.6, Math.min(2.6, (width || 1400) / v1.width, 2300 / v1.height)), vp = pg.getViewport({ scale });
  const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
  const cx = cv.getContext('2d', { alpha: false }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: cx, viewport: vp }).promise; pg.cleanup();
  const url = cv.toDataURL('image/jpeg', q || 0.76); cv.width = cv.height = 0; return url;
}
async function shrinkImage(file, max) {
  max = max || 1600; let bmp = null;
  try { bmp = await createImageBitmap(file); } catch (e) { bmp = null; }
  if (!bmp) { bmp = await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new SrcError('"' + (file.name || 'A photo') + '" could not be opened as a picture.', 'bad')); }; im.src = u; }); }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  const cx = cv.getContext('2d', { alpha: false }); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close();
  return await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new SrcError('A photo could not be prepared.', 'bad'))), 'image/jpeg', 0.8));
}
async function pageImage(srcId, n, width) {
  const src = await Store.get(srcId); if (!src) throw new SrcError('This source is not on this device.', 'bad');
  if (src.kind === 'photo') { const b = await Store.getImg(srcId, n); if (!b) throw new SrcError('This photo is not stored any more.', 'nofile'); return blobUrl(b); }
  return renderPdfPage(await pdfDoc(srcId), (src.units[n - 1] || {}).pg || n, width || 1000, 0.8);
}
async function unitImage(src, n) { return src.kind === 'photo' ? blobUrl(await Store.getImg(src.id, n)) : renderPdfPage(await pdfDoc(src.id), (src.units[n - 1] || {}).pg || n, 1400, 0.76); }
const needsRead = (src, u) => !!u && !u.v && (u.m || (u.e && (src.scanned || src.kind === 'photo')));

/* which connected cloud models can see pictures: Gemini first (free and strong at maths), then the others */
const vision = {
  candidates() {
    const a = window.KVApp; if (!a || !a.cloudCfg || !a.S || !a.S.tutor) return []; const out = [], P = a.PROV || {};
    const pick = (p) => {
      const c = a.cloudCfg(p), ms = c.models || [], has = (re, ex) => ms.find((m) => re.test(m) && !(ex && ex.test(m)));
      if (p === 'gemini') return has(/gemini-2\.5-flash$/) || has(/gemini-3[\w.-]*flash/, /lite|image|tts|live/) || has(/flash/, /lite|image|tts|live|thinking/) || (/gemini/i.test(c.model || '') ? c.model : 'gemini-2.5-flash');
      if (p === 'openrouter') return has(/(vl|vision|gemma-3|llama-4|pixtral|gemini|mistral-small-3)/i);
      if (p === 'groq') return has(/llama-4|scout|maverick/i);
      if (p === 'grok') return has(/vision|grok-4/i) || (/vision|grok-4/i.test(c.model || '') ? c.model : '');
      return c.model || '';
    };
    ['gemini', 'openrouter', 'groq', 'grok', 'custom'].forEach((p) => { const c = a.cloudCfg(p); if (!(c.key || (p === 'custom' && c.base))) return; const m = pick(p); if (m) out.push({ k: 'cloud', p, m, name: (P[p] && P[p].name) || p }); });
    return out;
  },
  info() { const c = this.candidates(); return c.length ? { ok: true, name: c[0].name, model: c[0].m, count: c.length } : { ok: false }; }
};
const VISION_SYS = 'You copy pages of textbooks and notes into plain text for a study app. Rules:\n- Copy the text exactly, in reading order. Keep headings, numbering and labels such as Example 3, Exercise 4.2, Q.5, (a) (b).\n- Write all maths as plain Unicode text that reads naturally: x², x₁, √x, ∫₀¹ x dx, Σ, π, θ, ≤, ≥, ≠, ∈, ∞, fractions like (a + b)/(c − d). Put each matrix or determinant row on its own line in brackets, like [ 1  2 ] then [ 3  4 ]. Put each table row on one line with " | " between cells.\n- For a figure, graph or diagram write one line: [Figure: what it shows, with every label and value you can read].\n- Leave out running headers, footers and page numbers. Do not solve, explain, translate or add anything. If something cannot be read write [unclear]. If the page is empty write [blank page].\n- Start every page with a line exactly like <<<PAGE 12>>> using the page number you are given, then its text.';
const sleepAbort = (ms, sig) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (sig) sig.addEventListener('abort', () => { clearTimeout(t); rej(new Cancelled()); }, { once: true }); });
function parsePages(out, nums) {
  const map = {}, txt = String(out || '').replace(/```[a-z]*\n?/gi, ''), parts = txt.split(/<<<\s*PAGE\s*(\d+)\s*>>>/i);
  for (let i = 1; i < parts.length; i += 2) { const n = +parts[i], t = clean(parts[i + 1] || ''); if (nums.includes(n) && t && map[n] === undefined) map[n] = t; }
  if (nums.length === 1 && map[nums[0]] === undefined && clean(txt) && parts.length === 1) map[nums[0]] = clean(txt);
  return map;
}
async function askVision(cand, nums, imgs, ctx) {
  const a = window.KVApp, content = [{ type: 'text', text: 'Copy ' + (nums.length === 1 ? 'this page' : 'these ' + nums.length + ' pages, in order') + '. Page numbers: ' + nums.join(', ') + '.' }];
  imgs.forEach((u, i) => { content.push({ type: 'text', text: 'Page ' + nums[i] + ':' }); content.push({ type: 'image_url', image_url: { url: u } }); });
  const msgs = [{ role: 'system', content: VISION_SYS }, { role: 'user', content }], waits = [7000, 22000, 50000];
  for (let t = 0; ; t++) {
    try { return parsePages(await a.llm(msgs, { noswitch: true, model: cand, max: 2400 * nums.length + 1200, temp: 0.1, signal: ctx.signal, fast: true }), nums); }
    catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'Cancelled')) throw e;
      const m = String((e && e.message) || ''), limit = /HTTP (429|503|500|502|504)/.test(m) || /rate|quota|overload|busy|exhaust/i.test(m);
      if (limit && t < waits.length) { if (ctx.onProgress) ctx.onProgress({ frac: ctx.frac || 0, msg: 'The model asked for a short pause (' + cand.name + '). Waiting ' + Math.round(waits[t] / 1000) + ' seconds', eta: 0 }); await sleepAbort(waits[t], ctx.signal); continue; }
      const err = new SrcError(limit ? 'The free limit of ' + cand.name + ' was reached.' : /HTTP 4\d\d/.test(m) ? cand.name + ' could not read the page images (' + m.slice(0, 160) + ').' : 'The cloud model could not be reached.', limit ? 'quota' : 'vis'); err.net = !limit && !/HTTP/.test(m); throw err;
    }
  }
}
async function readPages(srcId, nums, ctx) {
  ctx = ctx || {}; const src = await Store.get(srcId); if (!src) throw new SrcError('This source is not on this device.', 'bad');
  const cands = vision.candidates(); if (!cands.length) throw new SrcError('Reading pages as images needs a cloud model that can see images. Gemini has a free plan that works well: connect it in Me.', 'novision');
  if (!src.hasFile) throw new SrcError('The original file is not stored on this device, so its pages cannot be read as images. Open the source and press Add the PDF again.', 'nofile');
  const todo = Array.from(new Set(nums)).filter((n) => src.units[n - 1] && !src.units[n - 1].v).sort((a, b) => a - b); if (!todo.length) return { read: 0, failed: 0 };
  const B = 2, W = todo.length > 2 ? 2 : 1, t0 = Date.now(); let done = 0, ci = 0, failed = 0, lastSave = 0, lastErr = null, next = 0, stop = null; const rep = (msg) => { if (!ctx.onProgress) return; const el = (Date.now() - t0) / 1000, rate = done / Math.max(1, el); ctx.onProgress({ frac: done / todo.length, msg, eta: done ? Math.round((todo.length - done) / rate) : 0, done, total: todo.length }); };
  const save = async () => { src.stats.chars = src.units.reduce((s, u) => s + u.t.length, 0); src.stats.math = src.units.filter((u) => u.m).length; src.stats.read = src.units.filter((u) => u.v).length; IDX.delete(srcId); await Store.put(src); };
  const groups = []; for (let i = 0; i < todo.length; i += B) groups.push(todo.slice(i, i + B));
  /* two groups are read at the same time, so a page does not wait for the one before it */
  const worker = async () => {
    while (!stop) {
      if (ctx.signal && ctx.signal.aborted) throw new Cancelled();
      const gi = next++; if (gi >= groups.length) return; const grp = groups[gi];
      rep('Reading ' + (grp.length === 1 ? src.units[grp[0] - 1].cite : src.units[grp[0] - 1].cite + ' to ' + src.units[grp[grp.length - 1] - 1].cite) + ' (' + Math.min(todo.length, done + 1) + ' of ' + todo.length + ')');
      const imgs = []; for (const n of grp) imgs.push(await unitImage(src, n));
      let got = null; ctx.frac = done / todo.length;
      while (ci < cands.length && !got) { try { got = await askVision(cands[ci], grp, imgs, ctx); } catch (e) { if (e && (e.name === 'AbortError' || e.name === 'Cancelled')) throw e; lastErr = e; if (e.net) throw e; ci++; } }
      if (!got) throw lastErr || new SrcError('No connected cloud model could read the pages.', 'vis');
      for (let g = 0; g < grp.length; g++) if (got[grp[g]] === undefined && grp.length > 1) { try { const one = await askVision(cands[Math.min(ci, cands.length - 1)], [grp[g]], [imgs[g]], ctx); if (one[grp[g]] !== undefined) got[grp[g]] = one[grp[g]]; } catch (e) { if (e && (e.name === 'AbortError' || e.name === 'Cancelled')) throw e; } }
      grp.forEach((n) => {
        const u = src.units[n - 1], t = got[n]; if (t === undefined) { failed++; return; }
        if (/^\[?\(?blank( page)?\)?\]?\.?$/i.test(t)) { u.t = '(This page is blank.)'; u.e = 1; } else { u.t = t; u.e = 0; } u.v = 1; u.m = 0; done++;
      });
      if (done - lastSave >= 6) { lastSave = done; await save(); }
      rep(done + ' of ' + todo.length + ' pages read');
    }
  };
  try {
    const ws = []; for (let w = 0; w < W; w++) ws.push(worker().catch((e) => { stop = stop || e; }));
    await Promise.all(ws); if (stop) throw stop;
  } finally { closeDoc(srcId); try { if (done) { await save(); buildIndex(src); } } catch (e) { /* ignore */ } }
  return { read: done, failed };
}
async function attachFile(srcId, file) {
  const src = await Store.get(srcId); if (!src || src.kind !== 'pdf') throw new SrcError('This source is not a PDF.', 'bad');
  const lib = await getPdf(); let doc; try { doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, isEvalSupported: false }).promise; } catch (e) { throw new SrcError('This file could not be opened as a PDF.', 'bad'); }
  const n = doc.numPages; try { doc.destroy(); } catch (e) { /* ignore */ }
  if (n !== src.units.length) throw new SrcError('This PDF has ' + n + ' pages but your source has ' + src.units.length + '. Choose the same PDF you added before.', 'bad');
  await Store.putFile(srcId, file); src.hasFile = true; closeDoc(srcId); await Store.put(src); return src;
}

/* ---------------- Search: a compact BM25 index, built on this device, works offline ---------------- */
const STOP = new Set('the and for that this with from are was were been have has had not but you your they them their its into than then also can may will would could should about which what when where who whom how why all any each other such only own same too very just over under again once here there out off per via etc one two let find show prove given using use used'.split(' '));
const stem = (w) => { w = w.replace(/ices$/, 'ix').replace(/ication$/, 'y').replace(/ied$|ies$/, 'y'); return w.length > 5 ? w.replace(/(ations?|ings?|ing|ed|es|s)$/, '') : (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w); };
const tok = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
const IDX = new Map();
function buildIndex(src) {
  const chunks = [];
  src.units.forEach((u, i) => { if (u.e) return; const parts = u.t.length > 1100 ? chunkParas(u.t.split(/\n{1,2}/), 800) : [u.t]; parts.forEach((p) => chunks.push({ u: i, t: p })); });
  const docs = chunks.map((c) => { const tf = Object.create(null); let n = 0; tok(c.t).forEach((w) => { tf[w] = (tf[w] || 0) + 1; n++; }); return { tf, n }; });
  const df = Object.create(null); docs.forEach((d) => { for (const w in d.tf) df[w] = (df[w] || 0) + 1; });
  const avg = docs.reduce((a, d) => a + d.n, 0) / Math.max(1, docs.length);
  const fr = src.chapters.find((c) => c.front), ix = { chunks, docs, df, avg, N: docs.length, front: fr ? fr.to : 0 }; IDX.set(src.id, ix); return ix;
}
async function search(srcId, query, o) {
  o = o || {}; const src = await Store.get(srcId); if (!src) return [];
  const ix = IDX.get(srcId) || buildIndex(src), qs = Array.from(new Set(tok(query))); if (!qs.length) return [];
  const lo = o.from || 1, hi = o.to || src.units.length, sc = [];
  ix.docs.forEach((d, i) => {
    const ui = ix.chunks[i].u + 1; if (ui < lo || ui > hi) return; let s = 0;
    qs.forEach((w) => { const f = d.tf[w]; if (!f) return; const idf = Math.log(1 + (ix.N - ix.df[w] + 0.5) / (ix.df[w] + 0.5)); s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.n / ix.avg)); });
    if (s > 0) sc.push({ s: s * (ix.front && ui <= ix.front ? 0.5 : 1), i });
  });
  sc.sort((a, b) => b.s - a.s); const out = [], seen = new Set();
  for (const r of sc) { const c = ix.chunks[r.i], u = src.units[c.u]; const k = c.u + ':' + c.t.slice(0, 40); if (seen.has(k)) continue; seen.add(k); out.push({ n: u.n, cite: u.cite, text: c.t, score: r.s, math: !!u.m, s: u.s }); if (out.length >= (o.k || 5)) break; }
  return out;
}
const unitText = async (srcId, from, to) => { const s = await Store.get(srcId); if (!s) return ''; return s.units.slice(from - 1, to).map((u) => '[' + u.cite + ']\n' + u.t).join('\n\n'); };

/* ---------------- Pictures kept from a source: show them, describe them (cloud, only when asked) ---------------- */
const VURL = new Map();
async function visBlob(srcId, vid) { return Store.getImg(srcId, vid); }
async function visUrl(srcId, vid) {
  const k = srcId + ':' + vid; if (VURL.has(k)) return VURL.get(k);
  const b = await visBlob(srcId, vid); if (!b) return ''; const u = URL.createObjectURL(b); VURL.set(k, u); return u;
}
async function visData(srcId, vid) { const b = await visBlob(srcId, vid); return b ? blobUrl(b) : ''; }
const visIn = (src, from, to) => (src.vis || []).filter((v) => v.unit >= from && v.unit <= to);
const visLabel = (src, v) => { const u = src.units[v.unit - 1]; return u ? u.cite : 'this source'; };
const visCaption = (src, v) => { const t = clean(v.desc || v.alt || ''); return t.length >= 12 ? t.slice(0, 300) : 'A picture from ' + visLabel(src, v) + ' of your source.'; };
const DESC_SYS = 'You describe pictures from study material for a learner and for a tutor who cannot see them. For every picture write 1 or 2 plain sentences, under 280 characters, that say what it shows. Include any title, labels, numbers, axis names or steps you can actually read. If it is a chart, say what is compared and the main pattern. If it is a decorative photo or logo, say so in a few words. Never guess at things you cannot see. Reply in exactly this form, one block per picture, and nothing else:\n<<<PIC v1>>>\ndescription\n<<<PIC v2>>>\ndescription';
async function describeVisuals(srcId, vids, ctx) {
  ctx = ctx || {}; const src = await Store.get(srcId); if (!src) throw new SrcError('This source is not on this device.', 'bad');
  const cands = vision.candidates(); if (!cands.length) throw new SrcError('Describing pictures needs a cloud model that can see images. Gemini has a free plan that works well: connect it in Me.', 'novision');
  const todo = (src.vis || []).filter((v) => vids.includes(v.id) && !v.desc); let done = 0, ci = 0, lastErr = null;
  for (let i = 0; i < todo.length; i += 3) {
    if (ctx.signal && ctx.signal.aborted) throw new Cancelled();
    const grp = todo.slice(i, i + 3); if (ctx.onProgress) ctx.onProgress({ msg: 'Looking at ' + (grp.length === 1 ? 'picture ' + (i + 1) : 'pictures ' + (i + 1) + ' to ' + (i + grp.length)) + ' of ' + todo.length, frac: done / todo.length });
    const content = [{ type: 'text', text: 'Describe these ' + grp.length + ' picture' + (grp.length > 1 ? 's' : '') + '.' }];
    for (const v of grp) { content.push({ type: 'text', text: 'Picture ' + v.id + (v.alt ? ' (its author labelled it: ' + v.alt.slice(0, 120) + ')' : '') + ':' }); content.push({ type: 'image_url', image_url: { url: await visData(srcId, v.id) } }); }
    let out = null;
    while (ci < cands.length && out === null) {
      try { out = String(await window.KVApp.llm([{ role: 'system', content: DESC_SYS }, { role: 'user', content }], { noswitch: true, model: cands[ci], max: 900, temp: 0.1, signal: ctx.signal, fast: true })); }
      catch (e) { if (e && (e.name === 'AbortError' || e.name === 'Cancelled')) throw e; lastErr = e; ci++; }
    }
    if (out === null) throw new SrcError('No connected cloud model could look at the pictures' + (lastErr && lastErr.message ? ' (' + String(lastErr.message).slice(0, 120) + ')' : '') + '.', 'vis');
    const parts = out.replace(/```[a-z]*\n?/gi, '').split(/<<<\s*PIC\s*(v\d+)\s*>>>/i);
    for (let k = 1; k < parts.length; k += 2) { const v = grp.find((x) => x.id === parts[k].toLowerCase()), t = clean(parts[k + 1] || ''); if (v && t.length > 8) { v.desc = t.slice(0, 320); done++; } }
    await Store.put(src);
  }
  return { described: done, asked: todo.length };
}

window.KVSources = { http: httpText, httpBlob, drive: { parse: driveParse, url: driveUrl, sniff: sniffExt },  visUrl, visData, visIn, visCaption, visLabel, describeVisuals, KINDS, ACCEPT, LIMIT_MB, Store, ingest, search, unitText, readPages, vision, pageImage, attachFile, needsRead, youtube: { id: ytId, mmss }, errors: { Cancelled, SrcError }, detect, tools: { unzip, clean, tok, mathScore, buildIndex }, native };
})();
