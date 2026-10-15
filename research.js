/* Research: web search for Build a course (Tavily key, kept on this device), a keyless Wikipedia fallback, verified videos for lessons, and the setup guide. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const FREE_CREDITS = 1000;
const esc = (s) => A().esc(s);
const monthKey = () => new Date().toISOString().slice(0, 7);
function cfg() { const S = A().S; if (!S.research) S.research = { key: '', ok: false, used: { m: monthKey(), n: 0 }, dismissed: 0 }; if (!S.research.used || S.research.used.m !== monthKey()) S.research.used = { m: monthKey(), n: 0 }; return S.research; }
function bump(n) { const c = cfg(); c.used.n += (n || 1); A().save(); }

/* ---------- status ---------- */
function hasKey() { return !!cfg().key; }
function status() { const c = cfg(); if (!c.key) return 'nokey'; if (c.bad) return 'badkey'; return 'ready'; }
function creditsLeft() { return Math.max(0, FREE_CREDITS - cfg().used.n); }

/* ---------- calls ---------- */
async function post(path, body) {
  const r = await fetch('/__studio/' + path, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok && r.status === 404) return { ok: false, code: 'oldlauncher' };
  return r.json();
}
async function search(query, opt) {
  opt = opt || {}; const c = cfg();
  if (!c.key) return { ok: false, code: 'nokey' };
  let res;
  if (A().DESK) {
    try { res = await post('search', { key: c.key, query, domains: opt.domains, max: opt.max || 5 }); } catch (e) { res = { ok: false, code: 'offline' }; }
  } else {
    /* In a plain browser the search service may refuse the request. We try once and report honestly. */
    try {
      const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, body: JSON.stringify({ query, search_depth: 'basic', max_results: opt.max || 5, include_domains: opt.domains }) });
      if (r.status === 401 || r.status === 403) res = { ok: false, code: 'badkey' };
      else if (r.status === 429 || r.status === 432 || r.status === 433) res = { ok: false, code: 'limit' };
      else if (!r.ok) res = { ok: false, code: 'error' };
      else { const d = await r.json(); res = { ok: true, results: (d.results || []).map((x) => ({ title: x.title || '', url: x.url, content: String(x.content || '').slice(0, 1500), date: x.published_date || '' })) }; }
    } catch (e) { res = { ok: false, code: 'browser' }; }
  }
  if (res.ok || ['limit', 'error'].includes(res.code)) bump(1);
  if (res.code === 'badkey') { c.bad = true; A().save(); }
  return res;
}
async function wiki(query) {
  if (!A().DESK) return { ok: false, code: 'browser' };
  try { return await post('wiki', { query }); } catch (e) { return { ok: false, code: 'offline' }; }
}
const VID = /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;
/* Videos are only shown when the launcher confirmed that they exist and can be played. */
async function videos(query, max) {
  if (!A().DESK) return { ok: false, code: 'browser', videos: [] };
  const r = await search(query + ' tutorial', { domains: ['youtube.com'], max: 8 });
  if (!r.ok) return { ok: false, code: r.code, videos: [] };
  const ids = []; (r.results || []).forEach((x) => { const m = String(x.url).match(VID); if (m && !ids.includes(m[1])) ids.push(m[1]); });
  if (!ids.length) return { ok: true, videos: [] };
  let chk; try { chk = await post('videocheck', { ids: ids.slice(0, 8) }); } catch (e) { return { ok: false, code: 'offline', videos: [] }; }
  if (!chk || !chk.ok) return { ok: false, code: 'oldlauncher', videos: [] };
  return { ok: true, videos: (chk.videos || []).filter((v) => v.ok).slice(0, max || 3).map((v) => ({ id: v.id, title: v.title, channel: v.author })) };
}
async function testKey() {
  const r = await search('what is photosynthesis', { max: 1 });
  const c = cfg();
  if (r.ok) { c.ok = true; c.bad = false; c.tested = Date.now(); A().save(); return { ok: true }; }
  c.ok = false; A().save();
  return r;
}
window.KVResearch = { status, hasKey, search, wiki, videos, creditsLeft, FREE_CREDITS, cfg, testKey, VID };

