/* Knowvia figures: turns a short text spec into a clean, theme-aware diagram inside a lesson.
   A lesson writes   :::figure   ...   :::   with a few lines (type, title, caption, then data rows).
   The app draws it from its own templates. Nothing from the spec is ever run: every word is escaped, every number is checked.
   If a spec is broken, the lesson still shows the title and caption, so the learner never sees an error. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];

const TYPES = ['flow', 'matrix', 'gantt', 'network', 'cycle', 'tree', 'bars', 'versus'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inl = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
const num = (s) => { const v = Number(String(s == null ? '' : s).replace(/,/g, '').trim()); return Number.isFinite(v) ? v : NaN; };
const pct = (v) => Math.round(v * 1000) / 10;
class FigErr extends Error {}
const need = (c, m) => { if (!c) throw new FigErr(m); };

/* ---------- reading the spec ---------- */
function parse(text) {
  const f = { type: '', title: '', caption: '', kv: {}, rows: [] };
  String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
    const line = raw.replace(/\s+$/, ''); if (!line.trim()) return;
    const m = line.match(/^(\s*)-\s+(.*)$/);
    if (m) { f.rows.push({ depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2), parts: m[2].split('|').map((x) => x.trim()) }); return; }
    const k = line.match(/^\s*([a-z][a-z0-9-]*)\s*:\s*(.*)$/i);
    if (!k) return;
    const key = k[1].toLowerCase(), val = k[2].trim();
    if (key === 'type') f.type = val.toLowerCase(); else if (key === 'title') f.title = val; else if (key === 'caption') f.caption = val; else f.kv[key] = val;
  });
  return f;
}

/* ---------- the eight templates. Each returns HTML (div, span and svg only) ---------- */
function flow(f) {
  need(f.rows.length >= 2 && f.rows.length <= 8, 'flow needs 2 to 8 steps');
  const steps = f.rows.map((r, i) => `<div class="fg-step"><span class="fg-num">${i + 1}</span><span class="fg-sl">${inl(r.parts[0])}</span>${r.parts[1] ? `<span class="fg-sd">${inl(r.parts[1])}</span>` : ''}</div>`);
  return `<div class="fg-flow${f.rows.length > 4 ? ' many' : ''}">${steps.join('<span class="fg-arr"></span>')}</div>`;
}

function matrix(f) {
  const q = (k) => { const v = f.kv[k]; need(v, 'matrix needs tl, tr, bl and br'); const p = v.split('|').map((x) => x.trim()); return { t: p[0], d: p[1] || '' }; };
  const ax = (k) => { const p = (f.kv[k] || '').split('|').map((x) => x.trim()); need(p[0], 'matrix needs x and y axis names'); return { n: p[0], lo: p[1] || 'Low', hi: p[2] || 'High' }; };
  const X = ax('x'), Y = ax('y'), hot = (f.kv.hot || '').toLowerCase();
  const cell = (k) => { const c = q(k); return `<div class="fg-q${hot === k ? ' hot' : ''}"><span class="fg-qt">${inl(c.t)}</span>${c.d ? `<span class="fg-qd">${inl(c.d)}</span>` : ''}</div>`; };
  return `<div class="fg-matrix"><div class="fg-yax"><span>${esc(Y.hi)}</span><b>${esc(Y.n)}</b><span>${esc(Y.lo)}</span></div><div class="fg-grid">${cell('tl')}${cell('tr')}${cell('bl')}${cell('br')}</div><div class="fg-xax"><span>${esc(X.lo)}</span><b>${esc(X.n)}</b><span>${esc(X.hi)}</span></div></div>`;
}

