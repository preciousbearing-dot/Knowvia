/* Follow along: while a lesson is being read aloud, mark the sentence and the word being spoken on the lesson page, keep the page in view,
   and let the reader start the voice from any sentence. The page text is never changed: the marks are drawn with the browser's highlight feature. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp, K = () => window.KVVoice;
const HL = !!(window.CSS && CSS.highlights && window.Highlight);
const SEL_BLOCK = 'h1,h2,h3,h4,p,li,blockquote,tr', SKIP = '.lhear,.eyebrow,.lesson-nav,.checkcard,.nofollow,.selpop';
const F = { art: null, map: null, uid: '', blk: -1, sent: -1, word: -1, auto: true, chip: null, timer: 0, progUntil: 0 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---- what is on the page, in the order it is read, with how long each piece takes to say ---- */
function buildMap(art) {
  const K1 = K(), els = Array.from(art.querySelectorAll(SEL_BLOCK)).filter((el) => !el.closest(SKIP) && !el.querySelector(SEL_BLOCK));
  const blocks = []; let cum = 0;
  els.forEach((el) => {
    const raw = el.textContent || ''; if (!raw.trim()) return;
    const spoken = K1.util.speakable(raw.replace(/\s+/g, ' ')), w = K1.W(spoken); if (!w) return;
    const cw = new Float32Array(raw.length + 1); for (let k = 0; k < raw.length; k++) cw[k + 1] = cw[k] + K1.ww(raw[k]);
    blocks.push({ el, raw, w, w0: cum, cw }); cum += w;
  });
  return { blocks, total: cum };
}
function sentences(raw) {
  const out = []; const re = /[^.!?…]+(?:[.!?…]+["')\]”’]*|$)\s*/g; let m;
  while ((m = re.exec(raw))) { if (m[0].trim()) out.push([m.index, m.index + m[0].replace(/\s+$/, '').length]); if (re.lastIndex === m.index) re.lastIndex++; }
  return out.length ? out : [[0, raw.length]];
}
function rangeFor(el, s, e) {
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, pos = 0, r = null, started = false;
  while ((n = tw.nextNode())) {
    const len = n.nodeValue.length;
    if (!started && s < pos + len) { r = document.createRange(); r.setStart(n, clamp(s - pos, 0, len)); started = true; }
    if (started && e <= pos + len) { r.setEnd(n, clamp(e - pos, 0, len)); return r; }
    pos += len;
  }
  return r;
}
function locate(map, f) {
  const target = clamp(f, 0, 0.9999) * map.total; let lo = 0, hi = map.blocks.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (map.blocks[mid].w0 <= target) lo = mid; else hi = mid - 1; }
  const b = map.blocks[lo], g = b.w ? clamp((target - b.w0) / b.w, 0, 1) : 0, want = g * b.cw[b.raw.length];
  let a = 0, z = b.raw.length; while (a < z) { const mid = (a + z) >> 1; if (b.cw[mid] < want) a = mid + 1; else z = mid; }
  return { bi: lo, ch: clamp(a, 0, Math.max(0, b.raw.length - 1)) };
}

/* ---- drawing ---- */
function clear() {
  if (HL) { CSS.highlights.delete('kv-sent'); CSS.highlights.delete('kv-word'); }
  document.querySelectorAll('.kv-now').forEach((e) => e.classList.remove('kv-now'));
  F.blk = F.sent = F.word = -1; hideChip();
}
function chip(show) {
  if (!show) { hideChip(); return; }
  if (!F.chip) { const b = document.createElement('button'); b.type = 'button'; b.id = 'follow-chip'; b.className = 'follow-chip pn-strong'; b.textContent = 'Follow along'; b.setAttribute('data-act', 'follow-resume'); document.body.appendChild(b); F.chip = b; }
  F.chip.hidden = false;
  const ap = document.getElementById('aplayer'); if (ap && !ap.hidden && window.innerWidth < 860) F.chip.style.bottom = Math.round(window.innerHeight - ap.getBoundingClientRect().top + 10) + 'px'; else F.chip.style.bottom = '';
}
function hideChip() { if (F.chip) F.chip.hidden = true; }
function visibleBand() { const sc = document.getElementById('scroll'); if (!sc) return null; const r = sc.getBoundingClientRect(); return { sc, top: r.top, h: r.height }; }
function keepInView(rect) {
  const v = visibleBand(); if (!v || !rect) return; const lo = v.top + v.h * 0.14, hi = v.top + v.h * 0.62;
  if (rect.top >= lo && rect.bottom <= hi) return;
  const want = rect.top - (v.top + v.h * 0.28); F.progUntil = Date.now() + 900;
  try { v.sc.scrollTo({ top: v.sc.scrollTop + want, behavior: 'smooth' }); } catch (e) { v.sc.scrollTop += want; }
}
function step() {
  const Kv = K(), PL = Kv.PL, V = Kv.V();
  const art = document.querySelector('#scroll .prose[data-pid]');
  const live = PL.kind === 'lesson' && PL.items.length && (PL.st === 'playing' || PL.st === 'paused') && art && Kv.uidOf(art.dataset.pid, art.dataset.lid) === PL.lessonId;
  if (!live || V.follow === false) { if (F.blk !== -1) clear(); return; }
  if (art !== F.art) { F.art = art; F.map = buildMap(art); clear(); }
  if (!F.map || !F.map.blocks.length) return;
  const pr = Kv.progress(), loc = locate(F.map, pr.frac), b = F.map.blocks[loc.bi];
  const ss = sentences(b.raw); let si = ss.findIndex((x) => loc.ch < x[1] + 1); if (si < 0) si = ss.length - 1;
  const sp = ss[si]; let ws = loc.ch, we = loc.ch; while (ws > sp[0] && /\S/.test(b.raw[ws - 1])) ws--; while (we < sp[1] && /\S/.test(b.raw[we])) we++;
  const blockChanged = loc.bi !== F.blk, sentChanged = blockChanged || si !== F.sent;
  if (blockChanged) { document.querySelectorAll('.kv-now').forEach((e) => e.classList.remove('kv-now')); b.el.classList.add('kv-now'); F.blk = loc.bi; }
  const wordChanged = ws !== F.word || sentChanged;
  if (wordChanged) {
    let rs = null, rw = null;
    if (HL) { rs = rangeFor(b.el, sp[0], sp[1]); rw = ws < we ? rangeFor(b.el, ws, we) : null; if (rs) CSS.highlights.set('kv-sent', new Highlight(rs)); if (rw) CSS.highlights.set('kv-word', new Highlight(rw)); }
    F.word = ws; F.sent = si;
    if (V.auto !== false && F.auto && PL.st === 'playing') { const ref = rw || rs, rect = ref && ref.getBoundingClientRect ? ref.getBoundingClientRect() : b.el.getBoundingClientRect(); keepInView(rect); }
  }
  /* the reader scrolled away: offer to come back */
  const v = visibleBand(); if (v && V.auto !== false && !F.auto) { const r = b.el.getBoundingClientRect(); chip(r.bottom < v.top || r.top > v.top + v.h); } else hideChip();
}
function loop() { try { step(); } catch (e) { /* never break the page */ } }
function ensure() { if (!F.timer) F.timer = setInterval(loop, 120); }

/* a hand on the page means the reader is in charge */
['wheel', 'touchmove'].forEach((e) => document.addEventListener(e, (ev) => { if (ev.target && ev.target.closest && ev.target.closest('#scroll') && K().PL.kind === 'lesson' && F.blk !== -1) { if (Date.now() > F.progUntil) F.auto = false; } }, { passive: true, capture: true }));
document.addEventListener('keydown', (ev) => { if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(ev.key) && F.blk !== -1 && !/input|textarea|select|button/i.test((ev.target && ev.target.tagName) || '')) F.auto = false; });
REG.acts['follow-resume'] = () => { F.auto = true; hideChip(); const b = F.map && F.map.blocks[F.blk]; if (b) { F.progUntil = Date.now() + 900; const v = visibleBand(); if (v) { const want = b.el.getBoundingClientRect().top - (v.top + v.h * 0.28); try { v.sc.scrollTo({ top: v.sc.scrollTop + want, behavior: 'smooth' }); } catch (e) { v.sc.scrollTop += want; } } } };

