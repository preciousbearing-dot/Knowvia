/* Knowvia Find (screen): "Find on the web". Search, let Amani rank the results, pick several, and build one merged course. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; });
const A = () => window.KVApp, K = () => window.KVSources, FD = () => window.KVFind;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_PICK = 6, MAX_CHARS = 1500000;
const LEVELS = [['beginner', 'a complete beginner'], ['some', 'someone who knows the basics'], ['exam', 'preparing for an exam or a job']];
const F = { q: '', level: 'beginner', phase: 'ask', results: [], picked: new Set(), by: '', used: [], errors: [], err: '', ctrl: null, prog: [], msg: '', showAll: false, showKeys: false };
const ov = () => document.getElementById('find-ov');
const mins = (s) => (s >= 3600 ? Math.floor(s / 3600) + ' h ' + String(Math.round((s % 3600) / 60)).padStart(2, '0') + ' min' : Math.max(1, Math.round(s / 60)) + ' min');
const KIND = { video: 'Video', article: 'Article', pdf: 'PDF' };

function resultCard(x) {
  const on = F.picked.has(x.id), meta = [x.site, KIND[x.kind] || 'Page', x.secs ? mins(x.secs) : ''].filter(Boolean).join(' · ');
  return `<div class="find-r ${on ? 'on' : ''} ${x.skip ? 'weak' : ''}"><button type="button" class="find-pick" data-act="find-pick" data-id="${esc(x.id)}" aria-pressed="${on}"><span class="find-ck" aria-hidden="true">${on ? '&#10003;' : ''}</span><span class="grow"><b>${esc(x.title)}</b><span class="s">${esc(meta)}</span>${x.verdict ? `<span class="v">${esc(x.verdict)}</span>` : ''}</span></button><a class="find-open" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer nofollow">Preview</a></div>`;
}
function body() {
  if (F.phase === 'searching') return `<h3>Looking for the best material</h3><p class="help">Searching for <b>${esc(F.q)}</b>. Amani then reads the results and picks the ones worth your time.</p><div class="bar"><i style="width:45%"></i></div><div class="row-actions"><button class="btn" data-act="find-cancel">Cancel</button></div>`;
  if (F.phase === 'building') return `<h3>${F.merging ? 'Amani is building your course' : 'Reading your sources'}</h3><p class="help" id="find-msg">${esc(F.msg || 'Starting')}</p><ul class="of-stages find-prog">${F.prog.map((p) => `<li class="${p.state}" data-pid="${esc(p.id)}">${p.state === 'done' ? A().ic(A().I.check, 14, 2.8) : p.state === 'bad' ? '<i class="bad">!</i>' : '<i></i>'}<span>${esc(p.title)}${p.msg ? `<small>${esc(p.msg)}</small>` : ''}</span></li>`).join('')}</ul><p class="help">Keep the app open. Only web addresses are sent to the websites. The reading and planning happen here, with your own cloud model.</p><div class="row-actions"><button class="btn" data-act="find-cancel">Cancel</button></div>`;
  if (F.phase === 'results') {
    const shown = F.results.filter((x) => F.showAll || !x.skip), n = F.picked.size, weak = F.results.filter((x) => x.skip).length;
    return `<h3>Found for you</h3><p class="help">${F.by === 'ai' ? 'Amani ranked these for' : 'Ranked for'} <b>${esc(F.q)}</b>. Pick up to ${MAX_PICK}. With more than one, Amani merges them into a single course ordered by topic.</p>
      ${F.err ? `<p class="help prep-err">${esc(F.err)}</p>` : ''}
      <div class="find-list">${shown.map(resultCard).join('') || '<p class="help">Nothing good turned up. Try other words.</p>'}</div>
      ${weak && !F.showAll ? `<p class="help"><button class="linkbtn" data-act="find-more">Show ${weak} weaker ${weak === 1 ? 'result' : 'results'}</button></p>` : ''}
      <div class="row-actions"><button class="btn primary" data-act="find-build" ${n ? '' : 'disabled'}>${n > 1 ? 'Build one course from ' + n + ' sources' : n === 1 ? 'Build a course from this' : 'Pick at least one'}</button><button class="btn" data-act="find-again">Search again</button><button class="btn" data-act="find-close">Close</button></div>`;
  }
  const ps = FD().providers(), best = ps[0] === 'gemini' ? 'Gemini with Google Search' : ps[0] === 'brave' ? 'Brave Search' : ps[0] === 'tavily' ? 'Tavily' : 'the free search';
  const k = FD().keys();
  return `<h3>Find on the web</h3><p class="help">Say what you want to learn. Amani searches for articles, YouTube lessons and PDFs, tells you which are worth it, and can merge several into one course.</p>
    ${F.err ? `<div class="warnbox">${esc(F.err)}</div>` : ''}
    <div class="field"><label for="find-q">What do you want to learn?</label><input id="find-q" type="search" placeholder="For example: fractions for SS1, or how to start freelance writing" autocomplete="off" value="${esc(F.q)}" maxlength="160"></div>
    <div class="chips find-lv" role="group" aria-label="Your level">${LEVELS.map(([id, nm]) => `<button type="button" class="chip ${F.level === id ? 'on' : ''}" data-act="find-level" data-l="${id}" aria-pressed="${F.level === id}">${id === 'beginner' ? 'Beginner' : id === 'some' ? 'I know the basics' : 'Exam or job prep'}</button>`).join('')}</div>
    <p class="help">Searching with <b>${esc(best)}</b>${ps[0] === 'free' ? '. Connect Gemini in Me for much better results.' : '.'}${A().isNative ? '' : ' Reading the pages works best in the Knowvia Android app.'}</p>
    <div class="row-actions"><button class="btn primary" data-act="find-go">Search</button>${ps[0] === 'free' ? '<button class="btn" data-act="nav" data-r="me">Connect Gemini</button>' : ''}<button class="btn" data-act="find-close">Cancel</button></div>
    <p class="help"><button class="linkbtn" data-act="find-keys">${F.showKeys ? 'Hide search settings' : 'Search settings (optional)'}</button></p>
    ${F.showKeys ? `<div class="field"><label for="find-brave">Brave Search key (free plan)</label><input id="find-brave" type="password" autocomplete="off" value="${esc(k.brave)}" placeholder="Optional"></div><div class="field"><label for="find-tavily">Tavily key (free plan)</label><input id="find-tavily" type="password" autocomplete="off" value="${esc(k.tavily)}" placeholder="Optional"></div><div class="row-actions"><button class="btn sm" data-act="find-savekeys">Save keys</button></div><p class="help">Keys stay on this device. Gemini is used automatically when you have connected it.</p>` : ''}`;
}
function paint() { const o = ov(); if (o) o.querySelector('.ov-card').innerHTML = body(); }
function open() {
  F.phase = 'ask'; F.err = ''; let o = ov();
  if (!o) { o = document.createElement('div'); o.id = 'find-ov'; o.className = 'ov'; o.innerHTML = '<div class="ov-card pn-strong kv-in find-card" role="dialog" aria-modal="true" aria-label="Find on the web"></div>'; document.body.appendChild(o); }
  paint(); const f = document.getElementById('find-q'); if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
}
function close() { if (F.ctrl) { try { F.ctrl.abort(); } catch (e) { /* ignore */ } } F.ctrl = null; const o = ov(); if (o) o.remove(); }