function gantt(f) {
  const unit = f.kv.unit || 'week';
  const tasks = [], miles = [];
  f.rows.forEach((r) => {
    const p = r.parts.slice(); let label = p[0] || '';
    if (/^\*\s*/.test(label)) { const at = num(p[1]); need(at >= 0, 'milestone needs a number'); miles.push({ label: label.replace(/^\*\s*/, ''), at }); return; }
    let hot = false; if (/^!\s*/.test(label)) { hot = true; label = label.replace(/^!\s*/, ''); }
    const s = num(p[1]), l = num(p[2]); need(label && s >= 0 && l > 0, 'each task needs a name, a start and a length');
    tasks.push({ label, s, l, hot, note: p[3] || '' });
  });
  need(tasks.length >= 2 && tasks.length <= 12, 'gantt needs 2 to 12 tasks');
  const total = Math.max(1, ...tasks.map((t) => t.s + t.l), ...miles.map((m) => m.at));
  need(total <= 400, 'gantt is too long');
  const step = total <= 12 ? 1 : total <= 24 ? 2 : total <= 60 ? 5 : total <= 120 ? 10 : 50;
  let ticks = ''; for (let t = 0; t <= total; t += step) ticks += `<span style="left:${pct(t / total)}%">${t}</span>`;
  const grid = `style="--n:${total}"`;
  const rows = tasks.map((t) => `<div class="fg-gr"><div class="fg-gl">${inl(t.label)}</div><div class="fg-gt" ${grid}><i class="fg-bar${t.hot ? ' hot' : ''}" style="left:${pct(t.s / total)}%;width:${pct(t.l / total)}%"></i><span class="fg-gn${(t.s + t.l) / total > 0.7 ? ' flip' : ''}" style="${(t.s + t.l) / total > 0.7 ? 'right:' + pct(1 - t.s / total) : 'left:' + pct((t.s + t.l) / total)}%">${t.l}${t.note ? ' · ' + inl(t.note) : ''}</span></div></div>`).join('');
  const ms = miles.map((m) => `<div class="fg-gr"><div class="fg-gl"><span class="fg-dia"></span>${inl(m.label)}</div><div class="fg-gt" ${grid}><span class="fg-ms" style="left:${pct(m.at / total)}%"></span></div></div>`).join('');
  return `<div class="fg-gantt"><div class="fg-gr fg-gh"><div class="fg-gl fg-unit">${esc(unit)}s</div><div class="fg-gt fg-ticks">${ticks}</div></div>${rows}${ms}</div>`;
}

