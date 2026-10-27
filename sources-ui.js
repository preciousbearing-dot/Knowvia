/* Sources screens: the picker (File, YouTube link, Website, Copied text), the import progress, the source page,
   the page reader, chapter lessons written on demand, and answers that cite pages. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp, K = () => window.KVSources;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IC = {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  yt: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="M10.5 9.5v5l4-2.5z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  clip: '<rect x="6" y="5" width="12" height="16" rx="2.5"/><path d="M9.5 5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 15h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  photo: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.4"/><path d="M8.5 7l1.2-2h4.6l1.2 2"/>',
  drive: '<path d="M8 4h8l5 9-4 7H7l-4-7z"/><path d="M8 4l5 9M16 4l-5 9M3 13h18"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'
};
const ic = (d, s, w) => A().ic(d, s, w);
const KIND_ICO = { pdf: IC.file, docx: IC.file, pptx: IC.file, xlsx: IC.file, epub: IC.file, text: IC.clip, web: IC.link, youtube: IC.yt, photo: IC.photo };
const kname = (k) => (K().KINDS[k] || { name: 'Source' }).name;
const ago = (t) => { const d = Math.round((Date.now() - t) / 60000); if (d < 2) return 'just now'; if (d < 60) return d + ' minutes ago'; const h = Math.round(d / 60); if (h < 24) return h + ' hours ago'; const dd = Math.round(h / 24); return dd < 2 ? 'yesterday' : dd + ' days ago'; };
const num = (n) => Number(n).toLocaleString('en-US');
const unitWord = (k, n) => ({ pdf: 'page', pptx: 'slide', xlsx: 'block', youtube: 'segment', photo: 'photo' }[k] || 'section') + (n === 1 ? '' : 's');
const mb = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const etaTxt = (s) => { s = +s || 0; if (!s) return ''; if (s < 90) return 'about ' + s + ' seconds left'; const m = Math.round(s / 60); return 'about ' + m + ' minutes left'; };

/* ---------------- Packs made from sources ---------------- */
const packIdOf = (srcId) => 'src-' + srcId;
function windows(src, from, to) {
  const out = []; let a = from, chars = 0; const cap = src.scanned || src.kind === 'photo' ? 6 : 12;
  for (let i = from; i <= to; i++) {
    const u = src.units[i - 1], len = u.t.length;
    if (i > a && (chars + len > 12000 || i - a >= cap)) { out.push([a, i - 1]); a = i; chars = 0; }
    chars += len;
  }
  if (a <= to) out.push([a, to]);
  return out;
}
const span = (src, a, b) => { const x = src.units[a - 1].cite, y = src.units[b - 1].cite; return a === b ? x : x + ' to ' + y; };
const P = () => window.KVProfile;
function makePack(src, mode) {
  const whole = mode === 'summary' || mode === 'keyideas', chs = (src.chapters || []).filter((c) => !c.front), list = whole ? [{ title: mode === 'summary' ? 'Summary' : 'Key ideas', from: 1, to: src.units.length }] : (chs.length ? chs : [{ title: src.title, from: 1, to: src.units.length }]);
  let li = 0;
  const modules = list.map((c, ci) => {
    if (whole) { li++; return { id: 'm1', title: c.title, lessons: [{ id: 'l1', title: c.title, subtitle: span(src, 1, src.units.length), minutes: 4, outcomes: [], body: 'Amani writes a ' + (mode === 'summary' ? 'short summary' : 'list of key ideas') + ' of your source when you prepare it.', src: { from: 1, to: src.units.length }, mode, ready: false }] }; }
    const w = windows(src, c.from, c.to);
    return { id: 'm' + (ci + 1), title: c.title, lessons: w.map((r, k) => { li++; return { id: 'l' + li, title: w.length > 1 ? 'Part ' + (k + 1) + ' of ' + w.length : c.title, subtitle: span(src, r[0], r[1]), minutes: 8, outcomes: [], body: 'This lesson covers **' + span(src, r[0], r[1]) + '** of your source. Amani writes it from your own material when you prepare it.', src: { from: r[0], to: r[1] }, ready: false }; }) };
  });
  const lessons = modules.reduce((a, m) => a + m.lessons.length, 0), mins = Math.round(src.stats.chars / 1100);
  return { formatVersion: 1, id: packIdOf(src.id), title: src.title, subtitle: 'From your own ' + kname(src.kind).toLowerCase() + '. Written by Amani from your material.', level: 'Your source', language: 'en', version: '1.0.0', estimatedHours: Math.max(0.5, Math.round(mins / 6) / 10), outcome: 'Understand and use what is in ' + src.title + '.', author: 'Built by Amani from your own source', origin: 'upload', source: { id: src.id, kind: src.kind, title: src.title }, quality: { researched: false, factChecked: 'Written only from your source text. Check anything important in the original.' }, mode: mode || '', modules, quiz: [], flashcards: [], sources: '# Your source\n\n**' + esc(src.title) + '**\n\n' + kname(src.kind) + ', added ' + new Date(src.addedAt).toDateString() + '.' + (src.url ? '\n\n' + src.url : '') };
}
async function ensurePack(src) {
  const a = A(); let p = a.PACKS.find((x) => x.id === packIdOf(src.id));
  if (!p) { p = makePack(src); await window.KVStore.save(p); a.addPack(p); }
  return p;
}