/* ---------- setup guide screen ---------- */
const MSG = {
  badkey: 'The key was not accepted. Check that you copied all of it, including the part that starts with tvly-.',
  limit: 'The key works, but this month\'s free credits are used up. Searches will work again when the month renews, or you can add credits in your Tavily account.',
  offline: 'Could not reach the search service. Check your internet and try again.',
  browser: 'This browser blocked the request. Open Knowvia from the desktop app instead, where it works.',
  oldlauncher: 'Close Knowvia and open it again once, so the new launcher starts. Then test again.',
  error: 'The search service had a problem. Try again in a minute.',
  nokey: 'Paste your key first.'
};
let testMsg = null, testing = false;
function screen() {
  const a = A(), c = cfg(), st = status(), used = c.used.n, left = creditsLeft();
  const badge = c.ok && st === 'ready' ? '<span class="badge ok">Working</span>' : c.key ? '<span class="badge warn">Not tested</span>' : '<span class="badge">Not set up</span>';
  const step = (n, t, body) => `<li class="gstep"><span class="gn">${n}</span><div><b>${t}</b><p>${body}</p></div></li>`;
  return `<div class="page research">
    <button class="btn sm back-l" data-act="nav" data-r="me">${a.ic(a.I.back, 18, 2)}Back</button>
    <div class="b-hero kv-in"><p class="eyebrow">Web research ${badge}</p><h1>Let Amani check the real web</h1>
      <p class="lede">With a free search key, Amani researches your topic on the web before she builds a course. Lessons are written from what she finds, with numbered sources and verified videos. It takes about three minutes to set up, and you only do it once.</p></div>
    <section class="pn-strong psec kv-in" style="--d:1"><h2>Set it up</h2>
      <ol class="gsteps">
        ${step(1, 'Open Tavily and create a free account', 'Go to <a href="https://app.tavily.com" target="_blank" rel="noopener">app.tavily.com</a> and sign up with Google or your email. No card is asked for on the free plan.')}
        ${step(2, 'Copy your API key', 'After signing in, your key is shown on the dashboard. It starts with <b>tvly-</b>. Use the copy button next to it.')}
        ${step(3, 'Paste it here and test it', 'Paste the key below, then press Test. Knowvia runs one small search to be sure it works.')}
      </ol>
      <div class="field"><label for="rs-key">Your Tavily key</label><input id="rs-key" data-in="rs-key" type="password" placeholder="tvly-..." value="${esc(c.key)}" autocomplete="off" spellcheck="false"></div>
      <div class="row-actions"><button class="btn primary" data-act="rs-test" ${testing ? 'disabled' : ''}>${testing ? '<span class="spin"></span>Testing...' : 'Test and save'}</button>${c.key ? '<button class="btn" data-act="rs-clear">Remove key</button>' : ''}<a class="btn" href="https://app.tavily.com" target="_blank" rel="noopener">Open Tavily</a></div>
      ${testMsg ? `<div class="verdict ${testMsg.ok ? 'good' : 'bad'}" role="status"><p>${esc(testMsg.text)}</p></div>` : ''}
    </section>
    <section class="pn-strong psec kv-in" style="--d:2"><h2>Good to know</h2>
      <ul class="know">
        <li><b>It is free to start.</b> The free plan gives 1,000 search credits a month. One search uses one credit. This month you have used about ${used} here, so roughly ${left} remain.</li>
        <li><b>What a course uses.</b> A short course uses about 8 to 14 credits, a standard one about 25 to 45, and a deep one about 45 to 80. Videos use one credit per lesson that has them.</li>
        <li><b>Your key stays on this computer.</b> It is saved in your Knowvia settings and sent only to the search service. It is never shared with us or anyone else.</li>
        <li><b>What leaves your computer.</b> The topic words Amani searches for, such as "keyframes in video editing". Do not type private information into a course topic.</li>
        <li><b>Videos play in Knowvia.</b> Amani only shows videos she has confirmed exist and can be played. A video uses your data only when you open it.</li>
        <li><b>No key, no problem.</b> Courses still build, but only from the model's own knowledge, so they are clearly marked as not researched. A free encyclopedia lookup is used to help a little.</li>
        <li><b>It needs internet.</b> Research runs while the course is built. The finished course works offline.</li>
        <li><b>Plans can change.</b> Free limits belong to Tavily and may change. Check <a href="https://docs.tavily.com/documentation/api-credits" target="_blank" rel="noopener">their credit page</a> for the latest.</li>
      </ul>
    </section></div>`;
}
REG.screens.research = screen; REG.names.research = 'Web research';
REG.ins['rs-key'] = (t) => { const c = cfg(); c.key = t.value.trim(); c.ok = false; c.bad = false; testMsg = null; A().save(); };
REG.acts['rs-test'] = async () => {
  const a = A(), c = cfg(), inp = a.$('#rs-key'); if (inp) c.key = inp.value.trim();
  if (!c.key) { testMsg = { ok: false, text: MSG.nokey }; a.renderScreen(); return; }
  c.bad = false; testing = true; testMsg = null; a.renderScreen();
  const r = await testKey(); testing = false;
  testMsg = r.ok ? { ok: true, text: 'It works. Amani will now research the web when she builds courses.' } : { ok: false, text: MSG[r.code] || MSG.error };
  if (r.code === 'limit') { c.ok = true; c.bad = false; a.save(); }
  a.renderScreen();
};
REG.acts['rs-clear'] = () => { const c = cfg(); c.key = ''; c.ok = false; c.bad = false; testMsg = null; A().save(); A().renderScreen(); A().toast('Search key removed'); };
REG.acts['rs-later'] = () => { cfg().dismissed = Date.now() + 14 * 86400000; A().save(); A().renderScreen(); };