/* ---- start from the sentence the reader selected ---- */
REG.hooks.listenFrom = () => {
  const sel = window.getSelection && window.getSelection(); if (!sel || !sel.rangeCount) return;
  const art = document.querySelector('#scroll .prose[data-pid]'); if (!art) return;
  const r = sel.getRangeAt(0), node = r.startContainer, el = node.nodeType === 1 ? node : node.parentElement; if (!el || !art.contains(el)) return;
  const map = buildMap(art); if (!map.blocks.length) return;
  const bi = map.blocks.findIndex((x) => x.el === el || x.el.contains(el)); if (bi < 0) { A().toast('Pick a sentence in the lesson text'); return; }
  const b = map.blocks[bi]; let off = 0; const tw = document.createTreeWalker(b.el, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) { if (n === node) { off += r.startOffset; break; } off += n.nodeValue.length; }
  const ss = sentences(b.raw); const sp = ss.find((x) => off < x[1] + 1) || ss[0];
  const f = clamp((b.w0 + b.w * (b.cw[sp[0]] / (b.cw[b.raw.length] || 1))) / map.total, 0, 0.995), uid = K().uidOf(art.dataset.pid, art.dataset.lid), Kv = K();
  F.auto = true;
  if (Kv.PL.lessonId === uid && Kv.PL.items.length) Kv.seekFrac(f); else Kv.playLesson(uid, { frac: f });
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loop(); });
REG.ready.push(ensure);
window.KVFollow = { buildMap, locate, sentences, F };
})();