/* ---------------- Import dialog ---------------- */
const IMP = { kind: '', running: false, err: '', stage: '', frac: 0, msg: '', eta: 0, ctrl: null, hint: '' };
const STAGES_STD = [['open', 'Open it'], ['read', 'Read the content'], ['clean', 'Tidy the text'], ['save', 'Save on this device'], ['index', 'Prepare search']];
const STAGES_PH = [['open', 'Prepare the photos'], ['save', 'Save on this device'], ['read', 'Read the pages with the cloud model'], ['index', 'Prepare search']];
let STAGES = STAGES_STD;
const ov = () => document.getElementById('src-ov');
function closeOv() { const o = ov(); if (o) o.remove(); IMP.running = false; IMP.err = ''; }
function stepper() { const cur = STAGES.findIndex((s) => s[0] === IMP.stage); return `<ul class="of-stages">${STAGES.map(([id, nm], i) => { const st = i < cur || IMP.stage === 'done' ? 'done' : i === cur ? 'now' : 'wait'; return `<li class="${st}">${st === 'done' ? ic(A().I.check, 14, 2.8) : '<i></i>'}${esc(nm)}</li>`; }).join('')}</ul>`; }
function ovBody() {
  const k = IMP.kind;
  if (IMP.running) return `<h3>Adding your source</h3><p class="help" id="imp-msg">${esc(IMP.msg || 'Starting')}</p>${stepper()}<div class="bar"><i id="imp-bar" style="width:${Math.round((IMP.frac || 0) * 100)}%"></i></div><p class="help" id="imp-eta">${Math.round((IMP.frac || 0) * 100)}%${IMP.eta ? ' · ' + etaTxt(IMP.eta) : ''}</p><p class="help">Keep the app open. ${IMP.kind === 'photos' || STAGES === STAGES_PH || /photo/i.test(IMP.msg || '') ? 'Your photos are sent to your cloud model so it can read the pages. They are not shared with anyone else.' : 'Everything is read on this device. Nothing is uploaded.'}</p><div class="row-actions"><button class="btn" data-act="src-cancel">Cancel</button></div>`;
  if (IMP.err) return `<h3>This could not be added</h3><p class="help">${esc(IMP.err)}</p><div class="row-actions"><button class="btn primary" data-act="src-retry">Try again</button>${/cloud model/.test(IMP.err) ? '<button class="btn" data-act="nav" data-r="me">Set up a cloud model</button>' : ''}<button class="btn" data-act="src-close">Close</button></div>`;
  if (k === 'file') return `<h3>Add a file</h3><div class="dropz inset" data-act="src-pick" role="button" tabindex="0"><span class="ico">${ic(IC.file, 28, 1.7)}</span><b>Choose a file</b><span class="s">or drop it here</span></div>
    <p class="help"><b>Works with:</b> PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), EPUB books, text, Markdown, CSV and saved web pages (.html).</p>
    <p class="help">Up to ${K().LIMIT_MB} MB. Big books are fine: Amani works on one chapter at a time. Scanned PDFs and maths pages are read as images by a cloud model that can see pictures (Gemini's free plan works well).</p>
    <input type="file" id="src-file" accept="${K().ACCEPT}" multiple hidden><div class="row-actions"><button class="btn" data-act="src-close">Cancel</button></div>`;
  if (k === 'photos') { const vi = K().vision.info(); return `<h3>Add photos of pages</h3><p class="help">Take or choose one clear photo per page. Lay the page flat, use good light and keep the whole page in the frame. Amani reads them with a cloud model that can see images, including maths.</p>
    ${vi.ok ? `<p class="help"><b>Reader ready:</b> ${esc(vi.name)}.</p>` : `<div class="warnbox"><b>A cloud model is needed.</b> Reading photos uses a cloud model that can see images. Gemini has a free plan: connect it in Me, then come back here.</div>`}
    <div class="dropz inset" data-act="src-pickph" role="button" tabindex="0"><span class="ico">${ic(IC.photo, 28, 1.7)}</span><b>Take or choose photos</b><span class="s">Up to 60 photos at a time</span></div>
    <input type="file" id="src-photos" accept="image/*" multiple hidden><div class="row-actions">${vi.ok ? '' : '<button class="btn primary" data-act="nav" data-r="me">Set up a cloud model</button>'}<button class="btn" data-act="src-close">Cancel</button></div>`; }
  if (k === 'youtube') return `<h3>Add a YouTube video</h3><p class="help">Paste the link. Knowvia reads the video's captions, so it only works on videos that have captions. Amani then summarises it and teaches the lessons in it.</p>
    <div class="field"><label for="src-url">YouTube link</label><input id="src-url" type="url" inputmode="url" placeholder="https://youtu.be/..." autocomplete="off" value="${esc(IMP.hint)}"></div>
    ${K().native ? '' : '<p class="help"><b>Note:</b> your browser cannot fetch captions on its own. This works in the Knowvia Android app and the desktop app. Here, use Copied text: open the video, tap More, then Show transcript, copy it and paste it.</p>'}
    <div class="row-actions"><button class="btn primary" data-act="src-go">Read the captions</button><button class="btn" data-act="src-close">Cancel</button></div>`;
  if (k === 'web') return `<h3>Add a website</h3><p class="help">Paste the address of an article or page. Knowvia reads its main text, without menus and adverts.</p>
    <div class="field"><label for="src-url">Web address</label><input id="src-url" type="url" inputmode="url" placeholder="https://..." autocomplete="off" value="${esc(IMP.hint)}"></div>
    ${K().native ? '' : '<p class="help"><b>Note:</b> your browser is not allowed to open other websites. This works in the Knowvia Android app and the desktop app. Here, use Copied text.</p>'}
    <div class="row-actions"><button class="btn primary" data-act="src-go">Read the page</button><button class="btn" data-act="src-close">Cancel</button></div>`;
  return `<h3>Add copied text</h3><p class="help">Paste notes, an article, a transcript, anything you want to learn from.</p>
    <div class="field"><label for="src-title">Name (optional)</label><input id="src-title" type="text" placeholder="For example: Biology notes" autocomplete="off"></div>
    <div class="field"><label for="src-text">Text</label><textarea id="src-text" rows="8" placeholder="Paste here"></textarea></div>
    <div class="row-actions"><button class="btn primary" data-act="src-go">Add this text</button><button class="btn" data-act="src-close">Cancel</button></div>`;
}
function paintOv() { const o = ov(); if (o) o.querySelector('.ov-card').innerHTML = ovBody(); }
function openOv(kind, hint) {
  IMP.kind = kind; IMP.err = ''; IMP.running = false; IMP.hint = hint || ''; STAGES = kind === 'photos' ? STAGES_PH : STAGES_STD;
  let o = ov(); if (!o) { o = document.createElement('div'); o.id = 'src-ov'; o.className = 'ov'; o.innerHTML = '<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"></div>'; document.body.appendChild(o); }
  paintOv(); const f = o.querySelector('input,textarea'); if (f && f.type !== 'file') setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
}
async function startImport(input) {
  const a = A(); IMP.running = true; IMP.err = ''; IMP.stage = 'open'; IMP.frac = 0; IMP.msg = 'Starting'; IMP.eta = 0; IMP.ctrl = new AbortController(); paintOv();
  const keep = a.S && a.S.sess; void keep;
  try {
    const src = await K().ingest(input, { signal: IMP.ctrl.signal, onProgress: (p) => { IMP.stage = p.stage; IMP.frac = p.frac; IMP.msg = p.msg; IMP.eta = p.eta; const b = document.getElementById('imp-bar'); if (b) { b.style.width = Math.round(p.frac * 100) + '%'; document.getElementById('imp-msg').textContent = p.msg; document.getElementById('imp-eta').textContent = Math.round(p.frac * 100) + '%' + (p.eta ? ' · ' + etaTxt(p.eta) : ''); const cur = STAGES.findIndex((s) => s[0] === p.stage); const lis = ov() && ov().querySelectorAll('.of-stages li'); if (lis && lis.length) lis.forEach((li, i) => { const st = i < cur ? 'done' : i === cur ? 'now' : 'wait'; if (!li.classList.contains(st)) { li.className = st; li.innerHTML = (st === 'done' ? ic(a.I.check, 14, 2.8) : '<i></i>') + esc(STAGES[i][1]); } }); } } });
    const pack = makePack(src); await window.KVStore.save(pack); a.addPack(pack);
    closeOv(); a.toast('Added: ' + src.title); a.go('source/' + src.id);
  } catch (e) {
    if (e && e.name === 'Cancelled') { closeOv(); a.toast('Cancelled'); return; }
    IMP.running = false; IMP.err = (e && e.code && e.message) ? e.message : 'Something went wrong while reading this. ' + ((e && e.message) || ''); paintOv();
  }
}
REG.acts['src-add'] = (t, d) => openOv(d.k);
REG.acts['src-close'] = () => closeOv();
REG.acts['src-cancel'] = () => { if (IMP.ctrl) IMP.ctrl.abort(); };
REG.acts['src-retry'] = () => { IMP.err = ''; paintOv(); };
REG.acts['src-pick'] = () => { const f = document.getElementById('src-file'); if (f) f.click(); };
REG.acts['src-pickph'] = () => { const f = document.getElementById('src-photos'); if (f) f.click(); };
REG.acts['src-go'] = () => {
  const k = IMP.kind;
  if (k === 'text') startImport({ kind: 'text', text: (document.getElementById('src-text') || {}).value, title: (document.getElementById('src-title') || {}).value });
  else { const u = (document.getElementById('src-url') || {}).value; if (!String(u || '').trim()) { A().toast('Paste a link first'); return; } if (k === 'youtube' && !K().youtube.id(/^https?:/i.test(u.trim()) ? u.trim() : 'https://' + u.trim())) { IMP.err = 'This does not look like a YouTube video link. Paste the link from the Share button on the video.'; paintOv(); return; } startImport({ kind: 'web', url: u }); }
};
const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name || '');
document.addEventListener('change', (ev) => {
  const t = ev.target; if (!t || !t.files || !t.files[0]) return;
  if (t.id === 'src-file') { const fs = Array.from(t.files); t.value = ''; if (fs.length > 1 && fs.every(isImg)) { IMP.kind = 'photos'; STAGES = STAGES_PH; startImport({ kind: 'photos', files: fs }); return; } if (fs.length > 1) A().toast('Adding the first file. Add the others one at a time.'); STAGES = isImg(fs[0]) ? STAGES_PH : STAGES_STD; startImport({ kind: 'file', file: fs[0] }); }
  else if (t.id === 'src-photos') { const fs = Array.from(t.files); t.value = ''; STAGES = STAGES_PH; startImport({ kind: 'photos', files: fs }); }
  else if (t.id === 'src-reattach') { const f = t.files[0], id = t.dataset.id; t.value = ''; reattach(id, f); }
});
document.addEventListener('dragover', (ev) => { if (ev.target.closest && ev.target.closest('.dropz')) { ev.preventDefault(); ev.target.closest('.dropz').classList.add('over'); } });
document.addEventListener('dragleave', (ev) => { if (ev.target.closest && ev.target.closest('.dropz')) ev.target.closest('.dropz').classList.remove('over'); });
document.addEventListener('drop', (ev) => { if (ev.target.closest && ev.target.closest('.dropz')) { ev.preventDefault(); const fs = ev.dataTransfer && ev.dataTransfer.files ? Array.from(ev.dataTransfer.files) : []; if (!fs.length) return; if (fs.length > 1 && fs.every(isImg)) { STAGES = STAGES_PH; startImport({ kind: 'photos', files: fs }); } else { STAGES = isImg(fs[0]) ? STAGES_PH : STAGES_STD; startImport({ kind: 'file', file: fs[0] }); } } });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target && ev.target.id === 'src-url') { ev.preventDefault(); REG.acts['src-go'](); } if (ev.key === 'Escape' && ov() && !IMP.running) closeOv(); });