/* ---------- Me card and Home nudge ---------- */
const prevMe = REG.hooks.meCard;
REG.hooks.meCard = () => {
  const a = A(), st = status(), c = cfg();
  const line = st === 'ready' && c.ok ? `Working. About ${creditsLeft()} free credits left this month.` : st === 'badkey' ? 'The key was not accepted. Open the guide to fix it.' : c.key ? 'Key saved but not tested yet.' : 'Not set up. Courses will be written from the model\'s own knowledge.';
  return (prevMe ? prevMe() : '') + `<section class="setting pn-strong"><h3>Web research</h3><p class="help">${esc(line)}</p><div class="row-actions"><button class="btn ${st === 'ready' && c.ok ? '' : 'primary'}" data-act="nav" data-r="research">${st === 'ready' && c.ok ? 'Manage' : 'Set up free web research'}</button></div></section>`;
};
REG.hooks.homeCard = () => {
  const a = A(), c = cfg();
  if (!a.S.onboarded || c.key || (c.dismissed || 0) > Date.now()) return '';
  return `<section class="nudge pn-strong kv-in" style="--d:2"><span class="ico">${a.ic(a.I.spark, 24, 1.8)}</span><div class="grow"><b>Want better courses? Turn on web research.</b><p>A free search key lets Amani check real sources and find verified videos. Setup takes about three minutes.</p></div>
    <div class="row-actions"><button class="btn primary sm" data-act="nav" data-r="research">Set it up</button><button class="btn sm" data-act="rs-later">Not now</button></div></section>`;
};

/* ---------- Lesson videos and sources ---------- */
REG.hooks.lessonExtra = (l) => {
  const a = A(); let h = '';
  const vids = (l.videos || []).filter((v) => v && /^[A-Za-z0-9_-]{11}$/.test(v.id));
  if (vids.length) {
    h += `<section class="vids pn-strong" aria-label="Optional videos"><button class="vhead" data-act="vid-toggle" aria-expanded="false"><span class="ico">${a.ic('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>', 22, 1.8)}</span><span class="grow"><b>Watch this explained</b><span class="s">Optional. ${vids.length} checked video${vids.length > 1 ? 's' : ''}. Uses no data until you open it.</span></span><span class="chev">${a.ic('<path d="M6 9l6 6 6-6"/>', 18, 2)}</span></button>
      <div class="vbody" hidden>${vids.map((v) => `<div class="vcard"><div class="vplay" data-vid="${v.id}"><button class="vthumb" data-act="vid-play" data-id="${v.id}" aria-label="Play ${esc(v.title || 'video')}"><span class="vbtn">${a.ic('<path d="M8 5.5v13l11-6.5z"/>', 28, 1.5)}</span></button></div>
        <div class="vmeta"><b>${esc(v.title || 'Video')}</b><span class="s">${esc(v.channel || '')}</span><a class="btn sm" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">Open on YouTube</a></div></div>`).join('')}</div></section>`;
  }
  const refs = (l.refs || []).filter((r) => r && /^https?:\/\//.test(r.url));
  if (refs.length) h += `<section class="refs"><h3>Sources for this lesson</h3><ol>${refs.map((r) => `<li value="${r.n}"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><span class="s"> ${esc(r.host || '')}${r.date ? ', read ' + esc(r.date) : ''}</span></li>`).join('')}</ol></section>`;
  return h;
};
REG.acts['vid-toggle'] = (t) => { const body = t.parentElement.querySelector('.vbody'); if (!body) return; const open = body.hidden; body.hidden = !open; t.setAttribute('aria-expanded', String(open)); t.classList.toggle('open', open); };
REG.acts['vid-play'] = (t, d) => {
  const box = t.closest('.vplay'); if (!box || !/^[A-Za-z0-9_-]{11}$/.test(d.id)) return;
  box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${d.id}?rel=0&autoplay=1&playsinline=1" title="Video" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
};
})();
