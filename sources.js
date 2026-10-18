/* Sources engine: reads files, links and pasted text into clean "units" (pages, slides, parts), finds chapters,
   keeps them on this device, and finds the best passages for a question. Nothing here needs the internet except web links and YouTube. */
(function () {
'use strict';
const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const KINDS = {
  pdf: { name: 'PDF', unit: 'page' }, docx: { name: 'Word document', unit: 'section' }, pptx: { name: 'PowerPoint', unit: 'slide' }, xlsx: { name: 'Excel sheet', unit: 'rows' },
  epub: { name: 'EPUB book', unit: 'section' }, text: { name: 'Text', unit: 'part' }, web: { name: 'Website', unit: 'part' }, youtube: { name: 'YouTube video', unit: 'time' }
};
const EXT = { pdf: 'pdf', docx: 'docx', pptx: 'pptx', xlsx: 'xlsx', epub: 'epub', txt: 'text', md: 'text', markdown: 'text', csv: 'text', tsv: 'text', json: 'text', html: 'web', htm: 'web', rtf: 'text', log: 'text' };
const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.epub,.txt,.md,.csv,.html,.htm,.json';
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
  async remove(id) { try { await idb('readwrite', (st) => st.delete(id)); } catch (e) { /* ignore */ } cache.delete(id); IDX.delete(id); listWrite(listRead().filter((x) => x.id !== id)); }
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

R.docx = async (buf) => {
  const z = await unzip(buf), x = await z.text('word/document.xml'); if (!x) throw new SrcError('This Word file has no document text. It may be an older .doc file; save it as .docx and try again.', 'bad');
  const d = xml(x), body = d.getElementsByTagNameNS('*', 'body')[0]; if (!body) throw new SrcError('This Word file has no readable text.', 'empty');
  const paras = [], heads = []; let docTitle = '';
  const ptext = (p) => { let s = ''; p.querySelectorAll ? null : null; const walk = (n) => { for (const c of Array.from(n.childNodes)) { const ln = c.localName; if (ln === 't') s += c.textContent; else if (ln === 'tab') s += ' '; else if (ln === 'br' || ln === 'cr') s += '\n'; else if (c.childNodes && ln !== 'instrText') walk(c); } }; walk(p); return s; };
  const doP = (p) => {
    const t = clean(ptext(p)); if (!t) return;
    const st = byTag(p, '', 'pStyle')[0], sv = st ? (st.getAttribute('w:val') || st.getAttribute('val') || '') : '';
    const m = sv.match(/^(?:heading|Heading|Title)\s*([1-3])?$/);
    if (m && /^title$/i.test(sv)) { paras.push('\n' + t); if (!docTitle) docTitle = t; } else if (m) { paras.push('\n' + t); heads.push({ t, lvl: +(m[1] || 1), idx: paras.length - 1 }); } else paras.push(byTag(p, '', 'numPr').length ? '• ' + t : t);
  };
  Array.from(body.childNodes).forEach((c) => {
    if (c.localName === 'p') doP(c);
    else if (c.localName === 'tbl') byTag(c, '', 'tr').forEach((tr) => { const cells = byTag(tr, '', 'tc').map((tcl) => clean(byTag(tcl, '', 'p').map(ptext).join(' '))); if (cells.some(Boolean)) paras.push(cells.join(' | ')); });
  });
  const units = chunkParas(paras, 2600).map((x2, i) => ({ t: x2, cite: 'section ' + (i + 1) }));
  const lvl = heads.some((h) => h.lvl === 1) ? 1 : 2, chapters = [];
  heads.filter((h) => h.lvl <= lvl).forEach((h) => { const i = units.findIndex((u) => u.t.includes(h.t)); if (i >= 0 && !chapters.some((c) => c.from === i + 1)) chapters.push({ title: h.t.slice(0, 90), from: i + 1, to: i + 1 }); });
  const notes = []; if (z.names.some((n) => /^word\/media\//.test(n))) notes.push('This document has pictures. Knowvia reads the text only, so pictures and diagrams are not included.');
  const ti = await z.text('docProps/core.xml'); let title = ''; if (ti) { const t = xml(ti).getElementsByTagNameNS('*', 'title')[0]; title = t ? clean(t.textContent) : ''; }
  return { title: title || docTitle, units, chapters, notes };
};

R.pptx = async (buf) => {
  const z = await unzip(buf), sl = z.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  if (!sl.length) throw new SrcError('This PowerPoint file has no slides Knowvia can read. If it is an old .ppt file, save it as .pptx and try again.', 'bad');
  const units = [], titles = [], notes = []; let pics = 0, empty = 0;
  for (let i = 0; i < sl.length; i++) {
    const d = xml(await z.text(sl[i])), lines = []; let title = '';
    byTag(d, '', 'sp').forEach((sp) => {
      const ph = byTag(sp, '', 'ph')[0], isTitle = ph && /title|ctrTitle/i.test(ph.getAttribute('type') || '');
      const t = byTag(sp, '', 'p').map((p) => clean(byTag(p, '', 't').map((x) => x.textContent).join(''))).filter(Boolean);
      if (isTitle && t.length && !title) title = t.join(' '); else lines.push(...t);
    });
    byTag(d, '', 'tr').forEach((tr) => { const cells = byTag(tr, '', 'tc').map((c) => clean(byTag(c, '', 't').map((x) => x.textContent).join(' '))); if (cells.some(Boolean)) lines.push(cells.join(' | ')); });
    pics += byTag(d, '', 'pic').length;
    const num = +sl[i].match(/(\d+)\.xml$/)[1], nx = await z.text('ppt/notesSlides/notesSlide' + num + '.xml');
    let note = ''; if (nx) note = clean(byTag(xml(nx), '', 't').map((x) => x.textContent).join(' ')).replace(/^\d+\s*$/, '');
    const t = (title ? title + '\n' : '') + lines.join('\n') + (note && note.length > 5 ? '\nSpeaker notes: ' + note : '');
    if (clean(t).length < 8) empty++;
    units.push({ t: clean(t) || '(This slide has no text. It may be only a picture.)', cite: 'slide ' + (i + 1) }); titles.push(title);
  }
  if (pics) notes.push('This deck has ' + pics + ' picture' + (pics > 1 ? 's' : '') + '. Knowvia reads the words only, so images and diagrams are not included.');
  if (empty > sl.length * 0.4) notes.push('Many slides have almost no text, so the course made from them may be thin. Pictures are not read.');
  const chapters = groupChapters(units.length, units.length > 40 ? 10 : 6, (a, b) => (titles[a - 1] || 'Slides ' + a + ' to ' + b) + (a === b ? '' : ''));
  return { title: titles.find(Boolean) || '', units, chapters: units.length > 8 ? chapters : [], notes };
};

R.xlsx = async (buf) => {
  const z = await unzip(buf), wb = await z.text('xl/workbook.xml'); if (!wb) throw new SrcError('This Excel file has no sheets Knowvia can read. If it is an old .xls file, save it as .xlsx and try again.', 'bad');
  const rels = await z.text('xl/_rels/workbook.xml.rels'), relMap = {}; if (rels) byTag(xml(rels), '', 'Relationship').forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const ss = []; const sx = await z.text('xl/sharedStrings.xml'); if (sx) byTag(xml(sx), '', 'si').forEach((si) => ss.push(clean(byTag(si, '', 't').map((t) => t.textContent).join(''))));
  const sheets = byTag(xml(wb), '', 'sheet').map((s) => ({ name: s.getAttribute('name'), rid: s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id') }));
  const units = [], chapters = [], notes = []; let rowsTotal = 0, cut = false;
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
    if (cut) break;
  }
  if (!units.length) throw new SrcError('These sheets are empty.', 'empty');
  if (cut) notes.push('This workbook is very large, so only the first 15,000 rows were read.');
  notes.push('Excel files are read as tables of text. Formulas show their last saved results, and charts are not included.');
  return { title: '', units, chapters, notes };
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
  if (sparse > n * 0.5) throw new SrcError('This PDF looks like scanned pictures of pages, with almost no readable text. Reading scanned pages needs the page-image reader, which is coming in the next stage. For now, use a PDF with real text, or copy the text and use Copied text.', 'scanned');
  if (sparse > n * 0.1) notes.push(sparse + ' pages have little or no text. They may be pictures, which Knowvia does not read yet.');
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
  if (math) notes.push(math + ' of ' + n + ' pages contain maths or symbols that a text reader garbles (for example matrices and fractions). Knowvia shows those pages with a warning. Reading them as page images is coming in the next stage.');
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
  const want = (prefLang || 'en').toLowerCase(), pick = found.tracks.find((t) => t.languageCode.toLowerCase() === want && t.kind !== 'asr') || found.tracks.find((t) => t.languageCode.toLowerCase().startsWith(want) && t.kind !== 'asr') || found.tracks.find((t) => t.languageCode.toLowerCase().startsWith(want)) || found.tracks.find((t) => t.kind !== 'asr') || found.tracks[0];
  let segs = null; const base = pick.baseUrl.replace(/&fmt=[^&]*/, '');
  try { segs = parseCaptionJson(await httpText(base + '&fmt=json3', { headers: { 'User-Agent': ctxs[1].ua } })); } catch (e) { segs = null; }
  if (!segs || !segs.length) { try { segs = parseCaptionXml(await httpText(base, { headers: { 'User-Agent': ctxs[1].ua } })); } catch (e) { segs = null; } }
  if (!segs || !segs.length) throw new SrcError('YouTube gave the caption list but no caption text. Paste the transcript using Copied text instead.', 'yt');
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
  let kind = input.kind, res, name = '', url = '', bytes = 0;
  if (kind === 'file') {
    const f = input.file; name = f.name; bytes = f.size; kind = detect(f);
    if (!kind) throw new SrcError('Knowvia cannot read "' + f.name + '" yet. It reads PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), EPUB, text, Markdown, CSV and web pages (.html).', 'type');
    if (f.size > LIMIT_MB * 1048576) throw new SrcError('This file is ' + Math.round(f.size / 1048576) + ' MB. The limit is ' + LIMIT_MB + ' MB. Split it into smaller parts and add them one at a time.', 'big');
    if (!f.size) throw new SrcError('This file is empty.', 'empty');
    ctx.progress('open', 0.02, 'Opening ' + f.name);
    if (kind === 'text') res = await R.text(await f.text());
    else if (kind === 'web') res = await R.web(await f.text());
    else { const buf = await f.arrayBuffer(); if (cancelled()) throw new Cancelled(); res = await R[kind](buf, ctx); }
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
  const chars = units.reduce((a, u) => a + u.t.length, 0); if (chars < 120) throw new SrcError('There is almost no readable text here (' + chars + ' characters).', 'empty');
  let chapters = (res.chapters || []).filter((c) => c.from >= 1 && c.from <= units.length).map((c) => ({ title: clean(c.title) || 'Part', from: c.from, to: Math.min(units.length, c.to || c.from), front: !!c.front }));
  chapters.sort((a, b) => a.from - b.from); chapters.forEach((c, i) => { if (i + 1 < chapters.length && c.to >= chapters[i + 1].from) c.to = chapters[i + 1].from - 1; if (i + 1 < chapters.length && c.to < chapters[i + 1].from - 1) c.to = chapters[i + 1].from - 1; });
  if (chapters.length && chapters[0].from > 1) chapters[0].from = 1; if (chapters.length) chapters[chapters.length - 1].to = units.length;
  chapters = chapters.filter((c) => c.to >= c.from).map((c, i) => Object.assign(c, { id: 'c' + (i + 1) }));
  const ttl = clean(res.title) || clean(name).replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').split(/\s*--\s*/)[0].replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim() || (kind === 'text' ? clean(units[0].t.split('\n')[0]).slice(0, 60) : 'Untitled source');
  const src = { id: uid(), v: 1, kind, title: ttl.slice(0, 120), name, url, addedAt: Date.now(), bytes, units, chapters, notes: res.notes || [], extra: res.extra || null, stats: { chars, units: units.length, math: units.filter((u) => u.m).length } };
  ctx.progress('save', 0.94, 'Saving on this device'); await Store.put(src);
  ctx.progress('index', 0.98, 'Preparing search'); buildIndex(src);
  ctx.progress('done', 1, 'Ready');
  return src;
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

window.KVSources = { KINDS, ACCEPT, LIMIT_MB, Store, ingest, search, unitText, youtube: { id: ytId, mmss }, errors: { Cancelled, SrcError }, detect, tools: { unzip, clean, tok, mathScore, buildIndex }, native };
})();