/* ---------------- The Sources screen ---------------- */
function tile(k, ico, t, d, i) { return `<button class="tile raised kv-in" style="--d:${i}" data-act="src-add" data-k="${k}"><span class="ico">${ic(ico, 22, 1.8)}</span><b>${t}</b><span class="s">${d}</span></button>`; }
function srcRow(m) {
  const a = A();
  return `<button class="srcrow raised" data-act="nav" data-r="source/${m.id}"><span class="ico">${ic(KIND_ICO[m.kind] || IC.file, 22, 1.8)}</span><span class="grow"><b>${esc(m.title)}</b><span class="s">${esc(kname(m.kind))} · ${num(m.units)} ${unitWord(m.kind, m.units)}${m.chapters ? ' · ' + m.chapters + ' chapters' : ''} · ${ago(m.addedAt)}</span></span>${ic(a.I.chev, 18, 2)}</button>`;
}
REG.screens.mysources = function () {
  const a = A(), list = K().Store.list();
  return `<div class="page srcs"><div class="lib-top"><h1 class="h-title">Your own sources</h1><p class="lede">Add something you want to learn from. Amani reads it, builds a study path chapter by chapter, and answers from it with page references.</p></div>
    <h2 class="sec-title">Add a source</h2>
    <div class="tiles">${tile('file', IC.file, 'File', 'PDF, Word, PowerPoint, Excel, EPUB, text', 1)}${tile('youtube', IC.yt, 'YouTube link', 'A video that has captions.', 2)}${tile('web', IC.link, 'Website', 'An article or a page.', 3)}${tile('text', IC.clip, 'Copied text', 'Paste notes or any text.', 4)}${tile('photos', IC.photo, 'Photos of pages', 'Camera or gallery. Maths too.', 5)}<div class="tile raised soon kv-in" style="--d:6" aria-disabled="true"><span class="ico">${ic(IC.drive, 22, 1.8)}</span><b>Google Drive</b><span class="s">Coming later</span></div></div>
    <p class="help srcs-soon">Coming later: Google Drive and finding sources on the web.</p>
    <h2 class="sec-title">Your sources</h2>
    ${list.length ? `<div class="srclist">${list.map(srcRow).join('')}</div>` : `<div class="shelf-empty inset">Nothing here yet. Choose one of the options above to add your first source. <b>Your files stay on this device.</b></div>`}
  </div>`;
};
REG.names.mysources = 'Your own sources'; REG.names.source = 'Source';


/* ---------------- Reading pages as images: overlay, confirm, re-attach ---------------- */
const VIS = { running: false, ctrl: null, msg: '', frac: 0, eta: 0, err: '', id: '' };
const vov = () => document.getElementById('vis-ov');
function visPaint() {
  const o = vov(); if (!o) return; const c = o.querySelector('.ov-card');
  if (VIS.err) { c.innerHTML = `<h3>Some pages were not read</h3><p class="help">${esc(VIS.err)}</p><div class="row-actions">${/cloud model/.test(VIS.err) ? '<button class="btn primary" data-act="nav" data-r="me">Set up a cloud model</button>' : ''}<button class="btn" data-act="vis-close">Close</button></div>`; return; }
  c.innerHTML = `<h3>Reading pages as images</h3><p class="help" id="vis-msg">${esc(VIS.msg)}</p><div class="bar"><i id="vis-bar" style="width:${Math.round(VIS.frac * 100)}%"></i></div><p class="help" id="vis-eta">${Math.round(VIS.frac * 100)}%${VIS.eta ? ' · ' + etaTxt(VIS.eta) : ''}</p><p class="help">Pages already read are kept, so you can stop and continue later.</p><div class="row-actions"><button class="btn" data-act="vis-cancel">Stop</button></div>`;
}
function visOpen() { let o = vov(); if (!o) { o = document.createElement('div'); o.id = 'vis-ov'; o.className = 'ov'; o.innerHTML = '<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"></div>'; document.body.appendChild(o); } visPaint(); }
function visClose() { const o = vov(); if (o) o.remove(); VIS.running = false; VIS.err = ''; }
async function visRun(id, nums) {
  const a = A(); if (VIS.running) return; VIS.running = true; VIS.err = ''; VIS.msg = 'Starting'; VIS.frac = 0; VIS.eta = 0; VIS.id = id; VIS.ctrl = new AbortController(); visOpen();
  let res = null;
  try {
    res = await K().readPages(id, nums, { signal: VIS.ctrl.signal, onProgress: (p) => { VIS.frac = p.frac; VIS.msg = p.msg; VIS.eta = p.eta; const b = document.getElementById('vis-bar'); if (b) { b.style.width = Math.round(p.frac * 100) + '%'; document.getElementById('vis-msg').textContent = p.msg; document.getElementById('vis-eta').textContent = Math.round(p.frac * 100) + '%' + (p.eta ? ' · ' + etaTxt(p.eta) : ''); } } });
  } catch (e) {
    VIS.running = false;
    if (e && (e.name === 'Cancelled' || e.name === 'AbortError')) { visClose(); a.toast('Stopped. Pages already read are kept.'); } else { VIS.err = (e && e.code && e.message ? e.message : 'Something went wrong while reading the pages. ' + ((e && e.message) || '')) + (e && e.code === 'quota' ? ' Wait a few minutes and press Read again, or connect another cloud model in Me. Pages already read are kept.' : ''); visPaint(); }
    const r = a.route; if (r.name === 'source' && r.id === id) a.renderScreen(); return;
  }
  visClose(); a.toast(res.read + (res.read === 1 ? ' page' : ' pages') + ' read' + (res.failed ? ', ' + res.failed + ' could not be read' : '')); const r = a.route; if (r.name === 'source' && r.id === id) a.renderScreen();
}
REG.acts['vis-cancel'] = () => { if (VIS.ctrl) VIS.ctrl.abort(); };
REG.acts['vis-close'] = () => visClose();
const estTxt = (n) => { const req = Math.ceil(n / 3), min = Math.max(1, Math.round(req * 12 / 60)); return 'about ' + req + (req === 1 ? ' request' : ' requests') + ' and ' + (min < 2 ? 'a minute or two' : min + ' minutes'); };
REG.acts['vis-readall'] = async (t, d) => {
  const src = await K().Store.get(d.id); if (!src) return; const nums = src.units.filter((u) => K().needsRead(src, u)).map((u) => u.n); if (!nums.length) { A().toast('Nothing left to read'); return; }
  const o = document.createElement('div'); o.className = 'ov'; o.id = 'vis-confirm';
  o.innerHTML = `<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"><h3>Read ${num(nums.length)} ${nums.length === 1 ? 'page' : 'pages'} now?</h3><p class="help">This takes ${estTxt(nums.length)} from your cloud model's free allowance. Free plans limit requests per day.${nums.length > 60 ? ' A big book is best read chapter by chapter, when you open each lesson. That spreads the use out and only reads what you study.' : ''}</p><div class="row-actions"><button class="btn primary" data-act="vis-go" data-id="${esc(d.id)}">Read them</button><button class="btn" data-act="vis-no">Not now</button></div></div>`; document.body.appendChild(o);
};
REG.acts['vis-no'] = () => { const o = document.getElementById('vis-confirm'); if (o) o.remove(); };
REG.acts['vis-go'] = async (t, d) => { const o = document.getElementById('vis-confirm'); if (o) o.remove(); const src = await K().Store.get(d.id); if (src) visRun(d.id, src.units.filter((u) => K().needsRead(src, u)).map((u) => u.n)); };
REG.acts['vis-page'] = (t, d) => visRun(d.id, [+d.n]);
REG.acts['vis-chapter'] = async (t, d) => { const src = await K().Store.get(d.id); if (!src) return; const nums = []; for (let i = +d.from; i <= +d.to; i++) if (K().needsRead(src, src.units[i - 1])) nums.push(i); if (nums.length) visRun(d.id, nums); };
REG.acts['vis-show'] = async (t, d) => {
  const box = document.getElementById('pgimg'); if (!box) return; box.innerHTML = '<p class="help"><span class="spin"></span>&nbsp;Opening the page</p>';
  try { const u = await K().pageImage(d.id, +d.n); box.innerHTML = `<img class="pgimg" alt="The original page. Tap to open it full screen." src="${u}" data-act="pg-zoom" data-title="Original page" tabindex="0" role="button" style="cursor:zoom-in">`; } catch (e) { box.innerHTML = `<p class="help">${esc((e && e.message) || 'The page could not be shown.')}</p>`; }
};
REG.acts['vis-reattach'] = () => { const f = document.getElementById('src-reattach'); if (f) f.click(); };
async function reattach(id, f) {
  const a = A(); try { a.toast('Checking the PDF'); await K().attachFile(id, f); a.toast('Saved. Pages can now be read as images.'); } catch (e) { a.toast((e && e.message) || 'This PDF could not be added.'); }
  const r = a.route; if (r.name === 'source' && r.id === id) a.renderScreen();
}
function visPanel(src) {
  const a = A(), need = src.units.filter((u) => K().needsRead(src, u)).length, read = src.units.filter((u) => u.v).length, vi = K().vision.info();
  if (!need && !read && !src.scanned && src.kind !== 'photo') return '';
  if (src.kind !== 'pdf' && src.kind !== 'photo') return '';
  const what = src.scanned || src.kind === 'photo' ? 'These pages are pictures, so Amani reads them as images.' : 'Some pages have maths that a text reader scrambles, so Amani reads those pages as images.';
  const lines = [`<p class="help">${what} ${need ? '<b>' + num(need) + (need === 1 ? ' page' : ' pages') + ' still to read.</b>' : '<b>Everything that needed it has been read.</b>'}${read ? ' ' + num(read) + ' already read.' : ''} Lessons read their pages by themselves when you prepare them.</p>`];
  lines.push(vi.ok ? `<p class="help"><b>Reader ready:</b> ${esc(vi.name)}${vi.model ? ' (' + esc(vi.model) + ')' : ''}. Photos and page images are sent to that cloud model only while a page is being read.</p>` : `<p class="help"><b>A cloud model that can see images is needed.</b> Gemini has a free plan that works well.</p>`);
  const btns = [];
  if (!vi.ok) btns.push(`<button class="btn primary" data-act="nav" data-r="me">Set up a cloud model</button>`);
  if (src.kind === 'pdf' && !src.hasFile) { lines.push(`<p class="help">The original PDF is not stored on this device (it was added before page-image reading existed). Add the same PDF again and it is kept for reading.</p>`); btns.push(`<button class="btn primary" data-act="vis-reattach">Add the PDF again</button>`); }
  else if (vi.ok && need) btns.push(`<button class="btn ${src.scanned ? 'primary' : ''}" data-act="vis-readall" data-id="${esc(src.id)}">Read ${num(need)} ${need === 1 ? 'page' : 'pages'} now</button>`);
  return `<section class="vis pn-strong"><h3>Page images</h3>${lines.join('')}${btns.length ? `<div class="row-actions">${btns.join('')}</div>` : ''}<input type="file" id="src-reattach" data-id="${esc(src.id)}" accept=".pdf" hidden></section>`;
}