async function go() {
  const el = document.getElementById('find-q'); F.q = String((el && el.value) || F.q).replace(/\s+/g, ' ').trim();
  if (F.q.length < 3) { F.err = 'Type what you want to learn first.'; paint(); return; }
  F.err = ''; F.phase = 'searching'; F.ctrl = new AbortController(); paint(); const my = F.ctrl;
  const lvl = (LEVELS.find((l) => l[0] === F.level) || LEVELS[0])[1];
  try {
    const r = await FD().search(F.q, { level: lvl, signal: my.signal });
    if (my.signal.aborted) return;
    if (!r.results.length) { F.phase = 'ask'; F.err = r.errors.length ? 'The search could not reach the web (' + r.errors[0] + '). Check your internet, or connect Gemini in Me.' : 'Nothing was found. Try different words.'; paint(); return; }
    const ranked = await FD().rank(F.q, lvl, r.results, { signal: my.signal }); if (my.signal.aborted) return;
    F.results = ranked.results; F.by = ranked.by; F.used = r.used; F.errors = r.errors; F.showAll = false;
    F.picked = new Set(F.results.filter((x) => !x.skip && x.score >= 6).slice(0, 3).map((x) => x.id));
    F.phase = 'results'; paint();
  } catch (e) { if (e && e.name === 'AbortError') return; F.phase = 'ask'; F.err = 'The search did not work: ' + String((e && e.message) || e).slice(0, 140); paint(); }
}

