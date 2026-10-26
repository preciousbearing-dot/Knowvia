/* Full-screen viewer for pictures, diagrams and original source pages.
   Tap a picture to open it. Pinch or use + and - to zoom, drag to move, double tap to jump between fit and close up. Back or Close leaves.
   KVView.open({ src, caption, title }) shows an image. KVView.openHtml({ html, caption, title }) shows drawn content such as a diagram. */
(function () {
  'use strict';
  const REG = window.KVReg;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MIN = 100, MAX = 500;
  let st = null;

  function body() { return document.querySelector('#kv-view .kv-view-body'); }
  function target() { return document.querySelector('#kv-view .kv-view-item'); }
  function setZoom(z, cx, cy) {
    const b = body(), t = target(); if (!b || !t || !st) return;
    z = Math.max(MIN, Math.min(MAX, Math.round(z)));
    const old = st.z, r = b.getBoundingClientRect();
    const px = cx === undefined ? r.width / 2 : cx - r.left, py = cy === undefined ? r.height / 2 : cy - r.top;
    const fx = (b.scrollLeft + px) / Math.max(1, b.scrollWidth), fy = (b.scrollTop + py) / Math.max(1, b.scrollHeight);
    st.z = z; t.style.width = z + '%'; t.setAttribute('data-z', String(z));
    b.scrollLeft = fx * b.scrollWidth - px; b.scrollTop = fy * b.scrollHeight - py;
    const lab = document.querySelector('#kv-view .kv-view-z'); if (lab) lab.textContent = z + '%';
    const out = document.querySelector('#kv-view [data-act="view-out"]'), inn = document.querySelector('#kv-view [data-act="view-in"]');
    if (out) out.disabled = z <= MIN; if (inn) inn.disabled = z >= MAX;
    return old;
  }
  function wire(b) {
    let d0 = 0, z0 = 100, lastTap = 0;
    const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    b.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { d0 = dist(e); z0 = st.z; } }, { passive: true });
    b.addEventListener('touchmove', (e) => { if (e.touches.length === 2 && d0) { e.preventDefault(); setZoom(z0 * dist(e) / d0, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2); } }, { passive: false });
    b.addEventListener('touchend', (e) => { if (e.touches.length < 2) d0 = 0; }, { passive: true });
    b.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(st.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); } }, { passive: false });
    b.addEventListener('click', (e) => { const n = Date.now(); if (n - lastTap < 300) { /* double tap or double click (one handler, so the two never cancel each other) */ setZoom(st.z > 150 ? MIN : 250, e.clientX, e.clientY); lastTap = 0; } else lastTap = n; });
  }
  function shell(inner, o) {
    close(true);
    const ov = document.createElement('div'); ov.id = 'kv-view'; ov.className = 'ov kv-view'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', o.title || 'Enlarged view');
    ov.innerHTML = `<div class="kv-view-card"><div class="kv-view-bar"><b class="kv-view-title">${esc(o.title || '')}</b><span class="kv-view-tools"><button type="button" class="btn sm" data-act="view-out" aria-label="Zoom out">-</button><span class="kv-view-z" aria-live="polite">100%</span><button type="button" class="btn sm" data-act="view-in" aria-label="Zoom in">+</button><button type="button" class="btn sm" data-act="view-fit">Fit</button><button type="button" class="btn sm primary" data-act="view-close">Close</button></span></div>` +
      `<div class="kv-view-body" tabindex="0">${inner}</div>${o.caption ? `<p class="kv-view-cap">${esc(o.caption)}</p>` : ''}</div>`;
    document.body.appendChild(ov);
    st = { z: 100, from: document.activeElement };
    wire(ov.querySelector('.kv-view-body'));
    const c = ov.querySelector('[data-act="view-close"]'); if (c) c.focus();
    setZoom(100);
    return ov;
  }
  function open(o) {
    if (!o || !/^data:image\/(png|jpeg|webp|svg\+xml);base64,|^blob:/.test(o.src || '')) return null;
    return shell(`<img class="kv-view-item" src="${o.src}" alt="${esc(o.caption || '')}" draggable="false">`, o);
  }
  function openHtml(o) { return shell(`<div class="kv-view-item kv-view-html">${o.html}</div>`, o); }
  function close(quiet) {
    const ov = document.getElementById('kv-view'); if (!ov) return;
    const f = st && st.from; ov.remove(); st = null;
    if (!quiet && f && f.isConnected && f.focus) { try { f.focus(); } catch (e) { /* ignore */ } }
  }
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('kv-view')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === '+' || e.key === '=') setZoom(st.z * 1.25);
    else if (e.key === '-') setZoom(st.z / 1.25);
    else if (e.key === '0') setZoom(100);
  });
  if (REG) {
    REG.acts['view-close'] = () => close();
    REG.acts['view-in'] = () => st && setZoom(st.z * 1.4);
    REG.acts['view-out'] = () => st && setZoom(st.z / 1.4);
    REG.acts['view-fit'] = () => st && setZoom(100);
  }
  window.KVView = { open, openHtml, close, zoom: (z) => st && setZoom(z), level: () => (st ? st.z : 0) };
})();