/* ---------------- Pictures kept from a source: drawn from this device, tap for full screen ---------------- */
const picFig = (sid, v, cap) => `<figure class="pic nofollow kvsrc"><div class="pic-box"><img data-kvsrc="${esc(sid)}:${esc(v.id)}" alt="${esc(cap)}" loading="lazy" decoding="async" data-act="pic-zoom" tabindex="0" role="button" aria-label="Open this picture full screen"></div><figcaption>${esc(cap)}</figcaption></figure>`;
function picsHtml(src, n) {
  const vs = K().visIn(src, n, n); if (!vs.length) return '';
  return `<div class="srcpics"><p class="help">${vs.length === 1 ? 'A picture' : vs.length + ' pictures'} from this ${esc(unitWord(src.kind, 1))}. Tap to open full screen.</p>${vs.map((v) => picFig(src.id, v, K().visCaption(src, v))).join('')}</div>`;
}
let hydQ = 0;
function hydrate() {
  cancelAnimationFrame(hydQ); hydQ = requestAnimationFrame(() => {
    document.querySelectorAll('img[data-kvsrc]:not([data-kvok])').forEach((img) => {
      img.dataset.kvok = '1'; const [sid, vid] = String(img.dataset.kvsrc).split(':');
      K().visUrl(sid, vid).then((u) => { if (u) img.src = u; else gone(img); }).catch(() => gone(img));
    });
  });
}
function gone(img) { const f = img.closest('figure'), cap = img.alt || 'A picture'; if (f) f.outerHTML = `<p class="pic-off">[Picture: ${esc(cap)}] (this picture is no longer on this device)</p>`; }
try { new MutationObserver(hydrate).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { /* older browsers show the labels only */ }
REG.acts['pg-zoom'] = (t) => { if (window.KVView && t && t.src) window.KVView.open({ src: t.src, caption: t.dataset.cap || '', title: t.dataset.title || 'Original page' }); };
REG.acts['src-orig'] = async (t, d) => {
  const a = A(), from = +d.from, to = Math.min(+d.to, from + 7); let ov = null;
  try {
    const parts = []; for (let n = from; n <= to; n++) parts.push([n, await K().pageImage(d.id, n, 1200)]);
    const src = await K().Store.get(d.id), name = (n) => esc((src.units[n - 1] || {}).cite || 'page ' + n);
    if (parts.length === 1) ov = window.KVView.open({ src: parts[0][1], caption: 'Original ' + ((src.units[from - 1] || {}).cite || 'page') + ' of your source.', title: 'Original page', ask: true });
    else ov = window.KVView.openHtml({ title: 'Original pages', html: parts.map(([n, u]) => `<figure style="margin:0 0 14px"><img src="${u}" alt="Original ${name(n)}" style="width:100%;display:block"><figcaption class="help">Original ${name(n)}</figcaption></figure>`).join('') + (+d.to > to ? `<p class="help">Showing the first 8 pages. Open the source to see the rest.</p>` : '') });
  } catch (e) { a.toast((e && e.message) || 'The original page could not be shown.'); }
  return ov;
};
REG.acts['src-descpics'] = async (t, d) => {
  const a = A(), p = a.PACKS.find((x) => x.id === d.p), l = p && a.lessonById(d.l); if (!l || !l.src || PREP.key) return;
  const src = await K().Store.get(p.source.id); const want = K().visIn(src, l.src.from, l.src.to).filter((v) => !v.desc).slice(0, 12).map((v) => v.id); if (!want.length) return;
  PREP.key = p.id + ':' + l.id; PREP.ctrl = new AbortController(); PREP.step = 1; PREP.msg = 'Looking at ' + want.length + (want.length === 1 ? ' picture' : ' pictures'); PREP.err = ''; PREP.note = ''; PREP.pct = 0; paintPrep();
  try {
    await K().describeVisuals(src.id, want, { signal: PREP.ctrl.signal, onProgress: (q) => { PREP.msg = q.msg; PREP.pct = q.frac; paintPrep(); } });
    const fresh = await K().Store.get(src.id); let body = String(l.body || '');
    body = body.replace(/^(!\[)([^\]\n]*)(\]\(kvsrc:[\w-]+:(v\d+)\))$/gm, (m, a1, cap, rest, id) => { const v = (fresh.vis || []).find((x) => x.id === id); return v && v.desc && /^A picture from /.test(cap) ? a1 + K().visCaption(fresh, v).replace(/[\[\]()\n]/g, ' ') + rest : m; });
    if (body !== l.body) { l.body = body; await window.KVStore.save(p); a.addPack(p); }
    a.toast('Pictures described');
  } catch (e) { if (!(e && (e.name === 'Cancelled' || e.name === 'AbortError'))) a.toast((e && e.message) || 'The pictures could not be described.'); }
  PREP.key = ''; PREP.ctrl = null; PREP.step = 0; PREP.pct = null; const r = a.route; if (r.name === 'lesson') a.renderScreen();
};