/* read one picked result into a stored source */
async function readPick(p, ctx) {
  let src;
  if (p.kind === 'pdf') {
    ctx.onProgress({ frac: 0.1, msg: 'Downloading the PDF' }); const blob = await K().httpBlob(p.url);
    const name = (decodeURIComponent((new URL(p.url).pathname.split('/').pop()) || 'document') || 'document').replace(/[^\w.\- ]+/g, '_').replace(/(\.pdf)?$/i, '.pdf');
    src = await K().ingest({ kind: 'file', file: new File([blob], name, { type: 'application/pdf' }) }, ctx);
  } else src = await K().ingest({ kind: p.kind === 'video' ? 'youtube' : 'web', url: p.url }, ctx);
  return src;
}
const why = (e) => String((e && e.message) || e || 'unknown problem').replace(/\s+/g, ' ').slice(0, 160);
function mark(id, state, msg) { const it = F.prog.find((x) => x.id === id); if (it) { it.state = state; it.msg = msg || ''; } const li = document.querySelector('#find-ov li[data-pid="' + id + '"]'); if (li) { li.className = state; const sp = li.querySelector('span'); if (sp) sp.innerHTML = esc(it.title) + (it.msg ? `<small>${esc(it.msg)}</small>` : ''); } }

async function build() {
  const picks = F.results.filter((x) => F.picked.has(x.id)).slice(0, MAX_PICK); if (!picks.length) return;
  F.err = ''; F.phase = 'building'; F.merging = false; F.msg = 'Reading ' + picks.length + (picks.length === 1 ? ' source' : ' sources'); F.prog = picks.map((p) => ({ id: p.id, title: p.title.slice(0, 70), state: 'wait', msg: 'Waiting' })); F.ctrl = new AbortController(); paint();
  const my = F.ctrl, sig = my.signal, got = [], failed = []; let next = 0;
  const lane = async () => {
    while (next < picks.length) {
      const p = picks[next++]; if (sig.aborted) return; mark(p.id, 'now', 'Starting');
      try {
        const src = await readPick(p, { signal: sig, onProgress: (x) => mark(p.id, 'now', x.msg || '') });
        if (src.scanned) { try { await K().Store.remove(src.id); } catch (e) { /* ignore */ } throw new Error('This PDF is made of scanned pictures. Add it on its own so a cloud model can read the pages.'); }
        got.push({ pick: p, src }); mark(p.id, 'done', Math.round(src.stats.chars / 5).toLocaleString('en-US') + ' words');
      } catch (e) { if (e && (e.name === 'Cancelled' || e.name === 'AbortError')) return; failed.push({ pick: p, why: why(e) }); mark(p.id, 'bad', why(e)); }
    }
  };
  try {
    await Promise.all([lane(), lane()]); if (sig.aborted) { await dropAll(got); return; }
    got.sort((a, b) => picks.indexOf(a.pick) - picks.indexOf(b.pick));
    if (!got.length) { F.phase = 'results'; F.err = 'None of them could be read. ' + (failed[0] ? failed[0].why : ''); paint(); return; }
    const a = A();
    if (got.length === 1) {
      const src = got[0].src, pack = window.KVSrcUI.makePack(src); await window.KVStore.save(pack); a.addPack(pack); close(); a.toast('Added: ' + src.title + (failed.length ? ' (' + failed.length + ' could not be read)' : '')); a.go('source/' + src.id); return;
    }
    F.merging = true; F.msg = 'Amani is planning the course from ' + got.length + ' sources'; paint();
    const parts = got.map((g, i) => ({ n: i + 1, src: g.src, kind: g.pick.kind })), total = parts.reduce((x, p) => x + p.src.stats.chars, 0);
    if (total > MAX_CHARS) { await dropAll(got); F.phase = 'results'; F.err = 'Together these are too long for one course on a phone. Pick fewer or shorter sources.'; paint(); return; }
    const lvl = (LEVELS.find((l) => l[0] === F.level) || LEVELS[0])[1], pl = await FD().plan(F.q, lvl, parts, { signal: sig }); if (sig.aborted) { await dropAll(got); return; }
    const bundle = FD().buildBundle(parts, pl, F.q);
    if (failed.length) bundle.notes.push('Could not read: ' + failed.map((f) => f.pick.title.slice(0, 50) + ' (' + f.why.slice(0, 80) + ')').join('; '));
    if (pl.by !== 'ai') bundle.notes.push('Amani could not plan by topic this time, so the course follows the order of your sources.');
    await K().Store.put(bundle); K().tools.buildIndex(bundle);
    for (const g of got) { try { await K().Store.remove(g.src.id); } catch (e) { /* ignore */ } }
    const pack = window.KVSrcUI.makePack(bundle); await window.KVStore.save(pack); a.addPack(pack);
    close(); a.toast('Course ready: ' + bundle.title.slice(0, 50)); a.go('source/' + bundle.id);
  } catch (e) {
    if (e && (e.name === 'Cancelled' || e.name === 'AbortError')) { await dropAll(got); return; }
    await dropAll(got); F.phase = 'results'; F.err = 'The course could not be built: ' + why(e); paint();
  } finally { if (F.ctrl === my) F.ctrl = null; }
}
async function dropAll(got) { for (const g of got) { try { await K().Store.remove(g.src.id); } catch (e) { /* ignore */ } } }