/* The network diagram works out the schedule itself, so the critical path shown is always the true one. */
function analyse(f) {
  const unit = f.kv.unit || 'day', nodes = [], by = {};
  f.rows.forEach((r) => {
    const id = r.parts[0], label = r.parts[1], dur = num(r.parts[2]), pre = (r.parts[3] || '-').split(',').map((x) => x.trim()).filter((x) => x && x !== '-');
    need(id && label && dur >= 0, 'each activity needs an id, a name and a duration'); need(!by[id], 'repeated id ' + id);
    const n = { id, label, dur, pre, succ: [] }; nodes.push(n); by[id] = n;
  });
  need(nodes.length >= 3 && nodes.length <= 10, 'network needs 3 to 10 activities');
  nodes.forEach((n) => n.pre.forEach((p) => { need(by[p], 'unknown predecessor ' + p); need(p !== n.id, 'activity cannot follow itself'); by[p].succ.push(n.id); }));
  const done = {}, order = [];
  const visit = (n, stack) => { if (done[n.id]) return; need(stack.indexOf(n.id) < 0, 'the activities loop back on themselves'); n.pre.forEach((p) => visit(by[p], stack.concat(n.id))); done[n.id] = true; order.push(n); };
  nodes.forEach((n) => visit(n, []));
  order.forEach((n) => { n.es = n.pre.length ? Math.max(...n.pre.map((p) => by[p].ef)) : 0; n.ef = n.es + n.dur; });
  const end = Math.max(...nodes.map((n) => n.ef));
  order.slice().reverse().forEach((n) => { n.lf = n.succ.length ? Math.min(...n.succ.map((s) => by[s].ls)) : end; n.ls = n.lf - n.dur; n.slack = n.ls - n.es; n.crit = Math.abs(n.slack) < 1e-9; });
  order.forEach((n) => { n.layer = n.pre.length ? 1 + Math.max(...n.pre.map((p) => by[p].layer)) : 0; });
  const path = []; let cur = order.filter((n) => n.crit && !n.pre.some((p) => by[p].crit && Math.abs(by[p].ef - n.es) < 1e-9))[0];
  while (cur) { path.push(cur.id); cur = cur.succ.map((s) => by[s]).filter((s) => s.crit && Math.abs(s.es - cur.ef) < 1e-9)[0]; }
  return { nodes, by, order, end, unit, path };
}
const wrap = (text, max) => {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  words.forEach((w) => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) lines.push(cur); need(lines.length <= 2 && lines.every((l) => l.length <= max + 4), 'an activity name is too long');
  return lines;
};
function network(f) {
  const a = analyse(f), W = 112, H = 62, GX = 14, GY = 38, PAD = 8;
  const layers = []; a.order.forEach((n) => { (layers[n.layer] = layers[n.layer] || []).push(n); });
  layers.forEach((L) => L.sort((p, q) => a.nodes.indexOf(p) - a.nodes.indexOf(q)));
  const LANE = 12, widest = Math.max(...layers.map((L) => L.length)), baseW = widest * W + (widest - 1) * GX + PAD * 2, VH = layers.length * H + (layers.length - 1) * GY + PAD * 2;
  const longN = a.nodes.reduce((c, n) => c + n.pre.filter((p) => n.layer - a.by[p].layer > 1).length, 0), VW = baseW + (longN ? 10 + longN * LANE : 0);
  layers.forEach((L, li) => { const rowW = L.length * W + (L.length - 1) * GX, x0 = (baseW - rowW) / 2; L.forEach((n, k) => { n.x = x0 + k * (W + GX); n.y = PAD + li * (H + GY); }); });
  let edges = '', boxes = '', lane = 0;
  a.nodes.forEach((n) => n.pre.forEach((p) => {
    const s = a.by[p], x1 = s.x + W / 2, y1 = s.y + H, x2 = n.x + W / 2, y2 = n.y, my = (y1 + y2) / 2, hot = s.crit && n.crit && Math.abs(s.ef - n.es) < 1e-9;
    let d;
    if (n.layer - s.layer > 1) { const lx = baseW + 4 + (lane++) * LANE; d = `M${x1} ${y1}C${x1} ${y1 + GY * 0.55} ${lx} ${y1 + GY * 0.15} ${lx} ${y1 + GY}L${lx} ${y2 - GY}C${lx} ${y2 - GY * 0.15} ${x2} ${y2 - GY * 0.55} ${x2} ${y2 - 5}`; }
    else d = `M${x1} ${y1}C${x1} ${my} ${x2} ${my} ${x2} ${y2 - 5}`;
    edges += `<path class="fg-e${hot ? ' hot' : ''}" d="${d}" marker-end="url(#fg-ah${hot ? 'h' : ''})"/>`;
  }));
  a.nodes.forEach((n) => {
    const ls = wrap(n.label, 15), top = ls.length === 1 ? 24 : 18;
    boxes += `<g class="fg-n${n.crit ? ' hot' : ''}"><rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="12"/>` +
      `<text class="fg-nid" x="${n.x + 10}" y="${n.y + 15}">${esc(n.id)}</text>` +
      ls.map((l, i) => `<text class="fg-nl" x="${n.x + W / 2}" y="${n.y + top + 6 + i * 14}" text-anchor="middle">${esc(l)}</text>`).join('') +
      `<text class="fg-nd" x="${n.x + W / 2}" y="${n.y + H - 8}" text-anchor="middle">${n.dur} ${esc(a.unit)}${n.dur === 1 ? '' : 's'}</text></g>`;
  });
  const arrow = (id, cls) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="${cls}" d="M0 1L9 5L0 9z"/></marker>`;
  const svg = `<svg class="fg-svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" focusable="false"><defs>${arrow('fg-ah', 'fg-ahp')}${arrow('fg-ahh', 'fg-ahp hot')}</defs>${edges}${boxes}</svg>`;
  const key = `<div class="fg-key"><span class="fg-kc"><i class="hot"></i>Critical path: ${a.path.map(esc).join(' → ')}</span><span class="fg-kc"><i></i>Has slack</span><b>Shortest possible time: ${a.end} ${esc(a.unit)}${a.end === 1 ? '' : 's'}</b></div>`;
  return `<div class="fg-net"><div class="fg-scroll" data-zw="${Math.round(VW * 1.5)}">${svg}</div>${key}</div>`;
}

function cycle(f) {
  const n = f.rows.length; need(n >= 3 && n <= 6, 'cycle needs 3 to 6 steps');
  const S = 240, C = S / 2, R = 82, r = 17, gap = 0.32;
  const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n, pt = (a, rad) => [C + rad * Math.cos(a), C + rad * Math.sin(a)];
  let arcs = '', dots = '';
  for (let i = 0; i < n; i++) {
    const a0 = ang(i) + gap * (r / R) * 1.5 + 0.1, a1 = ang(i + 1) - gap * (r / R) * 1.5 - 0.1, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    arcs += `<path class="fg-ar" d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" marker-end="url(#fg-ca)"/>`;
    const [cx, cy] = pt(ang(i), R); dots += `<g class="fg-cn"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"/><text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`;
  }
  const ctr = (f.kv.center || '').split(/\s+/).filter(Boolean); let ct = '';
  if (ctr.length) { const lines = []; let cur = ''; ctr.forEach((w) => { if ((cur + ' ' + w).trim().length > 14 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); lines.push(cur); need(lines.length <= 3, 'cycle centre text is too long'); ct = lines.map((l, i) => `<text class="fg-cc" x="${C}" y="${C + (i - (lines.length - 1) / 2) * 16 + 5}" text-anchor="middle">${esc(l)}</text>`).join(''); }
  const svg = `<svg class="fg-svg fg-ring" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" focusable="false"><defs><marker id="fg-ca" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="fg-ahp hot" d="M0 1L9 5L0 9z"/></marker></defs>${arcs}${dots}${ct}</svg>`;
  const legend = f.rows.map((x, i) => `<div class="fg-li"><span class="fg-num">${i + 1}</span><span class="fg-lt"><b>${inl(x.parts[0])}</b>${x.parts[1] ? `<span>${inl(x.parts[1])}</span>` : ''}</span></div>`).join('');
  return `<div class="fg-cycle">${svg}<div class="fg-legend">${legend}</div></div>`;
}

function tree(f) {
  need(f.rows.length >= 3 && f.rows.length <= 24, 'tree needs 3 to 24 items');
  need(f.rows[0].depth === 0, 'the first tree item must be the top');
  let prev = 0;
  const html = f.rows.map((r) => { need(r.depth <= 4 && r.depth <= prev + 1, 'tree indentation jumps too far'); prev = r.depth; return `<div class="fg-tn d${r.depth}" style="--d:${r.depth}"><span class="fg-tl">${inl(r.parts[0])}</span>${r.parts[1] ? `<span class="fg-td">${inl(r.parts[1])}</span>` : ''}</div>`; }).join('');
  return `<div class="fg-tree">${html}</div>`;
}

function bars(f) {
  need(f.rows.length >= 2 && f.rows.length <= 10, 'bars needs 2 to 10 rows');
  const vals = f.rows.map((r) => { let l = r.parts[0], hot = false; if (/^!\s*/.test(l)) { hot = true; l = l.replace(/^!\s*/, ''); } const v = num(r.parts[1]); need(l && v >= 0, 'each bar needs a name and a number'); return { l, v, hot }; });
  const max = Math.max(num(f.kv.max) || 0, ...vals.map((x) => x.v)); need(max > 0, 'bars need a value above zero');
  const unit = f.kv.unit ? ' ' + esc(f.kv.unit) : '';
  return `<div class="fg-bars">${vals.map((x) => `<div class="fg-br"><span class="fg-bl">${inl(x.l)}</span><span class="fg-bt"><i class="fg-bf${x.hot ? ' hot' : ''}" style="width:${pct(x.v / max)}%"></i></span><span class="fg-bv">${esc(String(x.v))}${unit}</span></div>`).join('')}</div>`;
}

function versus(f) {
  need(f.kv.left && f.kv.right, 'versus needs left and right headings'); need(f.rows.length >= 2 && f.rows.length <= 8, 'versus needs 2 to 8 rows');
  const hot = (f.kv.hot || '').toLowerCase(), hl = hot === 'left' ? ' hot' : '', hr = hot === 'right' ? ' hot' : '';
  const rows = f.rows.map((r) => { const p = r.parts; need(p.length >= 2, 'each versus row needs two sides'); const three = p.length >= 3; return `<div class="fg-vr">${three ? `<span class="fg-vk">${inl(p[0])}</span>` : ''}<span class="fg-vc${hl}">${inl(three ? p[1] : p[0])}</span><span class="fg-vc${hr}">${inl(three ? p[2] : p[1])}</span></div>`; }).join('');
  return `<div class="fg-versus"><div class="fg-vh"><span class="${hl.trim()}">${inl(f.kv.left)}</span><span class="${hr.trim()}">${inl(f.kv.right)}</span></div>${rows}</div>`;
}

const DRAW = { flow, matrix, gantt, network, cycle, tree, bars, versus };

/* ---------- one figure on the page ---------- */
let seq = 0;
function render(text) {
  const f = parse(text), id = 'fig' + (++seq);
  let vis = '', ok = true;
  try { need(TYPES.indexOf(f.type) >= 0, 'unknown figure type'); vis = DRAW[f.type](f); }
  catch (e) { ok = false; if (!(e instanceof FigErr)) { try { console.warn('figure error', e); } catch (x) { /* ignore */ } } }
  const title = f.title ? `<p class="fig-title"><span class="fig-k">Figure</span> <span>${inl(f.title)}</span></p>` : '';
  const cap = f.caption ? `<p class="fig-cap">${inl(f.caption)}</p>` : '';
  if (!ok) return `<figure class="fig fig-off" data-fid="${id}">${title}${cap}</figure>`;
  const big = f.type === 'network' || f.type === 'gantt' || f.type === 'cycle';
  return `<figure class="fig fg-t-${f.type}" data-fid="${id}">${title}<div class="fig-vis" aria-hidden="true" data-ftype="${f.type}">${vis}</div>${cap}${big ? `<button type="button" class="fig-zoom" data-act="fig-zoom" data-fid="${id}" aria-label="Enlarge this figure">Enlarge</button>` : ''}</figure>`;
}

/* A plain-text version for the tutor and the voice: title, then the caption that says what the figure shows. */
function spoken(text) { const f = parse(text); return (f.title ? 'Figure: ' + f.title.replace(/\*+/g, '') + '. ' : 'Figure. ') + (f.caption || '').replace(/\*+/g, ''); }

/* ---------- enlarge ---------- */
function zoom(fid) {
  const src = document.querySelector('figure.fig[data-fid="' + fid + '"] .fig-vis'); if (!src) return;
  const old = document.getElementById('fig-ov'); if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'fig-ov'; ov.className = 'ov fig-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Enlarged figure'); ov.dataset.act = 'fig-close';
  const t = (src.parentNode.querySelector('.fig-title') || {}).textContent || '';
  ov.innerHTML = `<div class="ov-card pn-strong fig-zcard" data-act="fig-keep"><div class="fig-zh"><b>${esc(t)}</b><button type="button" class="btn sm" data-act="fig-close">Close</button></div><div class="fig-zb fig-vis" data-ftype="${esc(src.dataset.ftype)}">${src.innerHTML}</div></div>`;
  document.body.appendChild(ov);
  const b = ov.querySelector('button[data-act="fig-close"]'); if (b) b.focus();
}
REG.acts['fig-zoom'] = (t, d) => zoom(d.fid);
REG.acts['fig-close'] = () => { const o = document.getElementById('fig-ov'); if (o) o.remove(); };
REG.acts['fig-keep'] = () => {};

/* Used by the course checker (tools/validate_pack.py): says whether a spec will draw, and why not if it will not. */
function check(text) {
  const f = parse(text);
  try {
    need(TYPES.indexOf(f.type) >= 0, 'unknown figure type "' + f.type + '" (use ' + TYPES.join(', ') + ')');
    need(f.title && f.title.length <= 90, 'a figure needs a title of at most 90 characters');
    need(f.caption.length >= 30 && f.caption.length <= 320, 'the caption must be 30 to 320 characters (it is read aloud and is the text version)');
    DRAW[f.type](f);
    let info = '';
    if (f.type === 'network') { const a = analyse(f); info = 'critical path ' + a.path.join(' > ') + ', ' + a.end + ' ' + a.unit + 's in total. Check the caption says the same.'; }
    return { ok: true, type: f.type, title: f.title, info };
  } catch (e) { return { ok: false, type: f.type, title: f.title, error: e.message }; }
}

window.KVFig = { render, parse, spoken, check, analyse: (text) => analyse(parse(text)), TYPES: TYPES.slice() };
})();