/* ---------------- One source: overview and page reader ---------------- */
const loading = (id) => { K().Store.get(id).then(() => { const r = A().route; if (r.name === 'source' && r.id === id) A().renderScreen(); }).catch(() => {}); };
function readerFix(src, u, n, ch) {
  const a = A(), vi = K().vision.info(); if (!K().needsRead(src, u) && !(u.e && !u.v && src.kind === 'pdf')) return '';
  const lead = u.m ? '<b>Maths on this page may look scrambled.</b> Matrices, fractions and symbols are hard to read as text.' : u.e ? '<b>This page has no text.</b> It may be a picture, a diagram or a blank page.' : '<b>This page is a picture.</b>';
  let more = 0; if (ch) for (let i = ch.from; i <= ch.to; i++) if (i !== n && K().needsRead(src, src.units[i - 1])) more++;
  if (!src.hasFile) return `<div class="warnbox">${lead} The original file is not kept on this device, so it cannot be read as an image. ${src.kind === 'pdf' ? `<button class="linkbtn" data-act="nav" data-r="source/${src.id}">Add the PDF again</button>` : ''}</div>`;
  if (!vi.ok) return `<div class="warnbox">${lead} Connect a cloud model that can see images to read it properly. <button class="linkbtn" data-act="nav" data-r="me">Set up a cloud model</button></div>`;
  return `<div class="warnbox">${lead}<div class="row-actions"><button class="btn sm primary" data-act="vis-page" data-id="${src.id}" data-n="${n}">Read this page as an image</button>${more && ch ? `<button class="btn sm" data-act="vis-chapter" data-id="${src.id}" data-from="${ch.from}" data-to="${ch.to}">Read ${more + 1} pages of this chapter</button>` : ''}</div></div>`;
}
function reader(src, n) {
  const a = A(), u = src.units[n - 1]; if (!u) return '<div class="page"><p class="help">That page is not in this source.</p></div>';
  const ch = (src.chapters || []).find((c) => n >= c.from && n <= c.to), word = src.kind === 'youtube' ? 'Time' : src.kind === 'pdf' ? 'Page' : src.kind === 'photo' ? 'Photo' : 'Part';
  const t = esc(u.t);
  const yt = src.kind === 'youtube' && src.extra ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${esc(src.extra.videoId)}&t=${Math.floor(u.s || 0)}s">Watch this part on YouTube</a>` : '';
  return `<div class="page reader"><div class="sheet pn-strong"><div class="hair"></div><article class="prose">
    <p class="eyebrow">${esc(src.title)}${ch ? ' · ' + esc(ch.title) : ''}</p><h1>${esc(word)}: ${esc(u.cite.replace(/^p\. |^photo /, ''))}</h1>
    ${readerFix(src, u, n, ch)}
    ${picsHtml(src, n)}<div class="srctext">${t}</div>
    ${u.v ? '<p class="help srcnote">Read from the page image by Amani. For exact formulas, check the original page.</p>' : ''}
    ${(src.kind === 'pdf' || src.kind === 'photo') && src.hasFile ? `<div class="row-actions"><button class="btn sm" data-act="vis-show" data-id="${src.id}" data-n="${n}">${ic(IC.photo, 16, 2)}Show the original page</button></div><div id="pgimg"></div>` : ''}
    <div class="lesson-nav"><button class="btn" data-act="nav" data-r="source/${src.id}/${Math.max(1, n - 1)}" ${n <= 1 ? 'disabled' : ''}>Previous</button>${yt}<button class="btn" data-act="nav" data-r="source/${src.id}">Back to source</button><button class="btn primary" data-act="nav" data-r="source/${src.id}/${Math.min(src.units.length, n + 1)}" ${n >= src.units.length ? 'disabled' : ''}>Next</button></div>
    </article></div></div>`;
}
REG.screens.source = function (route) {
  const a = A(), id = route.id, m = K().Store.meta(id);
  if (!m) return `<div class="page"><div class="shelf-empty inset">This source is not on this device any more. <button class="btn sm primary" data-act="nav" data-r="mysources">Back to your sources</button></div></div>`;
  const src = K().Store.peek(id); if (!src) { loading(id); return `<div class="page"><div class="shelf-empty inset"><span class="spin"></span>&nbsp;Opening ${esc(m.title)}</div></div>`; }
  if (route.sub) return reader(src, Math.max(1, Math.min(src.units.length, parseInt(route.sub, 10) || 1)));
  const word = unitWord(src.kind, src.units.length), chs = (src.chapters || []);
  const pack = a.PACKS.find((p) => p.id === packIdOf(id));
  const notes = (src.notes || []).filter((n) => !/next stage|does not read yet|contain maths or symbols|^This PDF is made of pictures/i.test(n)).map((n) => `<p class="help srcnote">${ic(a.I.bulb || IC.file, 16, 1.8)}<span>${esc(n)}</span></p>`).join('');
  return `<div class="page source"><div class="lib-top"><p class="eyebrow">${esc(kname(src.kind))}</p><h1 class="h-title">${esc(src.title)}</h1>
    <p class="lede">${num(src.units.length)} ${word} · ${num(chs.filter((c) => !c.front).length || 1)} ${(chs.filter((c) => !c.front).length || 1) === 1 ? 'chapter' : 'chapters'} · ${num(Math.round(src.stats.chars / 5))} words · added ${ago(src.addedAt)}${src.url ? ' · <a href="' + esc(src.url) + '" target="_blank" rel="noopener">original</a>' : ''}</p></div>
    ${notes}
    ${visPanel(src)}
    ${profCard(src)}
    <div class="row-actions"><button class="btn primary" data-act="src-study" data-id="${id}">${ic(a.I.spark, 18, 2)}Study this</button><button class="btn" data-act="src-ask" data-id="${id}">${ic(a.I.chat, 18, 2)}Ask Amani about it</button></div>
    <label class="lsearch inset">${ic(IC.search, 18, 2)}<input id="src-q" type="search" placeholder="Search inside this source" autocomplete="off" aria-label="Search inside this source" data-id="${id}"></label>
    <div id="src-hits"></div>
    ${chs.length ? `<h2 class="sec-title">Chapters</h2><div class="srclist">${chs.map((c) => `<button class="srcrow raised ${c.front ? 'dim' : ''}" data-act="${c.front ? 'nav" data-r="source/' + id + '/' + c.from : 'src-chapter'}" data-id="${id}" data-from="${c.from}"><span class="grow"><b>${esc(c.title)}</b><span class="s">${esc(src.units[c.from - 1].cite)} to ${esc(src.units[c.to - 1].cite)}${c.front ? ' · not used for lessons' : ''}${chBadge(src, c)}</span></span>${ic(a.I.chev, 18, 2)}</button>`).join('')}</div>` : ''}
    <div class="row-actions" style="margin-top:6px"><button class="btn" data-act="nav" data-r="source/${id}/1">Read the ${src.kind === 'pdf' ? 'pages' : 'text'}</button><button class="btn" data-act="src-del" data-id="${id}">${ic(IC.trash, 18, 2)}Remove</button></div>
    ${pack ? '' : ''}</div>`;
};
function chBadge(src, c) { let n = 0; for (let i = c.from; i <= c.to; i++) if (K().needsRead(src, src.units[i - 1])) n++; return n ? ' · ' + n + (src.scanned || src.kind === 'photo' ? ' to read' : ' maths ' + (n === 1 ? 'page' : 'pages')) : ''; }
let sq = 0;
document.addEventListener('input', (ev) => {
  const t = ev.target; if (!t || t.id !== 'src-q') return; const q = t.value.trim(), id = t.dataset.id, my = ++sq, box = document.getElementById('src-hits'); if (!box) return;
  if (q.length < 2) { box.innerHTML = ''; return; }
  K().search(id, q, { k: 6 }).then((r) => { if (my !== sq) return; box.innerHTML = r.length ? `<div class="srclist">${r.map((h) => `<button class="srcrow raised hit" data-act="nav" data-r="source/${id}/${h.n}"><span class="grow"><b>${esc(h.cite)}</b><span class="s">${esc(h.text.replace(/\s+/g, ' ').slice(0, 170))}…</span></span></button>`).join('')}</div>` : '<p class="help">Nothing in this source matches that. Try different words.</p>'; });
});
REG.acts['src-chapter'] = async (t, d) => {
  const a = A(), src = await K().Store.get(d.id); const p = await ensurePack(src); a.setActivePack(p.id);
  const from = +d.from, l = p.modules.reduce((x, m) => x.concat(m.lessons), []).find((x) => x.src && x.src.from >= from) || p.modules[0].lessons[0]; a.go('lesson/' + l.id);
};
/* ---------------- What Amani found: shown only when she is unsure the source can be taught ---------------- */
const LOOK = { id: '', err: '' };
const anyReady = (p) => !!(p && p.modules.some((m) => m.lessons.some((l) => l.ready)));
function gated(src, p) { const pr = P() && P().of(src); return !!(pr && pr.unsure && !src.ack && !anyReady(p)); }
function profCard(src, sheet) {
  const a = A(), pr = P() && P().of(src), p = a.PACKS.find((x) => x.id === packIdOf(src.id)); if (!pr || !pr.unsure || src.ack || anyReady(p)) return '';
  const none = pr.teach === 'none', offers = pr.offers.filter((o) => o !== 'lessons'), look = pr.by === 'rules' && cloudOk();
  const head = pr.by === 'ai' ? 'This looks like ' + pr.label : none ? 'There is not much here to teach' : 'This may not need full lessons';
  const reasons = pr.reasons.map((r) => `<li>${esc(r)}</li>`).join(''), busy = LOOK.id === src.id;
  const btn = (o, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-act="src-mode" data-id="${esc(src.id)}" data-mode="${o}">${esc(P().OFFERS[o])}</button>`;
  return `<section class="prof pn-strong ${sheet ? 'sheet' : ''}" id="prof-card"><p class="eyebrow">What Amani found</p><h3>${esc(head)}</h3>${pr.summary ? `<p>${esc(pr.summary)}</p>` : ''}${reasons ? `<ul class="prof-why">${reasons}</ul>` : ''}
    <p class="help">${none ? 'Lessons with quizzes would be made up from almost nothing. Here is what makes sense instead.' : 'Lessons with practice questions work best on teaching material. You choose what happens next.'}</p>
    ${LOOK.err && LOOK.id === '' ? `<p class="help prep-err">${esc(LOOK.err)}</p>` : ''}
    <div class="row-actions">${offers.map(btn).join('')}${look ? `<button class="btn" data-act="src-look" data-id="${esc(src.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Looking…' : 'Ask Amani to take a closer look'}</button>` : ''}</div>
    <p class="help"><button class="linkbtn" data-act="src-mode" data-id="${esc(src.id)}" data-mode="lessons">${esc(P().OFFERS.lessons)}</button>${look ? ' Looking closer sends a few short samples of the text to your cloud model.' : ''}</p>${sheet ? `<div class="row-actions"><button class="btn sm" data-act="prof-close">Not now</button></div>` : ''}</section>`;
}
function repaintSource(id) { const r = A().route; if (r.name === 'source' && r.id === id && !r.sub) A().renderScreen(); const o = document.getElementById('prof-ov'); if (o) { K().Store.get(id).then((src) => { if (src) { const c = profCard(src, true); if (c) o.querySelector('.ov-card').innerHTML = c; else o.remove(); } }); } }
REG.acts['src-look'] = async (t, d) => {
  const a = A(), src = await K().Store.get(d.id); if (!src || LOOK.id) return; LOOK.id = src.id; LOOK.err = ''; repaintSource(src.id);
  try { const pr = await P().ask(src, { model: cloudSel() }); src.profile = pr; await K().Store.put(src); }
  catch (e) { LOOK.err = e && e.bad ? 'Amani could not make sense of the answer. Try again, or choose what to do below.' : a.netErr && a.netErr(e) ? 'The cloud model could not be reached. Check your internet and try again.' : 'Amani could not take a closer look (' + String((e && e.message) || 'unknown error').replace(/[.\s]+$/, '').slice(0, 120) + '). You can still choose below.'; }
  const failed = LOOK.err; LOOK.id = ''; repaintSource(src.id); if (failed) a.toast(failed);
};
REG.acts['src-mode'] = async (t, d) => {
  const a = A(), src = await K().Store.get(d.id); if (!src) return; const mode = d.mode; const o = document.getElementById('prof-ov'); if (o) o.remove();
  src.ack = mode; await K().Store.put(src);
  if (mode === 'chat') { const p = await ensurePack(src); a.setActivePack(p.id); a.go('home'); setTimeout(() => a.openTutor(), 250); return; }
  if (mode === 'summary' || mode === 'keyideas') { const np = makePack(src, mode); await window.KVStore.save(np); a.addPack(np); a.setActivePack(np.id); a.go('lesson/l1'); return; }
  const p = await ensurePack(src); a.setActivePack(p.id); a.go('learn');
};
REG.acts['prof-close'] = () => { const o = document.getElementById('prof-ov'); if (o) o.remove(); };
REG.acts['src-study'] = async (t, d) => {
  const a = A(), src = await K().Store.get(d.id), p = await ensurePack(src);
  if (gated(src, p)) { let o = document.getElementById('prof-ov'); if (o) o.remove(); o = document.createElement('div'); o.id = 'prof-ov'; o.className = 'ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'What Amani found'); o.innerHTML = '<div class="ov-card pn-strong kv-in">' + profCard(src, true) + '</div>'; document.body.appendChild(o); return; }
  a.setActivePack(p.id); a.go('learn');
};
REG.acts['src-ask'] = async (t, d) => { const a = A(), src = await K().Store.get(d.id), p = await ensurePack(src); a.setActivePack(p.id); a.go('home'); setTimeout(() => a.openTutor(), 250); };
REG.acts['src-open'] = (t, d) => A().go('source/' + d.id + '/' + d.n);
REG.acts['src-del'] = (t, d) => {
  const m = K().Store.meta(d.id); if (!m) return; const o = document.createElement('div'); o.className = 'ov'; o.id = 'src-del-ov';
  o.innerHTML = `<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"><h3>Remove this source?</h3><p class="help"><b>${esc(m.title)}</b>, the course made from it and your progress in it will be removed from this device. This cannot be undone.</p><div class="row-actions"><button class="btn" data-act="src-del-no">Keep it</button><button class="btn primary" data-act="src-del-yes" data-id="${d.id}">Remove</button></div></div>`; document.body.appendChild(o);
};
REG.acts['src-del-no'] = () => { const o = document.getElementById('src-del-ov'); if (o) o.remove(); };
REG.acts['src-del-yes'] = async (t, d) => {
  const a = A(), o = document.getElementById('src-del-ov'); if (o) o.remove(); const pid = packIdOf(d.id);
  await K().Store.remove(d.id); try { await window.KVStore.remove(pid); } catch (e) { /* ignore */ } delete a.S.progress[pid]; Object.keys(a.S.chats || {}).forEach((k) => { if (k.indexOf(pid + ':') === 0) delete a.S.chats[k]; });
  a.removePack(pid); a.save(); a.toast('Source removed'); a.go('mysources');
};

/* ---------------- Lessons written from a source, on demand ---------------- */
const PREP = { key: '', ctrl: null, msg: '', err: '', step: 0, pct: null, note: '' };
const cloudOk = () => !!(A().bestCloud && A().bestCloud());
const cloudSel = () => (A().bestCloud && A().bestCloud()) || undefined;
function parseJson(s) { s = String(s || '').replace(/```(?:json)?/gi, ''); const i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i < 0 || j <= i) throw new Error('no json'); return JSON.parse(s.slice(i, j + 1)); }
/* a summary or key-ideas page is short and has no quiz. Very long sources are sampled from the start, middle and end. */
function sampleText(text, cap) { if (text.length <= cap) return text; const t = Math.floor(cap / 3); return text.slice(0, t) + '\n\n[...]\n\n' + text.slice(Math.floor(text.length / 2 - t / 2), Math.floor(text.length / 2 + t / 2)) + '\n\n[...]\n\n' + text.slice(-t); }
function summaryPrompt(src, mode, text) {
  const key = mode === 'keyideas';
  const sys = 'You are Amani, writing for a learner from THEIR OWN source, "' + src.title + '". Use ONLY the source text you are given. Never add facts that are not in it. If the source is mostly entertainment, say so honestly in one sentence instead of pretending it teaches.\nRules:\n- First line: "# " then a short, specific title.\n' +
    (key ? '- Write 5 to 9 key ideas. Each is a bold short heading line then one or two plain sentences. No exercises and no quiz.\n' : '- Write a clear summary of about 150 to 300 words in plain, friendly language, then a short list of the main points under "## Main points". No exercises and no quiz.\n') +
    '- Add one block ":::keyidea" with the single most important takeaway (a line starting with :::keyidea, the sentence, then a line containing only :::).\n- Where a statement comes from a labelled part, write that label exactly as it appears in the source in square brackets, like [3:20]. Use only labels that appear in the source.\n- Do not write introductions about yourself.';
  return [{ role: 'system', content: sys }, { role: 'user', content: 'SOURCE TEXT:\n\n' + sampleText(text, 24000) }];
}
function lessonPrompt(src, l, text, hasMath) {
  const sys = 'You are Amani, writing one study lesson for a learner from THEIR OWN source, "' + src.title + '". Use ONLY the source text you are given. Never add facts that are not in it.\n' +
    'Rules:\n- First line: "# " then a short, specific lesson title taken from the content.\n- Teach in clear, friendly, simple language. Explain each idea. Keep the source\'s definitions, formulas and worked examples, with maths written in plain text such as A^2, 1/2, sqrt(x), [[1,2],[3,4]].\n' +
    '- After a statement that comes from a page, write that page label exactly as it appears in the source, in square brackets, like [p. 4.52]. Use only labels that appear in the source.\n- Use ## headings and put 3 to 6 key terms in **bold**.\n' +
    '- Include one block ":::keyidea" (one or two sentences), at least one worked example from the source as ":::example title=Name", and one ":::exercise title=Name" with a task for the learner. A block is a line starting with ::: and its type, then the text, then a line containing only :::.\n' +
    (hasMath ? '- Pages marked [MATHS MAY BE GARBLED] have unreadable matrices, fractions or symbols. Do not guess them. Explain the idea in words and tell the learner to check that page in the book.\n' : '') +
    (/\[Picture v\d+ /.test(text) ? '- The source has pictures, listed at the end as [Picture v1 on slide 2: label]. You cannot see them. Where one supports a point, put it on its own line right after that paragraph as ![what it shows](kvsrc:v1), using only ids that are listed and each at most once. Describe a picture only with the words in its label, and say so when a label is missing. Never invent what a picture shows.\n' : '') +
    '- If this part is mostly exercises, teach how to approach each type of question and solve the clearest examples step by step.\n- Write 500 to 900 words, or less if the source is short. No introductions about yourself.';
  return [{ role: 'system', content: sys }, { role: 'user', content: 'SOURCE TEXT:\n\n' + text }];
}
/* tell the learner the real reason, not just "too little text" */
function lessonWhy(why, out) {
  const w = String(why || '').toLowerCase(), got = out.replace(/\s+/g, ' ').length;
  if (/length|max_tokens/.test(w)) return 'The model ran out of room before it wrote the lesson (some models spend most of their allowance thinking)';
  if (/safety|content_filter|blocked|prohibited|recitation/.test(w)) return 'The model refused this text with its safety filter';
  if (w) return 'The model sent back nothing (reason given: ' + w.slice(0, 40) + ')';
  return 'The model sent back only ' + got + ' characters';
}
function sourceText(src, a, b) {
  let t = src.units.slice(a - 1, b).map((u) => '[' + u.cite + ']' + (u.m ? ' [MATHS MAY BE GARBLED]' : '') + '\n' + u.t).join('\n\n');
  const vs = K().visIn(src, a, b);
  if (vs.length) t += '\n\nPICTURES IN THIS PART (you cannot see them, you only know these labels):\n' + vs.slice(0, 12).map((v) => '[Picture ' + v.id + ' on ' + K().visLabel(src, v) + ': ' + (String(v.desc || v.alt || '').replace(/\s+/g, ' ').slice(0, 300) || 'no description') + ']').join('\n');
  return t;
}
/* the model may place a picture with ![what it shows](kvsrc:v3). Only real pictures of this part are kept, each once. If it placed none, the first few are added at the end. */
function placeVisuals(out, src, a, b) {
  const vs = K().visIn(src, a, b); if (!vs.length) return out.replace(/^[ \t]*!\[[^\]\n]*\]\(kvsrc:[^)]*\)[ \t]*$/gm, '');
  const ok = new Set(vs.map((v) => v.id)), used = new Set(), clip = (c) => String(c).replace(/[\[\]()\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  out = out.replace(/^[ \t]*!\[([^\]\n]*)\]\(kvsrc:(?:[\w-]+:)?(v\d+)\)[ \t]*$/gm, (m, cap, id) => {
    if (!ok.has(id) || used.has(id)) return ''; used.add(id); const v = vs.find((x) => x.id === id), c = clip(cap);
    return '![' + (c.length >= 12 ? c : clip(K().visCaption(src, v))) + '](kvsrc:' + src.id + ':' + id + ')';
  });
  if (!used.size) out += '\n\n## Pictures from your source\n\n' + vs.slice(0, 6).map((v) => '![' + clip(K().visCaption(src, v)) + '](kvsrc:' + src.id + ':' + v.id + ')').join('\n\n');
  return out.replace(/\n{3,}/g, '\n\n');
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
async function prepare(packId, lessonId, describe) {
  const a = A(), p = a.PACKS.find((x) => x.id === packId); if (!p || PREP.key) return;
  const l = p.modules.reduce((x, m) => x.concat(m.lessons), []).find((x) => x.id === lessonId); if (!l || !l.src) return;
  const src = await K().Store.get(p.source.id); if (!src) { PREP.err = 'The source is no longer on this device.'; paintPrep(); return; }
  PREP.key = packId + ':' + lessonId; PREP.err = ''; PREP.step = 1; PREP.msg = 'Amani is reading ' + src.units[l.src.from - 1].cite + ' to ' + src.units[l.src.to - 1].cite; PREP.ctrl = new AbortController(); paintPrep();
  try {
    PREP.note = '';
    const need = []; for (let i = l.src.from; i <= l.src.to; i++) if (K().needsRead(src, src.units[i - 1])) need.push(i);
    if (need.length) {
      const vi = K().vision.info(), pic = src.scanned || src.kind === 'photo';
      if (!vi.ok) { if (pic) throw new Error('These pages are pictures, so a cloud model that can see images is needed to read them. Connect Gemini (free) in Me, then prepare the lesson again.'); PREP.note = 'Some maths pages stayed unread because no cloud model that can see images is connected.'; }
      else if (!src.hasFile) { if (pic) throw new Error('The original file is not stored on this device, so its pages cannot be read.'); PREP.note = 'The original PDF is not kept, so maths pages could not be read as images.'; }
      else {
        PREP.step = 1; PREP.msg = 'Reading ' + need.length + (need.length === 1 ? ' page' : ' pages') + ' as images'; PREP.pct = 0; paintPrep();
        try { await K().readPages(src.id, need.slice(0, 14), { signal: PREP.ctrl.signal, onProgress: (p) => { PREP.msg = p.msg; PREP.pct = p.frac; paintPrep(); } }); }
        catch (e) { if (e && (e.name === 'Cancelled' || e.name === 'AbortError')) throw Object.assign(new Error('stopped'), { name: 'AbortError' }); if (pic) throw e; PREP.note = (e && e.message ? e.message + ' ' : '') + 'The lesson uses the text as it is.'; }
        PREP.pct = null;
      }
    }
    if (describe) {
      const want = K().visIn(src, l.src.from, l.src.to).filter((v) => !v.desc).slice(0, 12).map((v) => v.id);
      if (want.length) {
        PREP.step = 1; PREP.msg = 'Looking at ' + want.length + (want.length === 1 ? ' picture' : ' pictures'); PREP.pct = 0; paintPrep();
        try { await K().describeVisuals(src.id, want, { signal: PREP.ctrl.signal, onProgress: (p) => { PREP.msg = p.msg; PREP.pct = p.frac; paintPrep(); } }); }
        catch (e) { if (e && (e.name === 'Cancelled' || e.name === 'AbortError')) throw Object.assign(new Error('stopped'), { name: 'AbortError' }); PREP.note = (e && e.message ? e.message + ' ' : '') + 'The lesson uses the pictures\' own labels instead.'; }
        PREP.pct = null;
      }
    }
    const hasMath = src.units.slice(l.src.from - 1, l.src.to).some((u) => u.m);
    PREP.step = 1; PREP.msg = 'Amani is reading ' + src.units[l.src.from - 1].cite + ' to ' + src.units[l.src.to - 1].cite; paintPrep();
    const text = sourceText(src, l.src.from, l.src.to);
    const whole = l.mode === 'summary' || l.mode === 'keyideas'; let out = '', tries = 0, why = '';
    while (tries < 3) {
      tries++; const msgs = whole ? summaryPrompt(src, l.mode, text) : lessonPrompt(src, l, text, hasMath);
      if (tries > 1) msgs.push({ role: 'user', content: 'Write the whole lesson now, as plain text with the headings and blocks described. It needs at least 400 words. Do not explain your plan.' });
      try { out = String(await a.llm(msgs, { model: cloudSel(), max: 3000 + tries * 1500, temp: 0.4, signal: PREP.ctrl.signal, fast: true, strict: true })); why = ''; }
      catch (e) { if (e && e.empty !== undefined) { out = ''; why = e.empty; } else throw e; }
      if (out.replace(/\s+/g, ' ').length > (whole ? 300 : 500)) break;
      if (PREP.ctrl.signal.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' });
    }
    if (out.replace(/\s+/g, ' ').length < (whole ? 200 : 300)) throw new Error(lessonWhy(why, out));
    PREP.step = 2; PREP.msg = 'Writing practice questions'; paintPrep();
    out = placeVisuals(out.replace(/```[a-z]*\n?/g, '').trim(), src, l.src.from, l.src.to); const tm = out.match(/^#\s+(.+)$/m); let title = l.title; if (tm) { title = tm[1].replace(/[*_`]/g, '').trim().slice(0, 90); out = out.replace(tm[0], '').trim(); }
    if (!/:::keyidea/.test(out)) out += '\n\n:::keyidea\n' + (title || 'Review the main idea above.') + '\n:::';
    let qz = { quiz: [], cards: [] };
    const wantQuiz = !whole && !(P() && P().of(src).quiz === false);
    if (wantQuiz) try {
      const j = parseJson(await a.llm([{ role: 'system', content: 'Return ONLY valid JSON, with no text before or after it.' }, { role: 'user', content: 'Here is a lesson.\n\n' + out.slice(0, 7000) + '\n\nWrite 4 multiple-choice questions and 4 flashcards about it, using only what the lesson says. Each question has "prompt", "options" (4 strings, exactly one correct, three plausible wrong answers), "answer" (index 0 to 3) and "explanation" (one sentence). Each flashcard has "front" and "back". Return {"quiz":[...],"cards":[...]}.' }], { model: cloudSel(), max: 3200, temp: 0.3, signal: PREP.ctrl.signal, fast: true }));
      qz.quiz = (j.quiz || []).filter((q) => q && q.prompt && Array.isArray(q.options) && q.options.length >= 3 && Number.isInteger(+q.answer) && +q.answer < q.options.length && q.explanation).slice(0, 5); qz.cards = (j.cards || []).filter((c) => c && c.front && c.back).slice(0, 6);
    } catch (e) { if (e && e.name === 'AbortError') throw e; qz = { quiz: [], cards: [] }; }
    l.title = title; l.body = out; l.ready = true; l.minutes = Math.max(3, Math.round(out.split(/\s+/).length / 170) + 2); l.outcomes = [];
    p.quiz = (p.quiz || []).filter((q) => q.lesson !== l.id); p.flashcards = (p.flashcards || []).filter((c) => c.lesson !== l.id);
    const ids = ['a', 'b', 'c', 'd'];
    qz.quiz.forEach((q, k) => { const opts = shuffle(q.options.slice(0, 4).map((x, i) => ({ t: String(x), ok: i === +q.answer }))); p.quiz.push({ id: 'q-' + l.id + '-' + (k + 1), lesson: l.id, prompt: String(q.prompt), options: opts.map((o, i) => ({ id: ids[i], text: o.t })), answer: ids[opts.findIndex((o) => o.ok)], explanation: String(q.explanation) }); });
    qz.cards.forEach((c, k) => p.flashcards.push({ id: 'f-' + l.id + '-' + (k + 1), lesson: l.id, front: String(c.front), back: String(c.back) }));
    await window.KVStore.save(p); a.addPack(p); PREP.key = ''; PREP.ctrl = null; PREP.step = 0;
    const r = a.route; if (r.name === 'lesson' && r.id === lessonId) a.renderScreen(); a.toast('Lesson ready');
  } catch (e) {
    PREP.key = ''; PREP.ctrl = null; PREP.step = 0;
    if (e && e.name === 'AbortError') { PREP.err = ''; } else { PREP.err = e && e.code === 'quota' ? e.message + ' Wait a few minutes and try again, or connect another cloud model in Me. Pages already read are kept.' : (e && /^These pages are pictures|^The original file is not stored/.test(e.message || '')) || (e && e.code) ? e.message : a.netErr && a.netErr(e) ? 'The cloud model could not be reached. Check your internet and try again.' : 'Amani could not finish this lesson: ' + String((e && e.message) || 'unknown error').replace(/[.\s]+$/, '') + '. Try again, or pick a different cloud model from the model menu (Gemini Flash works well).'; }
    paintPrep();
  }
}
function prepHtml(l, p) {
  const a = A(), r = l.src, key = p.id + ':' + l.id, busy = PREP.key === key;
  const sx = K().Store.peek(p.source.id), nv = sx ? K().visIn(sx, r.from, r.to).length : 0, nd = sx ? K().visIn(sx, r.from, r.to).filter((v) => !v.desc).length : 0;
  const paged = sx && (sx.kind === 'pdf' || sx.kind === 'photo') && sx.hasFile;
  if (!l.ready && sx && P() && P().of(sx).unsure && !sx.ack && !busy) return `<section class="prep pn-strong" id="prep-card"><h3>Amani is not sure about this one</h3><p class="help">${esc((P().of(sx).reasons[0] || 'This source may not have much to teach.'))} See what she found before you turn it into lessons.</p><div class="row-actions"><button class="btn primary" data-act="nav" data-r="source/${esc(p.source.id)}">See what she found</button><button class="btn" data-act="src-mode" data-id="${esc(p.source.id)}" data-mode="lessons">Make lessons anyway</button></div></section>`;
  if (l.ready) return `<p class="help srcfrom">Written from <b>${esc(l.subtitle)}</b> of your source. <button class="linkbtn" data-act="src-open" data-id="${esc(p.source.id)}" data-n="${r.from}">Read the original text</button>${paged ? ` <button class="linkbtn" data-act="src-orig" data-id="${esc(p.source.id)}" data-from="${r.from}" data-to="${r.to}">View the original ${r.to > r.from ? 'pages' : 'page'}</button>` : ''}${nd && K().vision.info().ok ? ` <button class="linkbtn" data-act="src-descpics" data-p="${esc(p.id)}" data-l="${esc(l.id)}">Describe ${nd} ${nd === 1 ? 'picture' : 'pictures'} with a cloud model</button>` : ''}</p>`;
  if (busy) return `<section class="prep pn-strong" id="prep-card"><h3>Preparing this lesson</h3><p class="help">${esc(PREP.msg)}</p><div class="bar"><i style="width:${PREP.step === 2 ? 80 : PREP.pct != null ? Math.round(5 + PREP.pct * 30) : 40}%"></i></div>${PREP.note ? `<p class="help">${esc(PREP.note)}</p>` : ''}<p class="help">A few minutes at most, depending on the model. You can keep this open.</p><div class="row-actions"><button class="btn" data-act="src-prep-cancel">Cancel</button></div></section>`;
  if (PREP.key) return `<section class="prep pn-strong" id="prep-card"><h3>Another lesson is being prepared</h3><p class="help">Wait for it to finish, then prepare this one.</p></section>`;
  if (!cloudOk()) return `<section class="prep pn-strong" id="prep-card"><h3>Prepare this lesson</h3><p class="help">Writing a lesson from your source needs a <b>cloud model</b>. Offline models are for chat only: they are too small and slow to write lessons. Your tutor chat can still use the offline model.</p><div class="row-actions"><button class="btn primary" data-act="nav" data-r="me">Set up a cloud model</button><button class="btn" data-act="src-open" data-id="${esc(p.source.id)}" data-n="${r.from}">Read the original pages</button></div></section>`;
  return `<section class="prep pn-strong" id="prep-card">${PREP.err ? `<p class="help prep-err">${esc(PREP.err)}</p>` : ''}<h3>Prepare this lesson</h3><p class="help">Amani will read <b>${esc(l.subtitle)}</b> of your source and write a lesson with key ideas, worked examples, practice questions and flashcards. It stays on this device.</p>${nv ? `<p class="help">This part has <b>${nv}</b> ${nv === 1 ? 'picture' : 'pictures'}. They appear in the lesson with their own labels. <b>Prepare and describe</b> also sends ${nv === 1 ? 'it' : 'them'} to your cloud model so Amani can say what ${nv === 1 ? 'it shows' : 'they show'}. Nothing is sent unless you press that button.</p>` : ''}<div class="row-actions"><button class="btn primary" data-act="src-prep" data-p="${esc(p.id)}" data-l="${esc(l.id)}"> ${ic(a.I.spark, 18, 2)}Prepare this lesson</button>${nd && K().vision.info().ok ? `<button class="btn" data-act="src-prep" data-desc="1" data-p="${esc(p.id)}" data-l="${esc(l.id)}">Prepare and describe ${nd} ${nd === 1 ? 'picture' : 'pictures'}</button>` : ''}<button class="btn" data-act="src-open" data-id="${esc(p.source.id)}" data-n="${r.from}">Read the original pages</button></div></section>`;
}
function paintPrep() { const a = A(), r = a.route; if (r.name !== 'lesson') return; const el = document.getElementById('prep-card') || document.querySelector('.srcfrom'); const p = a.pack(), l = a.lessonById(r.id); if (!el || !l || !l.src) return; const h = prepHtml(l, p), t = document.createElement('div'); t.innerHTML = h; if (t.firstElementChild) el.replaceWith(t.firstElementChild); }
REG.hooks.lessonExtra = ((prev) => (l) => { const a = A(), p = a.pack(), x = prev ? prev(l) : ''; return x + (p && p.source && l.src ? prepHtml(l, p) : ''); })(REG.hooks.lessonExtra);
window.KVSrcUI = { placeVisuals, sourceText, lessonPrompt, picsHtml, summaryPrompt, makePack, profCard };
REG.acts['src-prep'] = (t, d) => { prepare(d.p, d.l, d.desc === '1'); };
REG.acts['src-prep-cancel'] = () => { if (PREP.ctrl) PREP.ctrl.abort(); };