REG.acts['find-open'] = () => open();
REG.acts['find-close'] = () => close();
REG.acts['find-cancel'] = () => { if (F.ctrl) F.ctrl.abort(); F.ctrl = null; if (F.phase === 'searching') { F.phase = 'ask'; paint(); } else if (F.phase === 'building') { F.phase = F.results.length ? 'results' : 'ask'; paint(); A().toast('Cancelled'); } };
REG.acts['find-go'] = () => go();
REG.acts['find-level'] = (t, d) => { F.level = d.l; const el = document.getElementById('find-q'); if (el) F.q = el.value; paint(); };
REG.acts['find-pick'] = (t, d) => { if (F.picked.has(d.id)) F.picked.delete(d.id); else if (F.picked.size >= MAX_PICK) { A().toast('Pick up to ' + MAX_PICK + ' sources'); return; } else F.picked.add(d.id); F.err = ''; paint(); };
REG.acts['find-more'] = () => { F.showAll = true; paint(); };
REG.acts['find-again'] = () => { F.phase = 'ask'; F.err = ''; paint(); };
REG.acts['find-build'] = () => build();
REG.acts['find-keys'] = () => { const el = document.getElementById('find-q'); if (el) F.q = el.value; F.showKeys = !F.showKeys; paint(); };
REG.acts['find-savekeys'] = () => { const k = FD().keys(), b = document.getElementById('find-brave'), t = document.getElementById('find-tavily'); k.brave = String((b && b.value) || '').trim(); k.tavily = String((t && t.value) || '').trim(); A().save(); A().toast('Search keys saved'); const el = document.getElementById('find-q'); if (el) F.q = el.value; paint(); };
document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target && ev.target.id === 'find-q') { ev.preventDefault(); go(); } });
window.KVFindUI = { F, open, go, build, body };
})();