/* ---------------- Grounded answers: find passages, hand them to the tutor, turn page labels into links ---------------- */
const CITES = {};
const nk = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').replace(/\.\s+/g, '.').trim();
async function citesFor(id) { if (CITES[id]) return CITES[id]; const s = await K().Store.get(id); if (!s) return null; const m = new Map(); s.units.forEach((u) => { if (!m.has(nk(u.cite))) m.set(nk(u.cite), u.n); }); CITES[id] = m; return m; }
REG.hooks.ground = async (q, ctx, quote) => {
  const a = A(), p = a.pack(); if (!p || !p.source) return ''; const id = p.source.id, src = await K().Store.get(id); if (!src) return '';
  await citesFor(id); const local = a.S.tutor.brain === 'local', r = a.route, l = r.name === 'lesson' ? a.lessonById(r.id) : null;
  const query = (quote ? quote + ' ' : '') + q + (l ? ' ' + l.title : '');
  let hits = [];
  if (l && l.src) hits = await K().search(id, query, { from: l.src.from, to: l.src.to, k: local ? 2 : 3 });
  const more = await K().search(id, query, { k: local ? 2 : 4 }), seen = new Set(hits.map((h) => h.n + h.text.slice(0, 30)));
  more.forEach((h) => { if (!seen.has(h.n + h.text.slice(0, 30))) hits.push(h); });
  hits = hits.slice(0, local ? 2 : 5);
  const bad = hits.filter((h) => h.math).slice(0, 2).map((h) => h.n);
  if (bad.length && src.hasFile && K().vision.info().ok) {
    try {
      a.toast('Amani is reading ' + (bad.length > 1 ? 'two pages' : 'a page') + ' as an image to get the maths right');
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 50000);
      try { await K().readPages(id, bad, { signal: ctl.signal }); } finally { clearTimeout(to); }
      hits = (l && l.src ? await K().search(id, query, { from: l.src.from, to: l.src.to, k: local ? 2 : 3 }) : []).concat(await K().search(id, query, { k: local ? 2 : 4 })).filter((h, i, arr) => arr.findIndex((x) => x.n === h.n && x.text.slice(0, 30) === h.text.slice(0, 30)) === i).slice(0, local ? 2 : 5);
    } catch (e) { /* answer with what we have */ }
  }
  const head = '\n\nTHE LEARNER\'S OWN SOURCE: "' + src.title + '". Answer from the excerpts below first. When you use one, cite its label in square brackets exactly as written, like [' + (hits[0] ? hits[0].cite : 'p. 12') + ']. If the excerpts do not answer the question, say so briefly, then help from general knowledge and label it as general knowledge. If an excerpt is marked as garbled maths, do not guess the formula; tell the learner to open that page.\n';
  if (!hits.length) return head + 'No passage in the source matched this question.';
  return head + hits.map((h) => '[' + h.cite + ']' + (h.math ? ' [MATHS MAY BE GARBLED]' : '') + '\n' + h.text.slice(0, local ? 700 : 1400)).join('\n\n');
};
REG.hooks.cite = (html) => {
  const a = A(), p = a.pack(); if (!p || !p.source) return html; const id = p.source.id, m = CITES[id];
  if (!m) { citesFor(id).then((x) => { if (x && a.renderTutor) a.renderTutor(); }); return html; }
  return html.replace(/\[([^\[\]<>]{2,30})\]/g, (all, lab) => { const n = m.get(nk(lab)); return n ? `<button class="cite" data-act="src-open" data-id="${esc(id)}" data-n="${n}" title="Open this page">${esc(lab.trim())}</button>` : all; });
};

/* ---------------- Library: the shelf for sources ---------------- */
REG.hooks.sourcesShelfAdd = () => `<button class="btn sm primary" data-act="nav" data-r="mysources" style="margin-top:8px">Add a source</button>`;
window.KVSourcesUI = { makePack, ensurePack, prepare, PREP };
})();
