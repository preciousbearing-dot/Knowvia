/* Build a course: pick a topic, pick a model, and Amani builds a full course using the Course Craft Playbook. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const CAT = window.KV_CATALOG || { trending: [], cats: [] };
const PB = () => window.PLAYBOOK || { core: '', types: {}, blocks: '', full: '' };
const BS = { view: 'catalog', q: '', cat: 'all', topic: '', level: 'Beginner', depth: 'standard', research: true, modelKey: 'auto', stall: 'offer', agent: null, interview: true, review: false, iv: null, ivT: 0, job: null, last: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Models ---------------- */
function score(k, m) {
  const n = String(m || '').toLowerCase(); let s;
  if (k === 'local') { s = 10; const b = n.match(/(\d+(?:\.\d+)?)b/); if (b) s += Math.min(parseFloat(b[1]), 30); return s; }
  s = 50;
  if (/gemini-3.*pro|gemini-2\.5-pro/.test(n)) s += 45; else if (/gemini-3.*flash|gemini-2\.5-flash$/.test(n)) s += 38; else if (/flash-lite/.test(n)) s += 26; else if (/gemini/.test(n)) s += 24;
  if (/gpt-oss-120b/.test(n)) s += 36; else if (/gpt-oss-20b/.test(n)) s += 24;
  if (/llama.*70b/.test(n)) s += 32; else if (/llama.*(8b|3b|1b)/.test(n)) s += 10;
  if (/deepseek/.test(n)) s += 30; if (/grok/.test(n)) s += 34; if (/mistral.*(large|medium)/.test(n)) s += 30; if (/qwen.*(235|72|32)b/.test(n)) s += 30;
  const b = n.match(/(\d+)b/); if (b) s += Math.min(+b[1] / 6, 14);
  if (/(preview|exp|vision|guard|tiny|mini)/.test(n)) s -= 6;
  return s;
}
function choices() {
  const a = A(), out = [];
  a.localModelList().forEach((m) => out.push({ k: 'local', p: '', m, label: m, group: 'On this device · offline', s: score('local', m) }));
  a.PROV_TOP.concat(a.PROV_ALT).forEach((id) => {
    const c = a.cloudCfg(id); if (!c.ok || !c.key) return;
    const list = Array.from(new Set([c.model].concat(c.models || []))).filter(Boolean);
    list.map((m) => ({ k: 'cloud', p: id, m, label: m, group: a.PROV[id].name + ' · cloud', s: score('cloud', m) + (m === c.model ? 1 : 0) })).sort((x, y) => y.s - x.s).slice(0, 4).forEach((x) => out.push(x));
  });
  out.sort((x, y) => y.s - x.s);
  if (out.length) out[0].rec = true;
  return out;
}
const keyOf = (c) => c.k + '|' + c.p + '|' + c.m;
function chosen(list) { if (BS.modelKey === 'auto') return list[0]; return list.find((c) => keyOf(c) === BS.modelKey) || list[0]; }
function fmtMins(m) { if (m < 60) return Math.max(1, Math.round(m / 5) * 5 || 1) + ' minutes'; const h = m / 60; return (Math.round(h * 2) / 2) + ' hours'; }
function estimate(c, depth, np) { const D = DEPTH[depth], per = c && c.k === 'local' ? D.per[1] : D.per[0] * 0.65 / Math.max(1, Math.min(3, np || 1)), lo = D.lessons[0] * per / 60 + 2, hi = D.lessons[1] * per / 60 + 4; return 'about ' + fmtMins(lo).replace(' minutes', '').replace(' hours', '') + ' to ' + fmtMins(hi); }

/* ---------------- Search ---------------- */
function lev1(a, b) { if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; } } return d + (a.length - i) + (b.length - j) <= 1; }
function search(q) {
  const toks = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); if (!toks.length) return [];
  const res = [];
  CAT.cats.forEach((c) => c.courses.forEach((x) => {
    const title = x[0].toLowerCase(), words = (title + ' ' + x[2]).split(/[^a-z0-9]+/), blurb = x[1].toLowerCase(); let s = 0;
    toks.forEach((t) => {
      if (title.includes(t)) s += 4; else if (words.some((w) => w.startsWith(t))) s += 3; else if (blurb.includes(t)) s += 1;
      else if (t.length >= 5 && words.some((w) => w.length >= 4 && lev1(t, w))) s += 2;
    });
    if (s > 0) res.push({ c: x, cat: c.name, s });
  }));
  return res.sort((x, y) => y.s - x.s).slice(0, 12);
}

/* ---------------- Views ---------------- */
const esc = (s) => A().esc(s);
function ccard(x, cat) { return `<button class="ccard raised" data-act="b-pick" data-t="${esc(x[0])}"><span class="cc-cat">${esc(cat)}</span><b>${esc(x[0])}</b><span class="s">${esc(x[1])}</span></button>`; }
function resultsHtml() {
  const q = BS.q.trim();
  if (q.length >= 2) {
    const r = search(q);
    return `<button class="ccard custom pn-strong" data-act="b-pick" data-t="${esc(q)}"><span class="cc-cat">Your own topic</span><b>Build “${esc(q)}”</b><span class="s">Amani builds a course on exactly this.</span></button>` +
      (r.length ? `<h3 class="subh">Suggestions</h3><div class="cgrid">${r.map((x) => ccard(x.c, x.cat)).join('')}</div>` : '<p class="help">No ready-made idea matches, but you can still build your own topic above.</p>');
  }
  const a = A(), cats = BS.cat === 'all' ? CAT.cats : CAT.cats.filter((c) => c.id === BS.cat);
  const all = {}; CAT.cats.forEach((c) => c.courses.forEach((x) => { all[x[0]] = [x, c.name]; }));
  const tr = BS.cat === 'all' ? `<h3 class="subh">Popular right now</h3><div class="trend">${CAT.trending.map((t) => all[t] ? ccard(all[t][0], all[t][1]) : '').join('')}</div>` : '';
  return tr + cats.map((c) => `<section class="ccat"><h3 class="subh">${esc(c.name)}<span class="s"> ${esc(c.blurb)}</span></h3><div class="cgrid">${c.courses.map((x) => ccard(x, c.name)).join('')}</div></section>`).join('');
}
function catalogView() {
  const a = A();
  return `<div class="page build"><div class="b-hero kv-in"><p class="eyebrow">Build a course</p><h1>What do you want to learn?</h1><p class="lede">Pick an idea or type any topic. Amani builds a full course you can study offline, with lessons, practice questions and flashcards.</p></div>${unfinishedCard()}
    <form id="bform" class="bsearch pn-strong kv-in" style="--d:1">${a.ic('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', 20, 2)}<input id="bq" type="search" placeholder="Search, or type any topic" value="${esc(BS.q)}" autocomplete="off" aria-label="Search or type a topic"><button class="btn primary sm" type="submit">Build</button></form>
    <div class="cpills kv-in" style="--d:2" role="group" aria-label="Categories"><button class="pill ${BS.cat === 'all' ? 'on' : ''}" data-act="b-cat" data-v="all">All</button>${CAT.cats.map((c) => `<button class="pill ${BS.cat === c.id ? 'on' : ''}" data-act="b-cat" data-v="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div id="bres" class="kv-in" style="--d:3">${resultsHtml()}</div>
    <section class="pbcard pn-strong kv-in" style="--d:4"><span class="ico">${a.ic(a.I.shield, 22, 1.8)}</span><div class="grow"><b>Built on the Course Craft Playbook</b><p class="help" style="margin:2px 0 0">The same standard for every course: outcomes first, one idea per lesson, practice in every lesson, honest sources.</p></div>
      <div class="row-actions"><button class="btn sm" data-act="b-pb-read">Read it</button><button class="btn sm" data-act="b-pb-copy">Copy for any AI</button><button class="btn sm" data-act="b-pb-dl">Download</button></div></section></div>`;
}
function resState() {
  const K = window.KVResearch, st = K ? K.status() : 'nokey', c = K ? K.cfg() : {};
  return { st, ready: st === 'ready', left: K ? K.creditsLeft() : 0, tested: !!c.ok };
}
function researchPanel() {
  const a = A(), r = resState(), D = DEPTH[BS.depth];
  if (r.ready) return `<div class="field"><label>Web research</label>${(function () { return `<div class="seg inset" role="group"><button data-act="b-res" data-v="on" aria-pressed="${BS.research}">On · recommended</button><button data-act="b-res" data-v="off" aria-pressed="${!BS.research}">Off</button></div>`; })()}<p class="help">${BS.research ? `Amani searches the web first and writes from real sources. This course uses about <b>${D.credits}</b> search credits. About ${r.left} remain this month.` : 'Off: the course is written from the model\'s own knowledge and marked as not researched.'}</p></div>`;
  return `<div class="field"><label>Web research</label><div class="verdict pn-strong"><h3>${r.st === 'badkey' ? 'Your search key was not accepted' : 'Web research is not set up'}</h3><p>${r.st === 'badkey' ? 'Fix the key to let Amani research the web.' : 'A free search key lets Amani check real sources and find verified videos. It takes about three minutes. Without it, the course is written from the model\'s own knowledge and marked as not researched.'}</p><div class="row-actions"><button class="btn primary sm" data-act="nav" data-r="research">${r.st === 'badkey' ? 'Fix my key' : 'Set up free web research'}</button></div></div></div>`;
}
function knowBox() {
  const r = resState(), on = r.ready && BS.research, D = DEPTH[BS.depth];
  return `<section class="note-box inset kv-in know-box" style="--d:3"><b>Good to know</b><ul class="know">
    <li>${on ? 'Amani searches the web first, then writes with numbered sources. Search runs through the Knowvia desktop app and needs internet.' : 'This course will be written from the model\'s own knowledge. It will say so clearly, and sources will not be checked.'}</li>
    ${on ? `<li>Videos are only added when Amani has confirmed they exist and can be played. They are optional and use no data until you open one.</li>` : ''}
    <li>It can take a while. Keep Knowvia open. If the free limits run out or the internet drops, it pauses and you can continue from where it stopped.</li>
    <li>The finished course is stored on this device and works offline. The topic words you type are sent to the model${on ? ' and to the search service' : ''}, so do not include private information.</li>
    <li>A person has not reviewed the course. Check anything important before you rely on it.</li></ul></section>`;
}

/* ---------------- Connected providers, the Director's interview, plan approval ---------------- */
function provState() {
  const a = A(), ids = a.PROV_TOP.concat(a.PROV_ALT), on = ids.filter((id) => { const c = a.cloudCfg(id); return c.ok && c.key; });
  return { on, off: ids.filter((id) => !on.includes(id)), n: on.length };
}
const agentOn = () => (BS.agent == null ? provState().n >= 2 : !!BS.agent);
function readyCard() {
  const a = A(), P = provState(), rec = P.off.slice(0, 2), dots = [0, 1, 2].map((i) => `<i class="${i < Math.min(3, P.n) ? 'on' : ''}"></i>`).join('');
  const head = P.n >= 3 ? 'Ready for fast builds' : P.n === 2 ? 'Good: two models work together' : P.n === 1 ? 'One model is connected' : 'No cloud model connected';
  const body = P.n >= 3 ? 'Amani uses your models at the same time and switches by herself if one gets slow.' : P.n === 2 ? 'They share the work, so the course builds faster. A third gives a safety net when one runs out of free limit.' : P.n === 1 ? 'It works, but a free model has limits per minute, and builds can pause. Connect one or two more for a faster, smoother build. Each takes about three minutes and is free.' : 'Connect at least one free cloud model, or use a model on this device. Two or three make building much faster.';
  const btns = P.n < 3 ? rec.map((id) => `<button class="btn sm" data-act="b-conn" data-v="${id}">Connect ${esc(a.PROV[id].name)}</button>`).join('') : '';
  return `<section class="pn-strong psec kv-in ready ${P.n >= 2 ? 'good' : 'low'}" style="--d:2"><div class="rd-top"><span class="rd-meter" aria-hidden="true">${dots}</span><div class="grow"><h2>${head}</h2></div></div><p class="help">${body}</p>${btns ? `<p class="help rd-rec">Recommended next: ${rec.map((id) => '<b>' + esc(a.PROV[id].name) + '</b>').join(' and ')}.</p><div class="row-actions">${btns}</div>` : ''}</section>`;
}
function optionsCard() {
  const segs = (act, val, opts) => `<div class="seg inset" role="group">${opts.map(([v, nm]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${String(val) === String(v)}">${nm}</button>`).join('')}</div>`;
  const ag = agentOn();
  return `<section class="pn-strong psec kv-in" style="--d:3"><h2>How should Amani build it?</h2>
    <div class="field"><label>Mode</label>${segs('b-mode', ag ? 'agent' : 'guided', [['agent', 'Agent'], ['guided', 'Guided']])}<p class="help">${ag ? '<b>Agent:</b> Amani handles everything. If a model is slow or busy she switches to another herself, with the full plan handed over, and does not interrupt you.' : '<b>Guided:</b> when a model is slow or busy, Amani shows a 15 second countdown and you can accept or refuse the switch.'}${provState().n >= 2 && ag ? ' Recommended.' : ''}</p></div>
    <div class="field"><label>Questions first</label>${segs('b-iv', BS.interview ? 'on' : 'off', [['on', 'Ask me a few'], ['off', 'Skip']])}<p class="help">${BS.interview ? 'For some topics (video editing, design, coding) Amani asks two or three quick questions so the course fits you, for example which software to teach. Every question has a "Let Amani decide" button.' : 'Amani builds a standard course that suits anyone.'}</p></div>
    <div class="field"><label>Plan</label>${segs('b-rev', BS.review ? 'on' : 'off', [['off', 'Right away'], ['on', 'Show plan first']])}<p class="help">${BS.review ? 'You see every module and lesson and approve before writing starts.' : 'Planning and writing run straight through.'}</p></div></section>`;
}
function askView() {
  const a = A(), iv = BS.iv || {}, back = `<button class="btn sm back-l" data-act="b-ivcancel">${a.ic(a.I.back, 18, 2)}Back</button>`;
  if (!iv.spec) return `<div class="page build">${back}<div class="b-hero kv-in"><p class="eyebrow">One moment</p><h1>${esc(BS.topic)}</h1></div><section class="pn-strong psec kv-in analyzing" style="--d:1"><span class="spin"></span><div class="grow"><b>Amani is looking at your topic</b><p class="help">She works out what a good course on this needs, and whether to ask you anything first.</p></div></section><div class="row-actions"><button class="btn" data-act="b-skipiv">Skip, build a standard course</button></div></div>`;
  const sp = iv.spec, qs = sp.questions;
  if (iv.done) {
    const br = window.KVDirector.makeBrief(sp, iv.answers, false, BS.topic);
    return `<div class="page build">${back}<div class="b-hero kv-in"><p class="eyebrow">Your course</p><h1>${esc(BS.topic)}</h1></div><section class="pn-strong psec kv-in" style="--d:1"><h2>Here is what Amani will build</h2><ul class="iv-sum">${br.lines.map((l) => `<li><span>${esc(l.label)}</span><b>${esc(l.value)}</b>${l.auto ? '<em>Amani chose</em>' : ''}</li>`).join('')}</ul>
      <p class="help">Estimated time: <b>${estimate(chosen(choices()), BS.depth, provState().n)}</b>. You can pause and resume later.</p></section>
      <div class="row-actions kv-in" style="--d:2"><button class="btn primary" data-act="b-go">${a.ic(a.I.spark, 18, 2)}Start building</button><button class="btn" data-act="b-ivredo">Change answers</button></div></div>`;
  }
  const q = qs[iv.idx], cur = iv.answers[q.id] !== undefined ? iv.answers[q.id] : q.saved;
  const body = q.kind === 'text' ? `<div class="field"><input id="b-ivtext" data-in="b-ivtext" value="${esc(cur && cur !== '__auto' ? cur : '')}" maxlength="120" placeholder="Type your answer" autocomplete="off" aria-label="${esc(q.q)}"></div><div class="row-actions"><button class="btn primary" data-act="b-ivnext">Next</button></div>`
    : `<div class="mlist" role="radiogroup">${q.options.map((o) => `<button class="mrow ${cur === o.v ? 'on' : ''}" data-act="b-ans" data-v="${esc(o.v)}" role="radio" aria-checked="${cur === o.v}"><span class="rad"></span><span class="grow"><b>${esc(o.t)}</b>${o.d ? `<span class="s">${esc(o.d)}</span>` : ''}</span>${q.rec === o.v ? '<span class="badge">Recommended</span>' : q.saved === o.v ? '<span class="badge">Used before</span>' : ''}</button>`).join('')}</div>`;
  return `<div class="page build">${back}<div class="b-hero kv-in"><p class="eyebrow">Question ${iv.idx + 1} of ${qs.length}</p><h1>${esc(q.q)}</h1>${q.why ? `<p class="lede">${esc(q.why)}</p>` : ''}</div>
    <section class="pn-strong psec kv-in" style="--d:1">${body}</section>
    <div class="row-actions kv-in" style="--d:2"><button class="btn" data-act="b-auto">Let Amani decide</button>${iv.idx > 0 ? '<button class="btn" data-act="b-ivprev">Previous</button>' : ''}<button class="btn" data-act="b-skipiv">Skip all questions</button></div></div>`;
}
function planView() {
  const a = A(), j = BS.job, mods = [];
  j.plan.lessons.forEach((L, i) => { let m = mods.find((x) => x.t === L.module); if (!m) { m = { t: L.module, l: [] }; mods.push(m); } m.l.push([i + 1, L]); });
  const mins = j.plan.lessons.reduce((s, L) => s + (L.weight === 'heavy' ? 14 : L.weight === 'light' ? 6 : 9), 0);
  return `<div class="page build"><div class="b-hero kv-in"><p class="eyebrow">Check the plan</p><h1>${esc(j.plan.title)}</h1><p class="lede">${esc(j.plan.outcome || '')}</p></div>
    <section class="pn-strong psec kv-in" style="--d:1"><p class="help"><b>${mods.length}</b> modules, <b>${j.n}</b> lessons, about <b>${fmtMins(mins)}</b> of study. ${j.brief && !j.brief.skipped ? 'Built for: ' + esc(j.brief.summary) + '.' : 'A standard course for anyone.'}</p>
      <div class="plan-list">${mods.map((m, k) => `<div class="plan-mod"><h3>${k + 1}. ${esc(m.t)}</h3><ol start="${m.l[0][0]}">${m.l.map(([n, L]) => `<li>${esc(L.title)}<span class="s">${esc(L.subtitle || '')}</span></li>`).join('')}</ol></div>`).join('')}</div></section>
    <div class="row-actions kv-in" style="--d:2"><button class="btn primary" data-act="b-approve">${a.ic(a.I.spark, 18, 2)}Looks good, write it</button><button class="btn" data-act="b-pause">Pause, decide later</button><button class="btn" data-act="b-cancel">Stop</button></div></div>`;
}
function pausedView() {
  const a = A(), j = BS.job, p = pending() || { done: 0, n: 0 };
  return `<div class="page build"><div class="b-hero kv-in"><p class="eyebrow">Paused</p><h1>${esc(j.topic)}</h1></div><section class="pn-strong psec kv-in" style="--d:1"><h2>Saved on this device</h2><p class="help">${p.n ? p.done + ' of ' + p.n + ' lessons are finished.' : 'The plan is saved.'} Resume any time, even after closing Knowvia. Nothing is lost.</p>
    <div class="row-actions"><button class="btn primary" data-act="b-resume">${a.ic(a.I.refresh, 18, 2)}Resume building</button><button class="btn" data-act="b-discard">Discard it</button></div></section></div>`;
}
function unfinishedCard() {
  const p = pending(), a = A(); if (!p || (BS.job && (BS.job.running || BS.job.paused))) return '';
  return `<section class="pbcard pn-strong kv-in unfin" style="--d:1"><span class="ico">${a.ic(a.I.refresh, 22, 1.8)}</span><div class="grow"><b>Unfinished: ${esc(p.topic)}</b><p class="help" style="margin:2px 0 0">${p.n ? p.done + ' of ' + p.n + ' lessons are done.' : 'Planning was saved.'} Pick up where it stopped.</p></div><div class="row-actions"><button class="btn primary sm" data-act="b-resume">Resume</button><button class="btn sm" data-act="b-discard">Discard</button></div></section>`;
}
function setupView() {
  const a = A(), list = choices(), cur = chosen(list), n = BS.depth;
  const noModel = !list.length;
  const rows = list.map((c, i, arr) => {
    const on = BS.modelKey === 'auto' ? false : keyOf(cur) === keyOf(c);
    const head = (i === 0 || arr[i - 1].group !== c.group) ? `<h4 class="mgroup">${esc(c.group)}</h4>` : '';
    return head + `<button class="mrow ${on ? 'on' : ''}" data-act="b-model" data-v="${esc(keyOf(c))}" role="radio" aria-checked="${on}"><span class="rad"></span><span class="grow"><b>${esc(c.label)}</b>${c.k === 'local' ? '<span class="s">Private. Slower, and the course may be simpler.</span>' : ''}</span>${c.rec ? '<span class="badge">Recommended</span>' : ''}</button>`;
  }).join('');
  const auto = `<button class="mrow ${BS.modelKey === 'auto' ? 'on' : ''}" data-act="b-model" data-v="auto" role="radio" aria-checked="${BS.modelKey === 'auto'}"><span class="rad"></span><span class="grow"><b>Choose for me</b><span class="s">Uses the best model you have connected${cur ? ': ' + esc(cur.label) : ''}. If it fails, tries the next best.</span></span><span class="badge">Recommended</span></button>`;
  const segs = (act, val, opts) => `<div class="seg inset" role="group">${opts.map(([v, nm]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${String(val) === String(v)}">${nm}</button>`).join('')}</div>`;
  return `<div class="page build"><button class="btn sm back-l" data-act="b-back">${a.ic(a.I.back, 18, 2)}All topics</button>
    <div class="b-hero kv-in"><p class="eyebrow">Set up your course</p><h1>${esc(BS.topic)}</h1></div>
    <section class="pn-strong psec kv-in" style="--d:1"><div class="field"><label for="b-topic">Topic</label><input id="b-topic" data-in="b-topic" value="${esc(BS.topic)}" maxlength="90" autocomplete="off"></div>
      <div class="field"><label>Your level</label>${segs('b-level', BS.level, [['Beginner', 'Beginner'], ['Intermediate', 'Intermediate'], ['Advanced', 'Advanced']])}</div>
      <div class="field"><label>How deep?</label>${segs('b-depth', BS.depth, [['short', 'Short'], ['standard', 'Standard'], ['deep', 'Deep']])}<p class="help">${esc(DEPTH[BS.depth].hint)}${BS.depth === 'standard' ? ' <b>Recommended.</b>' : ''} Amani decides the exact number of modules and lessons from the subject.</p></div>
      ${researchPanel()}</section>
    <section class="pn-strong psec kv-in" style="--d:2"><h2>Which model should build it?</h2>${noModel ? `<div class="verdict pn-strong"><h3>Connect a model first</h3><p>Amani needs a model to write the course. A free cloud model takes a few minutes to set up.</p><div class="row-actions"><button class="btn primary" data-act="nav" data-r="me">Set up a model</button></div></div>` : `<div class="mlist" role="radiogroup">${auto}${rows}</div>
      
      <p class="help">Estimated time with ${esc(cur.label)}: <b>${estimate(cur, n, provState().n)}</b>, depending on how many lessons the subject needs. Keep Knowvia open while it builds. You can use other screens meanwhile.</p>`}</section>
    ${readyCard()}${optionsCard()}${knowBox()}
    <div class="row-actions kv-in" style="--d:4"><button class="btn primary" data-act="b-start" ${noModel ? 'disabled' : ''}>${a.ic(a.I.spark, 18, 2)}Build my course</button></div></div>`;
}
const STAGES = [['research', 'Research the web'], ['plan', 'Plan the structure'], ['lessons', 'Write the lessons'], ['check', 'Check the quality'], ['save', 'Save to your library']];
function runView() {
  const a = A(), j = BS.job; if (!j) return catalogView();
  return `<div class="page build run"><div class="b-hero kv-in"><p class="eyebrow">Building your course</p><h1>${esc(j.topic)}</h1></div>
    <section class="runcard pn-strong kv-in" style="--d:1"><div class="ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="rt" cx="60" cy="60" r="52"/><circle class="rp" id="r-arc" cx="60" cy="60" r="52"/></svg><span id="r-pct">${j.pct}%</span></div>
      <div class="grow"><p class="r-msg" id="r-msg" role="status">${esc(j.msg)}</p><p class="help" id="r-sub">${esc(j.sub || '')}</p><div class="bar" aria-hidden="true"><i id="r-bar" style="width:${j.pct}%"></i></div></div></section>
    <section class="pn-strong psec kv-in" style="--d:2"><ul class="stages" id="r-stages">${stagesHtml(j)}</ul></section>
    <section class="pn-strong psec health kv-in" style="--d:3" id="r-health" aria-live="off">${healthHtml(j)}</section>
    <p class="help" id="r-note">${esc(j.note || 'Keep Knowvia open while it builds.')}</p>
    ${j.research && j.research.sources.length ? `<p class="meta" id="r-src">${j.research.sources.length} sources found${j.research.videos ? ', ' + j.research.videos + ' videos checked' : ''}.</p>` : ''}
    <div class="row-actions"><button class="btn" data-act="b-bg">Keep working while it builds</button><button class="btn" data-act="b-pause">Pause, resume later</button><button class="btn" data-act="b-cancel">Stop</button></div></div>`;
}
const HEALTH = { ok: ['ok', 'Working well'], slow: ['warn', 'Slow'], busy: ['warn', 'Model busy'], offline: ['bad', 'No internet'], ask: ['warn', 'Waiting for your choice'] };
const TIP = { slow: 'A slow answer is usually the provider being busy. A switch often fixes it.', busy: 'Free models allow only so much per minute. Waiting a little, or another model, fixes it.', offline: 'Your work is kept. Amani continues the moment the internet is back.', ask: 'No reply means the switch happens by itself when the countdown ends.' };
function etaText(j) {
  const el = Date.now() - j.t0; if (!j.running || j.pct < 12 || el < 60000) return '';
  const m = el * (100 - j.pct) / j.pct / 60000;
  return 'About ' + (m < 1 ? 'a minute' : m < 60 ? Math.round(m) + ' minutes' : (Math.round(m / 6) / 10) + ' hours') + ' left at this speed.';
}
function healthHtml(j) {
  const h = HEALTH[j.health] || HEALTH.ok, a = A(), used = Array.from(j.used);
  const ev = j.events.slice(-3).reverse().map((e) => `<li>${esc(e.x)}</li>`).join('');
  return `<div class="hl-top"><span class="hl-chip ${h[0]}"><i></i>${h[1]}</span><span class="hl-live" id="r-live">${esc(liveText(j))}</span></div>
    <p class="help hl-line">${j.pool && j.pool.filter((w) => w.model && !w.stop).length > 1 ? '<b>' + j.pool.filter((w) => w.model && !w.stop).length + ' models</b> are working together: ' + esc(poolLabel(j)) + '.' : '<b>' + esc(j.modelLabel) + '</b> is writing.'}${j.handoffs.length ? ' It continues the work of ' + esc(used.slice(0, -1).join(', ')) + ', with the full plan handed over.' : ''}${etaText(j) ? ' ' + esc(etaText(j)) : ''}</p>
    ${TIP[j.health] ? `<p class="help hl-tip">${esc(TIP[j.health])}</p>` : ''}${ev ? `<ul class="hl-ev">${ev}</ul>` : ''}`;
}
function stagesHtml(j) {
  const order = STAGES.map((s) => s[0]), cur = order.indexOf(j.step), a = A();
  return STAGES.map(([id, nm], i) => { const st = i < cur ? 'done' : i === cur ? 'now' : 'wait'; return `<li class="stg ${st}"><span class="si">${st === 'done' ? a.ic(a.I.check, 16, 2.8) : st === 'now' ? '<span class="spin"></span>' : ''}</span><span>${nm}${id === 'lessons' && j.n ? `<span class="s"> ${Math.min(j.i + 1, j.n)} of ${j.n}</span>` : ''}</span></li>`; }).join('');
}
function doneView() {
  const a = A(), j = BS.job, p = j.pack, g = p.quality.gates || {};
  return `<div class="page build done"><div class="donewrap kv-in"><svg class="donemark" viewBox="0 0 120 120" aria-hidden="true"><circle class="dc" cx="60" cy="60" r="48"/><path class="dk" d="M38 62l16 16 30-34"/></svg>
    <p class="eyebrow">Your course is ready</p><h1>${esc(p.title)}</h1><p class="lede">${esc(p.subtitle)}</p></div>
    <div class="grid3 kv-in" style="--d:2"><div class="stat raised"><b>${j.lessonsN}</b><span>Lessons</span></div><div class="stat raised"><b>${p.quiz.length}</b><span>Questions</span></div><div class="stat raised"><b>${p.flashcards.length}</b><span>Flashcards</span></div></div>
    <section class="pn-strong psec kv-in" style="--d:2"><h2>How it was made</h2><p class="help">${p.quality.researched ? `Researched on the web: <b>${p.quality.sources}</b> sources, <b>${p.quality.videos || 0}</b> verified videos, about ${j.research.credits} search credits used.` : p.quality.researchMode === 'wiki' ? 'Light research only (Wikipedia).' : '<b>Not researched.</b> Written from the model\'s own knowledge. Set up web research to get sourced courses.'} Open Sources in the course to see the details.</p></section>
    ${j.report ? `<section class="pn-strong psec kv-in" style="--d:2"><h2>Build report</h2><ul class="gnotes rep"><li>Took <b>${j.report.mins} minutes</b>${j.report.waitMin ? ', of which about ' + j.report.waitMin + ' waiting for free limits' : ''}.</li><li><b>${j.report.calls}</b> model answers, about ${j.report.avgS}s each, with up to <b>${j.report.workers}</b> model${j.report.workers > 1 ? 's' : ''} working at once.</li><li>${j.report.switches ? j.report.switches + ' switch' + (j.report.switches > 1 ? 'es' : '') + ' between models, each with a full handover.' : 'No model switches were needed.'}</li></ul></section>` : ''}<section class="pn-strong psec kv-in" style="--d:3"><h2>Quality check ${g.score !== undefined ? `<span class="gscore ${g.passed ? 'ok' : 'warn'}">${g.score}%</span>` : ''}</h2>
      <p class="help">${g.passed ? 'It passed the structure checks.' : 'It did not pass every structure check.'} It was built by ${esc(Array.from(j.used).join(' and '))} and has not been reviewed by a person.${j.handoffs.length ? ' The model changed ' + j.handoffs.length + ' time' + (j.handoffs.length > 1 ? 's' : '') + ' along the way (' + j.handoffs.map((h) => esc(String(h.at || 'building').toLowerCase()) + ': ' + esc(h.from) + ' to ' + esc(h.to)).join('; ') + '), each time with the full plan handed over.' : ''}</p>
      ${g.notes && g.notes.length ? `<ul class="gnotes">${g.notes.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>
    <div class="row-actions kv-in" style="--d:4"><button class="btn primary" data-act="b-open">${a.ic(a.I.book, 18, 2)}Start the course</button><button class="btn" data-act="b-more">Back to courses</button></div></div>`;
}
function failView() {
  const a = A(), j = BS.job;
  return `<div class="page build"><div class="b-hero kv-in"><p class="eyebrow">Building paused</p><h1>${esc(j.topic)}</h1></div>
    <section class="pn-strong psec kv-in" style="--d:1"><h2>It stopped, and your work so far is safe</h2><p class="help">${esc(j.error || 'Something went wrong.')}</p><p class="help">${j.i || 0} of ${j.n || '?'} lessons were written before it stopped. You can continue from there.</p>
      <div class="row-actions"><button class="btn primary" data-act="b-retry">${a.ic(a.I.refresh, 18, 2)}Continue</button><button class="btn" data-act="b-newmodel">Choose another model</button><button class="btn" data-act="b-more">Back to courses</button></div></section></div>`;
}
function screen() {
  const j = BS.job;
  if (BS.view === 'ask' && !(j && j.running)) return askView();
  if (j && j.running && j.step === 'review') return planView();
  if (j && !j.running && BS.view === 'paused' && j.paused) return pausedView();
  if (j && j.running) return runView();
  if (j && j.done && BS.view === 'run') BS.view = 'done';
  if (j && j.error && BS.view === 'run') BS.view = 'fail';
  if (BS.view === 'done' && j && j.done) return doneView();
  if (BS.view === 'fail' && j && j.error) return failView();
  if (BS.view === 'setup') return setupView();
  return catalogView();
}
REG.screens.build = screen; REG.names.build = 'Build a course';

/* ---------------- Progress display ---------------- */
function paint() {
  const a = A(), j = BS.job; if (!j) return;
  if (j.running) status(j);
  if (a.route.name === 'build') {
    if (j.running && BS.view !== 'run') BS.view = 'run';
    const arc = a.$('#r-arc');
    if (arc) { const C = 2 * Math.PI * 52; arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C * (1 - j.pct / 100); }
    const set = (id, t) => { const e = a.$(id); if (e) e.textContent = t; };
    set('#r-pct', j.pct + '%'); set('#r-msg', j.msg); set('#r-sub', j.sub || ''); set('#r-note', j.note || 'Keep Knowvia open while it builds.');
    const bar = a.$('#r-bar'); if (bar) bar.style.width = j.pct + '%';
    const st = a.$('#r-stages'); if (st) st.innerHTML = stagesHtml(j);
    const hl = a.$('#r-health'); if (hl) hl.innerHTML = healthHtml(j);
    if (j.running && !a.$('#r-msg') && !paint.busy) { paint.busy = true; try { a.renderScreen(); } finally { paint.busy = false; } }
  }
  pill();
}
const POSK = 'kv.bpill';
try { BS.pos = JSON.parse(localStorage.getItem(POSK) || 'null'); } catch (e) { BS.pos = null; }
function placePill(el) {
  const p = BS.pos;
  if (!p) { el.classList.remove('moved'); el.style.left = el.style.top = el.style.bottom = el.style.right = el.style.margin = el.style.transform = ''; return; }
  const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  el.classList.add('moved');
  el.style.left = Math.min(Math.max(6, p.x * (vw - w)), Math.max(6, vw - w - 6)) + 'px'; el.style.top = Math.min(Math.max(6, p.y * (vh - h)), Math.max(6, vh - h - 6)) + 'px'; el.style.bottom = 'auto'; el.style.right = 'auto'; el.style.margin = '0'; el.style.transform = 'none';
}
function dragPill(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top; let moved = false;
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    const mv = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy; if (!moved && Math.hypot(dx, dy) < 7) return;
      if (!moved) { moved = true; el.classList.add('drag'); }
      const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      const x = Math.min(Math.max(6, ox + dx), Math.max(6, vw - w - 6)), y = Math.min(Math.max(6, oy + dy), Math.max(6, vh - h - 6));
      el.classList.add('moved'); el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.bottom = 'auto'; el.style.right = 'auto'; el.style.margin = '0'; el.style.transform = 'none';
      BS.pos = { x: vw - w > 0 ? x / (vw - w) : 0, y: vh - h > 0 ? y / (vh - h) : 0 };
    };
    const up = () => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.classList.remove('drag');
      if (moved) { el._dragged = true; setTimeout(() => { el._dragged = false; }, 60); try { localStorage.setItem(POSK, JSON.stringify(BS.pos)); } catch (x) { /* ignore */ } }
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('click', (ev) => { if (el._dragged) { ev.stopImmediatePropagation(); ev.preventDefault(); } }, true);
  el.addEventListener('dblclick', (ev) => { ev.preventDefault(); BS.pos = null; try { localStorage.removeItem(POSK); } catch (x) { /* ignore */ } placePill(el); });
}
window.addEventListener('resize', () => { const el = document.getElementById('bpill'); if (el && BS.pos) placePill(el); });
function pill() {
  const a = A(), j = BS.job; let el = document.getElementById('bpill');
  const show = j && (j.running || (j.done && !j.seen)) && a.route.name !== 'build';
  if (!show) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button'); el.id = 'bpill'; el.className = 'bpill pn-strong'; el.setAttribute('data-act', 'nav'); el.setAttribute('data-r', 'build'); el.setAttribute('aria-label', 'Course building. Tap to open. Drag to move. Double tap to put it back.'); document.body.appendChild(el); dragPill(el);
    let seen = 0; try { seen = +localStorage.getItem('kv.bpillhint') || 0; } catch (x) { /* ignore */ }
    if (!seen) { try { localStorage.setItem('kv.bpillhint', '1'); } catch (x) { /* ignore */ } setTimeout(() => a.toast('Tip: drag the bubble anywhere. Double tap it to put it back.'), 600); }
  }
  const warn = j.running && ((j.health && j.health !== 'ok') || j.step === 'review'), tag = warn ? (j.step === 'review' ? 'approve plan' : ({ slow: 'slow', busy: 'busy', offline: 'offline', ask: 'your choice' })[j.health]) : '';
  el.classList.toggle('warn', !!warn);
  el.innerHTML = j.running ? `<span class="grip" aria-hidden="true"></span><span class="spin"></span><span class="bt"><b>Building</b><span class="bn">${esc(j.topic)}</span><span class="s">${tag ? tag : j.pct + '%'}</span></span>` : `<span class="grip" aria-hidden="true"></span><span class="okdot"></span><span class="bt"><b>Course ready</b><span class="bn">${esc(j.topic)}</span></span>`;
  placePill(el);
}
REG.hooks.afterScreen = ((prev) => (name) => { if (prev) prev(name); if (name === 'build') { const j = BS.job; if (j && j.done) j.seen = true; paint(); } else pill(); })(REG.hooks.afterScreen);
window.KVBuild = { running() { const j = BS.job; return j && j.running ? { title: j.topic, pct: j.pct } : null; }, quick, pending, building(id) { const j = BS.job; return !!(j && j.running && j.packId === id); } };

/* ---------------- The build engine ---------------- */
function parseJson(t) {
  let s = String(t || '').replace(/```json|```/gi, '').trim();
  const i = s.indexOf('{'), k = s.lastIndexOf('}'); if (i < 0 || k < i) throw new Error('No JSON in the answer');
  s = s.slice(i, k + 1);
  try { return JSON.parse(s); } catch (e) { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); }
}
const words = (t) => (String(t).match(/\S+/g) || []).length;
function cleanMd(t) { return String(t || '').replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').replace(/^#\s+.*\n+/, '').trim(); }
async function waitOnline(j) {
  for (let i = 0; i < 72; i++) {
    if (j.cancelled) return false;
    if (window.KVNet && await window.KVNet.probe()) return true;
    await sleep(5000);
  }
  return false;
}
const LIM = { soft: 45000, hard: 120000, lsoft: 150000, lhard: 420000, offer: 15 };
const COOL = {}, PROVWAIT = {};
const cooling = (c) => (COOL[keyOf(c)] || 0) > Date.now();
const secs = (ms) => Math.round(ms / 1000);
const REQ = { requeue: true };
let WID = 0;
function logEv(j, t) { j.events.push({ t: Date.now(), x: t }); if (j.events.length > 40) j.events.shift(); }

/* ---- Workers: one per connected provider, so each provider's free limit is used separately ---- */
const mkWorker = (m, extra) => ({ id: ++WID, model: m, prov: m ? (m.p || 'local') : '', extra: !!extra, stop: false, cur: null });
const usedKeys = (j, except) => new Set(j.pool.filter((w) => w !== except && w.model && !w.extra).map((w) => keyOf(w.model)));
function pickFor(j, w) { const used = usedKeys(j, w), mine = w && w.model ? keyOf(w.model) : ''; return choices().find((c) => !j.failed.has(keyOf(c)) && !cooling(c) && !used.has(keyOf(c)) && keyOf(c) !== mine) || null; }
const canMove = (j, w) => !!pickFor(j, w) || j.pool.some((o) => o !== w && o.model && !o.stop);
function nextLabel(j, w) { const n = pickFor(j, w); if (n) return n.label; const o = j.pool.find((x) => x !== w && x.model && !x.stop); return o ? o.model.label : ''; }
function poolLabel(j) { const l = Array.from(new Set(j.pool.filter((w) => w.model && !w.stop).map((w) => w.model.label))); return l.length ? l.join(', ') : (j.model ? j.model.label : ''); }
function buildPool(j) {
  const all = choices().filter((c) => !j.failed.has(keyOf(c)) && !cooling(c));
  let models;
  if (!j.auto) models = [j.model];
  else {
    const seen = new Set(), cloud = [];
    all.filter((c) => c.k === 'cloud').forEach((c) => { if (!seen.has(c.p)) { seen.add(c.p); cloud.push(c); } });
    models = cloud.slice(0, 3);
    if (!models.length) models = all.filter((c) => c.k === 'local').slice(0, 1);
    if (!models.length) models = [j.model];
  }
  j.pool = models.map((m) => mkWorker(m)); j.model = models[0]; j.modelLabel = poolLabel(j); models.forEach((m) => j.used.add(m.label));
  j.tele.maxPool = Math.max(j.tele.maxPool || 1, j.pool.length);
}
const isSmall = (j) => !!(j.pool && j.pool.length && j.pool.every((w) => w.model && w.model.k === 'local'));
const wSmall = (w) => !!(w && w.model && w.model.k === 'local');

/* What went wrong, in plain words, and what to do about it. */
function diagnose(m) {
  m = String(m || '');
  if (/HTTP 429|rate limit|quota|too many requests/i.test(m)) { const w = m.match(/try again in\s*([\d.]+)\s*(ms|s|m)\b/i); let wait = 0; if (w) wait = Math.ceil(parseFloat(w[1]) * (w[2] === 'ms' ? 0.001 : w[2] === 'm' ? 60 : 1)); return { kind: 'busy', wait: Math.min(90, wait), text: 'The free limit for this model was reached for the moment.', fix: 'Free models allow only so much per minute. Waiting a little, or using another model, fixes it.' }; }
  if (/HTTP 40[13]|api key|unauthor|permission|invalid.*key/i.test(m)) return { kind: 'auth', text: 'The key for this model was refused.', fix: 'Open Me and check the key, or use another model.' };
  if (/HTTP 404|not found|does not exist|decommission/i.test(m)) return { kind: 'missing', text: 'This model is not available any more.', fix: 'Pick another model.' };
  if (/HTTP 5\d\d|overloaded|unavailable/i.test(m) && !/HTTP 50[24]/.test(m)) return { kind: 'server', text: 'The provider had a problem on its side.', fix: 'It usually clears in a minute. Another model can take over meanwhile.' };
  return { kind: 'other', text: 'The model gave an unexpected answer.', fix: 'Trying again usually works.' };
}

/* The handover: everything a new model needs to carry on exactly where the last one stopped. */
function briefing(j, t) {
  const o = j.plan || j.outline, last = j.handoffs[j.handoffs.length - 1];
  let plan = 'Planning has not finished yet.';
  if (j.plan) { const mods = []; j.plan.lessons.forEach((L, i) => { let m = mods.find((x) => x.t === L.module); if (!m) { m = { t: L.module, l: [] }; mods.push(m); } m.l.push((i + 1) + '. ' + L.title); }); plan = mods.map((m, k) => 'Module ' + (k + 1) + ' ' + m.t + ': ' + m.l.join('; ')).join('\n'); }
  else if (j.outline) plan = j.outline.modules.map((m, k) => 'Module ' + (k + 1) + ': ' + m.title + ' (' + m.purpose + ')').join('\n');
  let tail = ''; for (let i = j.lessons.length - 1; i >= 0; i--) if (j.lessons[i]) { tail = String(j.lessons[i]).slice(-500); break; }
  return 'HANDOVER BRIEFING. Read this fully, then continue the work seamlessly.\n' +
    'You are taking over unfinished work from another model (' + (last ? last.from : 'the previous model') + '). The earlier work was good, is saved, and must not be redone or contradicted.\n' +
    'MISSION: build the complete course "' + j.topic + '" for a ' + j.level.toLowerCase() + ' learner at ' + j.depth + ' depth, following the Course Craft Playbook rules above, so it reads as one course by one author.\n' +
    (o ? 'COURSE: "' + o.title + '". Outcome: ' + (o.outcome || '') + '\n' : '') + 'PLAN:\n' + plan.slice(0, 2200) + '\n' +
    'PROGRESS: stage "' + j.step + '"; ' + j.doneN + ' of ' + (j.n || '?') + ' lessons are finished.\n' +
    'YOUR TASK NOW: ' + ((t && t.desc) || 'continue from where the last model stopped') + '\n' +
    (tail ? 'VOICE TO MATCH (the end of a finished lesson): "' + tail.replace(/\s+/g, ' ') + '"\n' : '') +
    'RULES: carry on exactly at the current task, keep the same voice, structure and formatting, never mention this handover or the previous model, and return only what the task asks for (only JSON when JSON is asked for).';
}
function withBrief(j, messages, t) {
  if (!t || !t.handed) return messages;
  const b = briefing(j, t);
  return messages.map((m, i) => (i === 0 && m.role === 'system' ? { role: 'system', content: m.content + '\n\n' + b } : m));
}
/* Take a model out of rotation for a while and give this worker the next best one. */
function retire(j, w, why, coolMs) {
  const from = w.model; if (!from) return null;
  if (why === 'auth' || why === 'missing') j.failed.add(keyOf(from)); else COOL[keyOf(from)] = Date.now() + (coolMs || 3 * 60000);
  const nm = pickFor(j, w);
  w.model = nm || null; w.prov = nm ? (nm.p || 'local') : w.prov;
  if (nm) j.used.add(nm.label);
  j.modelLabel = poolLabel(j); if (j.model && keyOf(j.model) === keyOf(from) && nm) j.model = nm;
  return { from, to: nm };
}
function moveOn(j, w, model, why, t, coolMs) {
  if (!canMove(j, w)) return false;
  const r = retire(j, w, why, coolMs);
  if (r && r.to) {
    if (t) t.handed = true;
    j.handoffs.push({ from: r.from.label, to: r.to.label, at: (t && t.desc) || j.msg, why });
    logEv(j, 'Switched from ' + r.from.label + ' to ' + r.to.label + '. The full plan and progress were handed over.');
    j.note = 'Switched to ' + r.to.label + '. It has the full plan and carries on from where ' + r.from.label + ' stopped.'; j.health = 'ok'; paint();
    return 'retry';
  }
  const other = j.pool.find((o) => o !== w && o.model && !o.stop);
  if (t) t.handed = true;
  j.handoffs.push({ from: model.label, to: other ? other.model.label : 'another model', at: (t && t.desc) || j.msg, why });
  logEv(j, model.label + ' was slow or busy, so its work moved to ' + (other ? other.model.label : 'another model') + ', with the full plan handed over.');
  throw REQ;
}

/* The countdown card. Shown on every screen, so you see it wherever you are. */
function openOffer(j, o) {
  closeOffer(j); const a = A();
  const el = document.createElement('div'); el.id = 'bswitch'; el.className = 'bswitch pn-strong'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'Switch model?');
  const total = (o.secs || 15) * 1000, t0 = Date.now();
  el.innerHTML = `<p class="eyebrow">Taking too long</p><h3>Switch to a faster model?</h3><p class="help">${esc(o.why)}</p>
    <p class="sw-line">${o.nx ? 'Switching to <b>' + esc(o.nx) + '</b> in' : 'Moving the work in'} <b id="sw-n">${secs(total)}</b>s</p><div class="bar" aria-hidden="true"><i id="sw-bar" style="width:100%"></i></div>
    <p class="help sw-note">${j.n ? j.doneN + ' of ' + j.n + ' lessons are finished. ' : ''}Amani hands the new model the whole plan and everything written so far, so it continues from the same point.</p>
    <div class="row-actions"><button class="btn primary" data-act="bsw-yes">Switch now</button><button class="btn" data-act="bsw-no">Keep waiting</button></div>`;
  document.body.appendChild(el);
  const h = { el, closed: false, owner: o.owner, close() { if (h.closed) return; h.closed = true; clearInterval(h.tm); el.remove(); if (j.offer === h) j.offer = null; }, yes() { if (h.closed) return; h.close(); o.onSwitch(); }, no() { if (h.closed) return; h.close(); o.onWait(); } };
  h.tm = setInterval(() => { const left = Math.max(0, total - (Date.now() - t0)); const n = document.getElementById('sw-n'), b = document.getElementById('sw-bar'); if (n) n.textContent = Math.ceil(left / 1000); if (b) b.style.width = (left / total * 100) + '%'; if (left <= 0) h.yes(); }, 200);
  j.offer = h; j.health = 'ask'; paint(); return h;
}
function closeOffer(j) { if (j && j.offer) j.offer.close(); const e = document.getElementById('bswitch'); if (e) e.remove(); }
function askSwitch(j, w, why) { return new Promise((res) => { if (j.offer) return res('wait'); openOffer(j, { why, owner: w, nx: nextLabel(j, w), secs: LIM.offer, onSwitch: () => res('switch'), onWait: () => res('wait') }); }); }
async function pause(j, s, kind) {
  const end = Date.now() + s * 1000; j.health = kind; const t0 = Date.now();
  while (Date.now() < end) { if (j.cancelled) throw new Error('cancelled'); j.note = (kind === 'busy' ? 'A model is busy. ' : '') + 'Trying again in ' + Math.ceil((end - Date.now()) / 1000) + 's.'; paint(); await sleep(1000); }
  j.tele.waitMs += Date.now() - t0; j.note = ''; if (!j.offer) j.health = 'ok';
}
async function provWait(j, w) { const until = PROVWAIT[w.prov] || 0; if (until > Date.now()) await pause(j, Math.ceil((until - Date.now()) / 1000), 'busy'); }
function liveText(j) {
  if (j.lives && j.lives.length) { const l = j.lives.reduce((a, b) => (a.t0 < b.t0 ? a : b)); return 'Waiting for ' + l.label + ': ' + secs(Date.now() - l.t0) + 's'; }
  return j.lastMs ? 'Last answer took ' + secs(j.lastMs) + 's' : 'Starting';
}
function tickLive(j) { const e = document.getElementById('r-live'); if (e) e.textContent = liveText(j); }
function shrinkExtra(j) { j.pool.forEach((w) => { if (w.extra) w.stop = true; }); }

/* One model call, watched. Slow, busy, broken or offline: it handles each in its own way. */
async function call(j, w, messages, opt, t) {
  opt = opt || {}; let slowHits = 0, busyHits = 0, otherHits = 0, nextAsk = 2;
  for (let guard = 0; guard < 60; guard++) {
    if (j.cancelled) throw new Error('cancelled');
    if (!w.model) throw REQ;
    await provWait(j, w);
    const model = w.model, local = model.k === 'local';
    const soft = local ? LIM.lsoft : LIM.soft, hard = local ? LIM.lhard : LIM.hard;
    const cc = new AbortController(), link = () => cc.abort(); j.ctrl.signal.addEventListener('abort', link);
    const live = { t0: Date.now(), label: model.label }; j.lives.push(live);
    let decide; const decided = new Promise((r) => { decide = r; });
    let offered = false, extra = 0;
    const watch = setInterval(() => {
      const el = Date.now() - live.t0;
      if (!offered && el > soft + extra && j.stall !== 'wait' && canMove(j, w)) {
        if (j.agent) { offered = true; logEv(j, model.label + ' was slow, so its work moved to another model.'); decide('switch'); }
        else if (!j.offer) {
          offered = true; if (j.health === 'ok') j.health = 'slow'; logEv(j, model.label + ' has been slow for ' + secs(el) + ' seconds.');
          openOffer(j, { why: model.label + ' has not answered for ' + secs(el) + ' seconds.', owner: w, nx: nextLabel(j, w), secs: LIM.offer, onSwitch: () => decide('switch'), onWait: () => { extra += 60000; offered = false; } });
        }
      } else if (el > soft && j.health === 'ok') j.health = 'slow';
      if (el > hard + extra) decide('timeout');
      tickLive(j); pill();
    }, 1000);
    let res;
    try {
      res = await Promise.race([
        A().llm(withBrief(j, messages, t), Object.assign({ fast: true }, opt, { signal: cc.signal, model })).then((v) => ({ v }), (e) => ({ e })),
        decided.then((d) => ({ d }))]);
    } finally { clearInterval(watch); if (j.offer && j.offer.owner === w) j.offer.close(); const k = j.lives.indexOf(live); if (k >= 0) j.lives.splice(k, 1); j.ctrl.signal.removeEventListener('abort', link); }
    if (j.cancelled) throw new Error('cancelled');
    const ms = Date.now() - live.t0;
    if (res.v !== undefined && !String(res.v).trim()) res = { e: new Error('The model sent an empty answer.') };
    if (res.d) {
      cc.abort(); j.lastMs = ms; j.tele.calls.push({ k: t ? t.kind : '', m: model.label, ms, ok: 0, why: res.d });
      if ((res.d === 'switch' || j.stall !== 'wait') && moveOn(j, w, model, 'slow', t) === 'retry') continue;
      if (++slowHits >= 2) throw new Error(model.label + ' did not answer in time. Your work so far is kept. Continue, or choose another model.');
      logEv(j, model.label + ' did not answer in ' + secs(ms) + ' seconds. Trying again.'); continue;
    }
    if (res.v !== undefined) {
      j.lastMs = ms; j.calls++; j.callMs += ms; j.okCalls++; j.tele.calls.push({ k: t ? t.kind : '', m: model.label, ms, ok: 1 });
      if (!j.offer && j.health !== 'offline') j.health = 'ok'; maybeGrow(j); return res.v;
    }
    const e = res.e; if (e && e.name === 'AbortError') throw new Error('cancelled');
    j.tele.calls.push({ k: t ? t.kind : '', m: model.label, ms, ok: 0, why: 'error' });
    const m = String((e && e.message) || e);
    if (A().netErr(e)) {
      j.health = 'offline'; logEv(j, 'No internet. Waiting for it to return.'); j.note = 'No internet right now. Waiting for it to come back. Your work so far is kept.'; paint();
      const t0 = Date.now(); const ok = await waitOnline(j); j.tele.waitMs += Date.now() - t0; j.note = ''; if (!ok) throw new Error(j.cancelled ? 'cancelled' : 'The internet did not come back in time.');
      j.health = 'ok'; logEv(j, 'Back online. Continuing.'); continue;
    }
    const d = diagnose(m);
    if (d.kind === 'auth' || d.kind === 'missing') {
      logEv(j, model.label + ': ' + d.text);
      if (moveOn(j, w, model, d.kind, t) === 'retry') continue;
      throw new Error(d.text + ' ' + d.fix);
    }
    if (d.kind === 'busy') {
      busyHits++; j.rl++; shrinkExtra(j);
      const wsec = d.wait || Math.min(40, 8 * busyHits);
      PROVWAIT[w.prov] = Date.now() + wsec * 1000; j.health = 'busy'; logEv(j, model.label + ' is busy (free limit). Needs about ' + wsec + ' seconds.');
      const can = canMove(j, w);
      if (can && j.stall !== 'wait') {
        if (j.agent) { if ((wsec > 10 || busyHits >= 2) && moveOn(j, w, model, 'slow', t, Math.max(30000, wsec * 2000)) === 'retry') continue; }
        else if (busyHits >= nextAsk || (wsec > 20 && busyHits >= nextAsk - 1)) {
          const ans = await askSwitch(j, w, model.label + ' keeps hitting its free limit. ' + d.fix);
          if (j.cancelled) throw new Error('cancelled');
          if (ans === 'switch' && moveOn(j, w, model, 'slow', t, Math.max(30000, wsec * 2000)) === 'retry') continue;
          nextAsk = busyHits + 3;
        }
      }
      if (busyHits > 6) throw new Error(model.label + ' stayed busy. Wait a few minutes, or choose another model. Your work so far is kept.');
      continue;
    }
    otherHits++; logEv(j, model.label + ': ' + d.text);
    if (d.kind === 'server' && otherHits >= 2 && j.stall !== 'wait' && canMove(j, w)) {
      if (j.agent) { if (moveOn(j, w, model, 'slow', t) === 'retry') continue; }
      else { const ans = await askSwitch(j, w, model.label + ' is having trouble on its side.'); if (ans === 'switch' && moveOn(j, w, model, 'slow', t) === 'retry') continue; }
    }
    if (otherHits >= 3) throw new Error(d.text + ' ' + d.fix + ' (' + m.slice(0, 120) + ')');
    await pause(j, 3 * otherHits, 'busy');
  }
  throw new Error('The model did not answer after several tries.');
}
/* Start a second worker on a single provider when it answers fast and has not complained. */
function maybeGrow(j) {
  if (!j.auto || j.pool.length !== 1 || j.pool[0].model.k !== 'cloud' || j.rl || j.okCalls < 3 || !j.spawn || j.grown) return;
  j.grown = true; const w2 = mkWorker(j.pool[0].model, true); j.pool.push(w2);
  logEv(j, 'Adding a second worker on ' + w2.model.label + ' because it is answering fast.'); j.tele.maxPool = Math.max(j.tele.maxPool, 2); j.spawn(w2);
}
/* The queue: workers take the next task, and a task that cannot finish on one model goes back for another. */
function runAll(j, tasks) {
  return new Promise((resolve, reject) => {
    const q = tasks.slice(); let inflight = 0, dead = false;
    const fail = (e) => { if (dead) return; dead = true; if (String((e && e.message) || e) !== 'cancelled') { try { j.ctrl.abort(); } catch (x) { /* ignore */ } } j.spawn = null; reject(e); };
    async function loop(w) {
      while (!dead) {
        if (j.cancelled) return fail(new Error('cancelled'));
        if (w.stop) return;
        if (!w.model) {
          const nm = pickFor(j, w);
          if (nm) { w.model = nm; w.prov = nm.p || 'local'; j.used.add(nm.label); j.modelLabel = poolLabel(j); }
          else { if (!choices().some((c) => !j.failed.has(keyOf(c)))) return fail(new Error('Every connected model was refused or removed. Open Me and check your keys.')); await sleep(2000); continue; }
        }
        const t = q.shift();
        if (!t) { if (inflight === 0) { if (!dead) { dead = true; j.spawn = null; resolve(); } return; } await sleep(300); continue; }
        inflight++; w.cur = t; paint();
        let outcome = 'ok', err = null;
        try { await t.run(w, t); } catch (e) { err = e; outcome = e === REQ ? 'req' : (j.cancelled || String((e && e.message) || e) === 'cancelled') ? 'cancel' : 'err'; }
        inflight--; w.cur = null;
        if (outcome === 'ok') { try { afterTask(j, t); } catch (x) { /* progress display only */ } continue; }
        if (outcome === 'cancel') return fail(new Error('cancelled'));
        if (outcome === 'req') { t.moves = (t.moves || 0) + 1; q.unshift(t); await sleep(400); continue; }
        t.errs = (t.errs || 0) + 1;
        if (t.errs >= 3) { if (t.soft) { logEv(j, 'Skipped: ' + t.desc); continue; } return fail(err); }
        logEv(j, 'Trying again: ' + t.desc + '. ' + String((err && err.message) || err).slice(0, 80)); q.unshift(t); await sleep(1500);
      }
    }
    j.spawn = (w) => { if (!dead) loop(w).catch(fail); };
    j.pool.forEach((w) => { if (!w.stop) j.spawn(w); });
  });
}

const DEPTH = {
  short: { name: 'Short', hint: 'Straight to the value, like a good lecture. Usually about 4 to 10 lessons.', credits: '8 to 14', lessons: [5, 10], per: [35, 240], target: { light: 250, medium: 400, heavy: 600 }, queries: 3 },
  standard: { name: 'Standard', hint: 'The full course. As many modules and lessons as the subject needs, with examples and practice.', credits: '25 to 45', lessons: [10, 24], per: [50, 330], target: { light: 450, medium: 750, heavy: 1200 }, queries: 5 },
  deep: { name: 'Deep', hint: 'The extended course. Real openings, fuller explanations, extra examples and case studies.', credits: '45 to 80', lessons: [16, 36], per: [80, 520], target: { light: 800, medium: 1300, heavy: 2000 }, queries: 7 }
};
const today = () => new Date().toISOString().slice(0, 10);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/* ---- Research ---- */
function addSources(j, results, tag) {
  const R = j.research; let n = 0;
  (results || []).forEach((x) => {
    if (!x || !/^https?:\/\//.test(x.url) || R.sources.some((s) => s.url === x.url)) return;
    const host = hostOf(x.url), official = /\.(gov|edu)(\.|$)|docs?\.|developer\.|support\.|official|\.org$/.test(host);
    R.sources.push({ id: R.sources.length + 1, title: clip(x.title, 140) || host, url: x.url, host, date: today(), content: clip(x.content, 700), tag, official }); n++;
  });
  return n;
}
async function rsearch(j, q, opt) {
  const R = j.research, K = window.KVResearch;
  if (R.stopped || R.mode === 'none') return [];
  const r = await K.search(q, opt); R.searches++; R.credits++;
  if (r.ok) return r.results || [];
  if (['badkey', 'limit', 'nokey', 'oldlauncher', 'browser'].includes(r.code)) { R.stopped = r.code; R.mode = R.sources.length ? 'partial' : 'none'; j.weak.push(({ badkey: 'The search key was rejected, so research stopped.', limit: 'The free search credits ran out part way, so the rest of the course was written without new research.', oldlauncher: 'The Knowvia launcher is out of date, so web research was skipped. Close and reopen Knowvia.', browser: 'This browser blocked web search, so research was skipped.', nokey: 'No search key.' })[r.code] || 'Research stopped.'); }
  return [];
}
async function researchStep(j) {
  const K = window.KVResearch, R = j.research = { mode: 'none', sources: [], searches: 0, credits: 0, videos: 0, stopped: '', brief: '' };
  const yr = new Date().getFullYear(), D = DEPTH[j.depth];
  if (j.useResearch && K && K.status() === 'ready') {
    R.mode = 'web';
    j.msg = 'Researching the web'; j.sub = 'Finding current, reliable sources'; paint();
    const qs = [`${j.topic} complete guide for ${j.level.toLowerCase()} learners`, `${j.topic} syllabus curriculum what to learn`, `${j.topic} official documentation`, `${j.topic} common beginner mistakes`, `${j.topic} latest updates ${yr}`, `${j.topic} case studies real examples`, `${j.topic} best practices from experts`].slice(0, D.queries);
    for (let i = 0; i < qs.length; i++) {
      if (j.cancelled) throw new Error('cancelled');
      j.sub = 'Search ' + (i + 1) + ' of ' + qs.length; j.pct = Math.round(1 + (i + 1) / qs.length * 7); paint();
      addSources(j, await rsearch(j, qs[i], { max: 5 }), 'course');
      if (R.stopped) break;
    }
  }
  if (!R.sources.length) {
    const w = await K.wiki(j.topic);
    if (w && w.ok && (w.results || []).length) { R.mode = 'wiki'; addSources(j, w.results, 'course'); }
  }
  const off = (s) => (s.official ? 0 : 1);
  R.sources.sort((a, b) => off(a) - off(b)); R.sources.forEach((s, i) => { s.id = i + 1; });
  return R;
}
function briefFor(j, tag, max) {
  const list = (j.research.sources || []).filter((s) => s.tag === tag || s.tag === 'course').slice(0, isSmall(j) ? 5 : 9);
  if (!list.length) return '';
  let out = '', budget = max || (isSmall(j) ? 3200 : 8000);
  for (const s of list) { const line = `[${s.id}] ${s.title} (${s.host}): ${s.content}\n`; if (out.length + line.length > budget) break; out += line; }
  return out;
}
const NOTE_RESEARCH = (j) => j.research.sources.length ? '\nRESEARCH (real sources found for this course; base your plan on them and prefer current information; never invent sources):\n' + briefFor(j, 'course') : '\nNo web research is available, so rely on well-established general knowledge and be careful with anything that changes over time.';
const sysFor = (j, p) => PB().core + '\n' + (PB().depth ? PB().depth[j.depth] : '') + (p && p.type ? '\nSUBJECT TYPE: ' + (PB().types[p.type] || '') : '') + (j.brief && j.brief.text ? '\n' + j.brief.text : '') + (j.outline && j.outline.style ? '\nSTYLE SHEET (every writer follows it so the course reads as one voice): ' + j.outline.style : '');

/* ---- Planning: the outline first, then every module planned at the same time ---- */
function outlineTask(j) {
  const t = { kind: 'outline', desc: 'Plan the course outline: choose the subject type, then the modules in order.', run: async (w) => {
    const sys = sysFor(j) + '\nYou are planning a course. First read the subject and choose its type. Return ONLY valid JSON, with no text before or after it.';
    const sizeNote = j.depth === 'short' ? 'The learner wants the short version: only what gives real value, about 4 to 10 lessons in total.' : j.depth === 'deep' ? 'The learner wants the deep, extended version: cover the subject thoroughly, including projects, case studies and common mistakes.' : 'The learner wants the full standard course: cover what is needed to truly learn the subject.';
    const usr = `Plan the structure of a course.\nTopic: ${j.topic}\nLearner level: ${j.level}\nLearner: someone studying alone on a phone or laptop, possibly in Nigeria, with limited data.\n${sizeNote}\nLet the subject decide how many modules the course needs and how many lessons each module holds. Do not use a fixed number. Order modules so each builds on the last, and end with a finish-line project or review where it fits.${NOTE_RESEARCH(j)}\n\nAlso write a short "style" sheet (2 to 3 sentences) that every lesson writer will follow: the voice, how examples are written, and the exact names to use for key terms${j.brief && j.brief.tool ? ' and for ' + j.brief.tool + ' menus and buttons' : ''}.\n\nReturn JSON in exactly this shape:\n{"type":"software|concept|maths|craft|language|technical|business|creative|life","typeReason":"one short sentence","title":"Course title","subtitle":"One sentence promise","outcome":"After this course you can ...","style":"...","modules":[{"title":"Module name","purpose":"What this module achieves","lessonsHint":4}]}`;
    let lastErr;
    for (let k = 0; k < 3; k++) {
      const out = await call(j, w, [{ role: 'system', content: sys }, { role: 'user', content: usr + (k ? '\nYour last answer was not valid JSON in that shape. Return ONLY the JSON object.' : '') }], { max: 2400, temp: 0.4 }, t);
      try {
        const p = parseJson(out);
        if (!p.title || !Array.isArray(p.modules) || !p.modules.length) throw new Error('The outline had no modules.');
        p.modules = p.modules.slice(0, 16).map((m, i) => ({ title: String(m.title || 'Module ' + (i + 1)), purpose: String(m.purpose || ''), lessonsHint: Math.max(1, Math.min(20, +m.lessonsHint || 4)) }));
        p.type = PB().types[p.type] ? p.type : 'concept'; p.style = String(p.style || '').slice(0, 500);
        j.outline = p; return;
      } catch (e) { lastErr = e; }
    }
    throw new Error('The model could not produce a course outline (' + (lastErr && lastErr.message) + ').');
  } };
  return t;
}
function moduleTask(j, mi) {
  const o = j.outline, m = o.modules[mi];
  const t = { kind: 'module', desc: 'Plan the lessons of module ' + (mi + 1) + ' of ' + o.modules.length + ', "' + m.title + '". Return the lessons as JSON.', run: async (w) => {
    if (j.depth !== 'short' && j.research && j.research.mode === 'web' && !j.research.stopped && j.useResearch && !t.searched) { t.searched = true; addSources(j, await rsearch(j, j.topic + ' ' + m.title, { max: 4 }), 'm' + mi); }
    const share = j.depth === 'short' ? `The whole course should stay about 4 to 10 lessons, so this module should usually have ${m.lessonsHint <= 2 ? '1 or 2' : '2 to 3'} lessons.` : `Give this module as many lessons as it truly needs (a guess was ${m.lessonsHint}; it is not a limit).`;
    const sys = sysFor(j, o) + '\nReturn ONLY valid JSON, with no text before or after it.';
    const usr = `Course: "${o.title}". Outcome: ${o.outcome}\nLevel: ${j.level}\nAll modules in order, each planned by a different writer at the same time: ${o.modules.map((x, i) => (i + 1) + '. ' + x.title + ' (' + x.purpose + ')').join('; ')}\nNow plan module ${mi + 1}: "${m.title}" (${m.purpose}). Stay inside this module and do not teach what the other modules cover.\n${share}\nEach lesson teaches ONE main idea. Give each lesson a weight: "light" for a simple idea, "medium" normally, "heavy" for a hard idea that needs long explanation and several examples. For each lesson list its sections in order (2 to 6 short section names), 2 or 3 testable outcomes written as "Explain...", "Build...", and up to 5 key terms. Set videoQuery to a few search words for a teaching video only if watching would really help (software, design, editing, hands-on or physical skills, pronunciation); otherwise use "".${briefFor(j, 'm' + mi) ? '\nRESEARCH for this module:\n' + briefFor(j, 'm' + mi, 4000) : ''}\n\nReturn JSON: {"lessons":[{"title":"...","subtitle":"...","weight":"light|medium|heavy","outcomes":["..."],"sections":["..."],"terms":["..."],"videoQuery":""}]}`;
    let lastErr;
    for (let k = 0; k < 3; k++) {
      const out = await call(j, w, [{ role: 'system', content: sys }, { role: 'user', content: usr + (k ? '\nReturn ONLY the JSON object.' : '') }], { max: 3200, temp: 0.4 }, t);
      try {
        const p = parseJson(out); if (!Array.isArray(p.lessons) || !p.lessons.length) throw new Error('no lessons');
        j.planned[mi] = p.lessons.slice(0, 20).map((l, i) => ({ module: m.title, mi, title: String(l.title || 'Lesson ' + (i + 1)), subtitle: String(l.subtitle || ''), weight: ['light', 'medium', 'heavy'].includes(l.weight) ? l.weight : 'medium', outcomes: (Array.isArray(l.outcomes) ? l.outcomes : []).map(String).slice(0, 4), sections: (Array.isArray(l.sections) ? l.sections : []).map(String).slice(0, 8), terms: (Array.isArray(l.terms) ? l.terms : []).map(String).slice(0, 6), videoQuery: String(l.videoQuery || '').slice(0, 90) }));
        return;
      } catch (e) { lastErr = e; }
    }
    throw new Error('The model could not plan module ' + (mi + 1) + ' (' + (lastErr && lastErr.message) + ').');
  } };
  return t;
}
function makePlan(j) {
  const seen = new Set(); let lessons = [];
  j.planned.forEach((ls) => { (ls || []).forEach((l) => { let t = l.title, n = 2; while (seen.has(t.toLowerCase())) t = l.title + ' (' + (n++) + ')'; seen.add(t.toLowerCase()); lessons.push(Object.assign({}, l, { title: t })); }); });
  if (!lessons.length) throw new Error('The plan had no lessons.');
  lessons = lessons.slice(0, 120); j.plan = Object.assign({}, j.outline, { lessons, modulesOutline: j.outline.modules }); j.n = lessons.length;
}

/* ---- Writing: each lesson is one task. The last pass also writes the practice, so there is one call fewer. ---- */
function lessonTarget(j, L) { const base = DEPTH[j.depth].target[L.weight] || DEPTH[j.depth].target.medium; return Math.round(base * (isSmall(j) ? 0.7 : 1)); }
function passPlan(j, L) {
  const target = lessonTarget(j, L), per = isSmall(j) ? 420 : 650, n = Math.max(1, Math.ceil(target / per));
  const ss = L.sections.length ? L.sections : [L.title]; const passes = [];
  const size = Math.ceil(ss.length / Math.min(n, ss.length));
  for (let i = 0; i < ss.length; i += size) passes.push(ss.slice(i, i + size));
  return { target, passes, per: Math.round(target / passes.length) };
}
function srcFor(j, L) {
  const all = j.research.sources; if (!all.length) return [];
  const mod = all.filter((s) => s.tag === 'm' + L.mi).slice(0, 3), crs = all.filter((s) => s.tag === 'course').slice(0, isSmall(j) ? 3 : 5);
  return mod.concat(crs.filter((s) => !mod.includes(s)));
}
const PRACTICE_MARK = '=====PRACTICE=====';
function practiceAsk(L) {
  const nq = L.weight === 'heavy' ? 5 : L.weight === 'light' ? 3 : 4, nc = L.weight === 'heavy' ? 6 : 4;
  return `\nAfter the lesson, on a new line, write exactly ${PRACTICE_MARK} and then ONLY this JSON (no code fences): ${nq} multiple-choice questions and ${nc} flashcards about THIS lesson. Questions: four options, exactly one correct, three plausible wrong answers that reflect real misunderstandings; test understanding or use, not memory of a phrase; a short explanation of why the right answer is right. Flashcards: one idea each, no yes/no cards.\n{"quiz":[{"prompt":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}],"cards":[{"front":"...","back":"..."}]}`;
}
function lessonPrompt(j, i, pass, pp, soFar, srcs, last) {
  const p = j.plan, L = p.lessons[i];
  const inMod = p.lessons.filter((x) => x.mi === L.mi).map((x) => x.title);
  const map = p.modulesOutline.map((m, k) => (k + 1) + '. ' + m.title + (k === L.mi ? ' (lessons: ' + inMod.join('; ') + ')' : '')).join('\n');
  const prev = i > 0 ? 'The lesson before this one is "' + p.lessons[i - 1].title + '". Link to it in one sentence.' : 'This is the first lesson, so give the learner a quick early win.';
  const opening = j.depth === 'deep' ? 'Open with a real scenario, short story or question (3 to 5 sentences) that leads into the idea.' : 'Begin directly with the idea. No filler opening.';
  const cite = srcs.length ? `\nSOURCES you may cite. Add [n] after a statement that rests on source n. Use only these numbers; never invent a source:\n${srcs.map((s) => `[${s.id}] ${s.title} (${s.host}): ${isSmall(j) ? '' : s.content}`).join('\n')}\n` : '\nNo sources are available. Do not add any [n] citations, and be careful with facts that can change.\n';
  const sys = sysFor(j, p) + '\n' + PB().blocks;
  const usr = `You are writing lesson ${i + 1} of ${p.lessons.length} of the course "${p.title}" for a ${j.level.toLowerCase()} learner.\nCourse outcome: ${p.outcome}\nCourse map:\n${map}\n\nThis lesson: ${L.title}. ${L.subtitle}\nLearner outcomes: ${L.outcomes.join('; ')}. Key terms: ${L.terms.join(', ') || 'none'}.\nThe lesson's sections, in order: ${(L.sections.length ? L.sections : [L.title]).join(' | ')}\n${pp.passes.length > 1 ? `You are writing part ${pass + 1} of ${pp.passes.length}. THIS PART covers: ${pp.passes[pass].join(' | ')}.` : 'Write the whole lesson.'} Aim for about ${pp.per} words in this part, more only if the idea needs it.\n${pass === 0 ? prev + ' ' + opening : 'Continue directly from where the text below stops. Do not repeat, do not greet, do not restart.'}\nUse a ## heading for each section. Never use a # title.\n${last ? 'This is the last part: include a :::keyidea block, at least one :::example block, a :::exercise block, and a three-line Recap.' : 'Do not add a recap or the exercise yet. Worked examples are welcome.'}${cite}${soFar ? '\nTEXT SO FAR (end of it):\n' + soFar.slice(-1400) : ''}\nWrite the lesson text now.${last ? practiceAsk(L) : ''}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
}
function okPractice(o) {
  const quiz = (o.quiz || []).filter((q) => q && q.prompt && Array.isArray(q.options) && q.options.length >= 3 && Number.isInteger(+q.answer) && +q.answer >= 0 && +q.answer < q.options.length && q.explanation);
  const cards = (o.cards || []).filter((c) => c && c.front && c.back);
  return (quiz.length || cards.length) ? { quiz: quiz.slice(0, 6), cards: cards.slice(0, 7) } : null;
}
async function quizStep(j, w, t, i, body, L) {
  t.desc = 'Write the practice questions and flashcards for lesson ' + (i + 1) + ', "' + L.title + '", as JSON.';
  const sys = PB().core + '\nReturn ONLY valid JSON, with no text before or after it.';
  const nq = L.weight === 'heavy' ? 5 : L.weight === 'light' ? 3 : 4, nc = L.weight === 'heavy' ? 6 : 4;
  const usr = `Here is a lesson.\n\n${body.slice(0, isSmall(j) ? 5000 : 9000)}\n\nWrite ${nq} multiple-choice questions and ${nc} flashcards about it. Questions: four options, exactly one correct, three plausible wrong answers that reflect real misunderstandings; test understanding or use, not memory of a phrase; give a short explanation of why the right answer is right. Flashcards: one idea each, no yes/no cards.\nReturn JSON: {"quiz":[{"prompt":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}],"cards":[{"front":"...","back":"..."}]}`;
  for (let k = 0; k < 2; k++) {
    try { const r = okPractice(parseJson(await call(j, w, [{ role: 'system', content: sys }, { role: 'user', content: usr + (k ? '\nReturn ONLY the JSON object.' : '') }], { max: 2600, temp: 0.4 }, t))); if (r) return r; }
    catch (e) { if (e === REQ || String(e && e.message) === 'cancelled') throw e; }
  }
  j.weak.push('Lesson ' + (i + 1) + ' has no practice questions because the model could not write valid ones.');
  return { quiz: [], cards: [] };
}
async function videoStep(j, i) {
  const L = j.plan.lessons[i], R = j.research, K = window.KVResearch;
  if (!L.videoQuery || !R || R.stopped || !j.useResearch || !K || K.status() !== 'ready') return [];
  R.credits++; const r = await K.videos(L.videoQuery + ' ' + j.topic, 3);
  if (!r.ok) { if (['badkey', 'limit', 'oldlauncher', 'browser'].includes(r.code)) { R.stopped = r.code; j.weak.push('Videos could not be looked up (' + r.code + '), so the remaining lessons have none.'); } return []; }
  R.videos += r.videos.length; return r.videos;
}
async function writeLesson(j, w, t, i, st) {
  const L = j.plan.lessons[i], pp = passPlan(j, L), srcs = srcFor(j, L);
  st.body = st.body || ''; st.pass = st.pass || 0;
  for (; st.pass < pp.passes.length; st.pass++) {
    const pass = st.pass, last = pass === pp.passes.length - 1;
    t.desc = 'Write ' + (pp.passes.length > 1 ? 'part ' + (pass + 1) + ' of ' + pp.passes.length + ' of ' : '') + 'lesson ' + (i + 1) + ' of ' + j.n + ', "' + L.title + '", covering: ' + pp.passes[pass].join(' | ') + '. ' + (st.body ? 'Continue directly from the text already written, without repeating it.' : 'This is the start of the lesson.');
    let part = '', prac = null, tries = 0;
    while (tries < 2) {
      const raw = String(await call(j, w, lessonPrompt(j, i, pass, pp, st.body, srcs, last), { max: Math.min(3600, Math.round(pp.per * 2.4) + 600 + (last ? 900 : 0)), temp: 0.5 }, t)); tries++;
      const bits = raw.split(/=====\s*PRACTICE\s*=====/i);
      part = cleanMd(bits[0]); prac = last && bits[1] ? bits[1] : null;
      if (words(part) >= Math.min(120, pp.per * 0.4)) break;
    }
    st.body += (st.body ? '\n\n' : '') + part; if (prac) st.prac = prac;
  }
  let body = st.body;
  if (!/:::keyidea/.test(body)) { body += '\n\n:::keyidea\n' + (L.outcomes[0] || L.subtitle || L.title) + '\n:::'; j.weak.push('Lesson ' + (i + 1) + ' was missing a key idea, so a simple one was added.'); }
  if (!/:::example/.test(body)) j.weak.push('Lesson ' + (i + 1) + ' has no worked example block.');
  if (!/:::exercise/.test(body)) j.weak.push('Lesson ' + (i + 1) + ' has no task for the learner.');
  if (/lorem ipsum|\[insert|\bTODO\b|as an ai\b/i.test(body)) j.weak.push('Lesson ' + (i + 1) + ' contains placeholder or off-topic text.');
  const ok = new Set(srcs.map((s) => s.id)), used = new Set();
  body = body.replace(/\s?\[(\d{1,3})\]/g, (m, n) => { if (ok.has(+n)) { used.add(+n); return ' [' + n + ']'; } return ''; });
  if (srcs.length && !used.size) j.weak.push('Lesson ' + (i + 1) + ' does not cite any of the sources it was given.');
  const refs = Array.from(used).sort((a, b) => a - b).map((n) => { const s = j.research.sources.find((x) => x.id === n); return { n, title: s.title, url: s.url, host: s.host, date: s.date }; });
  let qz = null; if (st.prac) { try { qz = okPractice(parseJson(st.prac)); } catch (e) { qz = null; } }
  if (!qz) qz = await quizStep(j, w, t, i, body, L);
  let vids = []; try { vids = await videoStep(j, i); } catch (e) { vids = []; }
  return { body, refs, words: words(body), qz, vids };
}
function lessonTask(j, i, again) {
  const L = j.plan.lessons[i], st = {};
  const t = { kind: 'lesson', i, title: L.title, desc: 'Write lesson ' + (i + 1) + ' of ' + j.n + ', "' + L.title + '".', soft: !!again, run: async (w) => {
    const r = await writeLesson(j, w, t, i, st);
    if (again && j.lessons[i] && words(r.body) <= words(j.lessons[i])) return;
    j.lessons[i] = r.body; j.qz[i] = r.qz; j.done_[i] = { words: r.words, refs: r.refs, videos: r.vids, fixed: !!again };
  } };
  return t;
}
function afterTask(j, t) {
  j.doneN = j.done_.filter(Boolean).length; j.i = j.doneN; status(j); paint(); snap(j);
  if (t.kind === 'lesson') publishPartial(j);
}
function status(j) {
  if (j.step === 'lessons') { const act = (j.pool || []).filter((w) => w.cur && w.cur.kind === 'lesson').map((w) => w.cur.title); j.msg = 'Writing lessons'; j.sub = j.doneN + ' of ' + j.n + ' finished' + (act.length ? ' · now: ' + act.slice(0, 2).join(', ') : ''); j.pct = Math.round(20 + (j.doneN / Math.max(1, j.n)) * 72); }
  else if (j.step === 'plan') { if (j.outline) { const M = j.outline.modules.length, c = j.planned.filter(Boolean).length; j.msg = 'Planning the modules'; j.sub = c + ' of ' + M + ' planned'; j.pct = Math.round(10 + c / M * 10); } else { j.msg = 'Planning the course'; j.sub = 'Reading the subject and choosing the best shape for it'; j.pct = 9; } }
}

/* ---- Packs: the finished course, and an early version while the rest is still being written ---- */
function assemble(j, k) {
  const p = j.plan, mods = [], quiz = [], cards = [];
  p.lessons.slice(0, k).forEach((L, i) => {
    let m = mods.find((x) => x.title === L.module); if (!m) { m = { id: 'm' + (mods.length + 1), title: L.module, lessons: [] }; mods.push(m); }
    const id = 'l' + (i + 1), d = j.done_[i] || {};
    const minutes = Math.max(3, Math.round((d.words || 0) / 170) + 2);
    const les = { id, title: L.title, subtitle: L.subtitle, minutes, outcomes: L.outcomes, terms: (L.terms || []).slice(0, 8), body: j.lessons[i] || '' };
    if ((d.videos || []).length) les.videos = d.videos; if ((d.refs || []).length) les.refs = d.refs;
    m.lessons.push(les);
    const qs = (j.qz[i] || {}).quiz || [], cs = (j.qz[i] || {}).cards || [];
    qs.forEach((q, kk) => {
      const ids = ['a', 'b', 'c', 'd'], opts = q.options.slice(0, 4).map((tt, x) => ({ t: String(tt), ok: x === +q.answer }));
      for (let x = opts.length - 1; x > 0; x--) { const y = Math.floor(Math.random() * (x + 1)); [opts[x], opts[y]] = [opts[y], opts[x]]; }
      quiz.push({ id: 'q' + (i + 1) + '-' + (kk + 1), lesson: id, prompt: String(q.prompt), options: opts.map((o, x) => ({ id: ids[x], text: o.t })), answer: ids[opts.findIndex((o) => o.ok)], explanation: String(q.explanation) });
    });
    cs.forEach((c, kk) => cards.push({ id: 'f' + (i + 1) + '-' + (kk + 1), lesson: id, front: String(c.front), back: String(c.back) }));
  });
  return { mods, quiz, cards };
}
function makePack(j, k, partial) {
  const as = assemble(j, k), p = j.plan, R = j.research || { mode: 'none', sources: [], searches: 0, videos: 0 };
  const mins = as.mods.reduce((s, m) => s + m.lessons.reduce((t, l) => t + l.minutes, 0), 0), researched = R.mode === 'web' || R.mode === 'partial';
  const pack = { formatVersion: 1, id: j.packId, title: p.title, subtitle: p.subtitle, level: j.level, depth: j.depth, language: 'en', version: '1.0.0', estimatedHours: Math.max(0.5, Math.round(mins / 6) / 10), outcome: p.outcome, author: 'Built by Amani with ' + Array.from(j.used).join(' and '), origin: 'built', builtAt: j.builtAt || (j.builtAt = Date.now()), playbook: PB().version, type: p.type,
    tool: j.brief && j.brief.tool ? j.brief.tool : '', forYou: j.brief && !j.brief.skipped ? j.brief.summary : '',
    quality: { researched, researchMode: R.mode, sources: R.sources.length, videos: R.videos, searches: R.searches, factChecked: researched ? 'Written from web sources found by search. Claims were not individually verified by a person.' : R.mode === 'wiki' ? 'Light research only (Wikipedia). Not individually verified.' : 'not checked: written from the model\'s own knowledge, no web research', humanReviewed: false, note: 'Built by AI. Check important facts before relying on them. Examples marked as invented are for practice only.' },
    modules: as.mods, quiz: as.quiz, flashcards: as.cards, sources: sourcesMd(j, p) };
  if (partial) pack.building = { done: k, total: j.n }; else pack.quality.gates = gates(j, pack);
  return pack;
}
async function publishPartial(j) {
  if (j.pubBusy || j.cancelled || !j.plan) return;
  let k = 0; while (k < j.n && j.done_[k]) k++;
  if (k < 3 || k >= j.n || k <= (j.pubK || 0) || (j.pubK && Date.now() - j.pubT < 15000)) return;
  j.pubBusy = true;
  try { const pack = makePack(j, k, true); await window.KVStore.save(pack); A().addPack(pack); j.pubK = k; j.pubT = Date.now(); if (!j.pubTold) { j.pubTold = true; logEv(j, 'The first lessons are already in your library. You can start studying while the rest is written.'); } } catch (e) { /* the final save still happens */ }
  j.pubBusy = false;
}
async function judge(j) {
  const tasks = [];
  j.plan.lessons.forEach((L, i) => { const b = j.lessons[i] || '', d = j.done_[i] || {}; if (!d.fixed && (words(b) < lessonTarget(j, L) * 0.4 || !/:::exercise/.test(b))) tasks.push(lessonTask(j, i, true)); });
  if (!tasks.length) return;
  j.msg = 'Improving ' + Math.min(6, tasks.length) + ' lessons'; j.sub = 'Fixing short or incomplete lessons'; paint();
  await runAll(j, tasks.slice(0, 6));
}

/* ---- Saving the job so it can be resumed later, even after the app closes ---- */
const JK = 'kv.bjob';
function snap(j, force) {
  if (!force && Date.now() - (j.snapT || 0) < 1500) return; j.snapT = Date.now();
  const o = { v: 1, id: j.packId, topic: j.topic, level: j.level, depth: j.depth, useResearch: j.useResearch, auto: j.auto, agent: j.agent, review: j.review, stall: j.stall, modelKey: j.modelKey, brief: j.brief, research: j.research, outline: j.outline, planned: j.planned, plan: j.plan, lessons: j.lessons, qz: j.qz, done_: j.done_, weak: j.weak, used: Array.from(j.used), handoffs: j.handoffs, tele: { waitMs: j.tele.waitMs, maxPool: j.tele.maxPool, calls: j.tele.calls.slice(-80) }, elapsed: (j.elapsed || 0) + (j.run0 ? Date.now() - j.run0 : 0), n: j.n, pubK: j.pubK || 0, approved: !!j.approved, builtAt: j.builtAt, rl: j.rl, at: Date.now() };
  try { localStorage.setItem(JK, JSON.stringify(o)); } catch (e) { if (!j.noSave) { j.noSave = true; logEv(j, 'This device is low on storage, so Resume later may not work for this build.'); } }
}
const clearSaved = () => { try { localStorage.removeItem(JK); } catch (e) { /* ignore */ } };
function loadSaved() { try { const o = JSON.parse(localStorage.getItem(JK) || 'null'); return o && o.v === 1 && o.topic ? o : null; } catch (e) { return null; } }
function pending() { const o = loadSaved(); if (!o) return null; return { id: o.id, topic: o.topic, done: (o.done_ || []).filter(Boolean).length, n: o.n || 0, step: o.plan ? 'lessons' : o.outline ? 'plan' : 'start', at: o.at }; }
let WL = null;
async function keepAwake(on) {
  try { if (!on) { if (WL) { await WL.release(); WL = null; } return; } if (navigator.wakeLock && !WL && document.visibilityState === 'visible') { WL = await navigator.wakeLock.request('screen'); WL.addEventListener('release', () => { WL = null; }); } } catch (e) { WL = null; }
}
document.addEventListener('visibilitychange', () => { const j = BS.job; if (document.visibilityState === 'visible' && j && j.running) keepAwake(true); });

/* ---- The job ---- */
function newJob(o) {
  return { packId: o.id || ('built-' + slug(o.topic) + '-' + Date.now().toString(36)), topic: o.topic, level: o.level, depth: o.depth, useResearch: !!o.useResearch, auto: !!o.auto, agent: !!o.agent, review: !!o.review, stall: o.stall || 'offer', modelKey: o.modelKey || 'auto', brief: o.brief || null,
    model: o.model, modelLabel: o.model ? o.model.label : '', pool: [], failed: new Set(), handoffs: o.handoffs || [], used: new Set(o.used || (o.model ? [o.model.label] : [])), events: [], health: 'ok', t0: Date.now(), elapsed: o.elapsed || 0, calls: 0, okCalls: 0, callMs: 0, lastMs: 0, rl: o.rl || 0, lives: [], offer: null, ctrl: new AbortController(), cancelled: false, paused: false,
    research: o.research || null, outline: o.outline || null, planned: o.planned || [], plan: o.plan || null, lessons: o.lessons || [], qz: o.qz || [], done_: o.done_ || [], weak: o.weak || [], pct: 0, msg: 'Starting', sub: '', step: 'research', i: 0, n: o.n || 0, doneN: 0, note: '', approved: !!o.approved, pubK: o.pubK || 0, builtAt: o.builtAt,
    tele: { calls: (o.tele && o.tele.calls) || [], waitMs: (o.tele && o.tele.waitMs) || 0, maxPool: (o.tele && o.tele.maxPool) || 1 } };
}
function waitApproval(j) {
  j.step = 'review'; j.msg = 'Waiting for your approval'; j.sub = 'Check the plan, then approve it'; j.pct = 20; BS.view = 'plan'; snap(j, true); paint();
  const a = A(); if (a.route.name === 'build') a.renderScreen(); else a.toast('The plan is ready. Open Build a course to approve it.');
  return new Promise((res) => { j.approveRes = res; });
}
async function main(j) {
  const a = A(); j.running = true; j.error = ''; j.done = false; j.paused = false; j.run0 = Date.now(); j.t0 = Date.now() - (j.elapsed || 0); BS.view = 'run'; paint(); if (a.route.name === 'build') a.renderScreen();
  keepAwake(true);
  try {
    if (!j.research) { j.step = 'research'; j.msg = 'Researching the web'; j.sub = ''; j.pct = 1; paint(); await researchStep(j); snap(j, true); }
    buildPool(j);
    if (!j.plan) {
      j.step = 'plan'; status(j); paint();
      if (!j.outline) { await runAll(j, [outlineTask(j)]); snap(j, true); }
      const M = j.outline.modules.length; while (j.planned.length < M) j.planned.push(null);
      const tasks = j.outline.modules.map((m, mi) => (j.planned[mi] ? null : moduleTask(j, mi))).filter(Boolean);
      if (tasks.length) await runAll(j, tasks);
      makePlan(j); snap(j, true);
    }
    j.n = j.plan.lessons.length;
    if (j.review && !j.approved) { if (!(await waitApproval(j))) throw new Error('cancelled'); j.approved = true; BS.view = 'run'; if (a.route.name === 'build') a.renderScreen(); }
    j.step = 'lessons'; j.doneN = j.done_.filter(Boolean).length; status(j); paint();
    const lt = []; for (let i = 0; i < j.n; i++) if (!j.lessons[i]) lt.push(lessonTask(j, i));
    if (lt.length) await runAll(j, lt);
    j.step = 'check'; j.msg = 'Checking the quality'; j.sub = 'Structure, practice, sources and completeness'; j.pct = 94; paint();
    await judge(j);
    j.step = 'save'; j.msg = 'Saving to your library'; j.sub = ''; j.pct = 98; paint();
    const pack = makePack(j, j.n, false);
    await window.KVStore.save(pack); a.addPack(pack); j.pack = pack; j.lessonsN = pack.modules.reduce((n, m) => n + m.lessons.length, 0);
    j.report = report(j); clearSaved();
    j.pct = 100; j.running = false; j.done = true; j.msg = 'Done'; BS.view = 'done'; BS.last = pack.id;
    closeOffer(j); paint(); if (a.route.name === 'build') a.renderScreen(); else a.toast('Your course is ready: ' + pack.title);
  } catch (e) {
    j.running = false; closeOffer(j); const msg = String((e && e.message) || e);
    if (e === REQ) e = new Error('Every model was busy. Your work is kept. Continue in a minute.');
    if (msg === 'cancelled') {
      if (j.paused) { snap(j, true); BS.view = 'paused'; paint(); if (a.route.name === 'build') a.renderScreen(); return; }
      clearSaved(); BS.job = null; BS.view = 'catalog'; pill(); if (a.route.name === 'build') a.renderScreen(); return;
    }
    j.error = String((e && e.message) || e).slice(0, 220); BS.view = 'fail'; snap(j, true); paint(); if (a.route.name === 'build') a.renderScreen(); else a.toast('Course building paused. Open Build a course to continue.');
  } finally { keepAwake(false); }
}
function report(j) {
  const cs = j.tele.calls, ok = cs.filter((c) => c.ok), mins = (Date.now() - j.t0) / 60000, per = {};
  ok.forEach((c) => { const r = per[c.m] = per[c.m] || { n: 0, ms: 0 }; r.n++; r.ms += c.ms; });
  return { mins: Math.max(1, Math.round(mins)), calls: j.calls, workers: j.tele.maxPool, switches: j.handoffs.length, waitMin: Math.round(j.tele.waitMs / 60000), avgS: ok.length ? Math.round(ok.reduce((s, c) => s + c.ms, 0) / ok.length / 1000) : 0, per: Object.keys(per).map((k) => ({ m: k, n: per[k].n, s: Math.round(per[k].ms / per[k].n / 1000) })) };
}
function launch(o) {
  const list = choices(); if (!list.length) { A().toast('Connect a model first'); return; }
  const cur = chosen(list), j = newJob(Object.assign({}, o, { model: cur, modelKey: BS.modelKey }));
  BS.job = j; BS.iv = null; snap(j, true); main(j);
}
function resumeSaved() {
  const o = loadSaved(); if (!o) return; const list = choices(); if (!list.length) { A().toast('Connect a model first'); return; }
  const cur = chosen(list), j = newJob(Object.assign({}, o, { model: cur, modelKey: o.modelKey || 'auto' }));
  j.lessons = o.lessons || []; j.qz = o.qz || []; j.done_ = o.done_ || []; j.doneN = j.done_.filter(Boolean).length; if (j.plan) j.n = j.plan.lessons.length;
  BS.job = j; BS.topic = j.topic; BS.view = 'run'; main(j);
}
/* A single quick answer, for the Director. Tries the best models in turn and never waits long. */
async function quick(messages, opt) {
  opt = opt || {}; const list = choices().filter((c) => !cooling(c)).slice(0, 3); let last;
  for (const m of list) {
    const cc = new AbortController(), tm = setTimeout(() => cc.abort(), opt.timeout || 30000);
    try { const v = await A().llm(messages, { fast: true, max: opt.max, temp: opt.temp, signal: cc.signal, model: m }); clearTimeout(tm); if (String(v || '').trim()) return v; } catch (e) { clearTimeout(tm); last = e; }
  }
  throw last || new Error('No model answered');
}

function gates(j, pack) {
  const notes = j.weak.slice(); let pts = 0, max = 0; const R = j.research;
  const ls = pack.modules.reduce((a, m) => a.concat(m.lessons), []);
  ls.forEach((l, i) => {
    const L = j.plan.lessons[i], target = lessonTarget(j, L), w = words(l.body);
    const qn = pack.quiz.filter((q) => q.lesson === l.id).length, cn = pack.flashcards.filter((c) => c.lesson === l.id).length;
    const checks = [w >= target * 0.5, /:::keyidea/.test(l.body), /:::example/.test(l.body), /:::exercise/.test(l.body), l.outcomes.length >= 2, qn >= 2, cn >= 2];
    pts += checks.filter(Boolean).length; max += checks.length;
    if (w < target * 0.5) notes.push('Lesson ' + (i + 1) + ' is shorter than planned.');
    if (l.outcomes.length < 2) notes.push('Lesson ' + (i + 1) + ' has fewer than two outcomes.');
    if (qn < 2) notes.push('Lesson ' + (i + 1) + ' has fewer than two practice questions.');
  });
  const titles = ls.map((l) => l.title.toLowerCase()); if (new Set(titles).size < titles.length) notes.push('Two lessons share a title.');
  if (R.mode === 'none') notes.push('Not researched: written from the model\'s own knowledge.');
  const score = max ? Math.round(pts / max * 100) : 0;
  return { score, passed: score >= 85 && notes.filter((x) => !/Not researched/.test(x)).length < 4, notes: Array.from(new Set(notes)) };
}
function sourcesMd(j, p) {
  const R = j.research, ms = Array.from(j.used).join(' and '), d = today(), terms = Array.from(new Set(p.lessons.reduce((a, l) => a.concat(l.terms), []))).slice(0, 14);
  const how = R.mode === 'web' || R.mode === 'partial' ? `**How this course was made.** Amani searched the web (${R.searches} searches on ${d}), read what came back, and wrote the lessons using ${ms}, following the Knowvia Course Craft Playbook ${PB().version}. Numbers like [3] in a lesson point to the sources below.${R.mode === 'partial' ? ' Research stopped part way, so some lessons were written without new sources.' : ''}`
    : R.mode === 'wiki' ? `**How this course was made.** Amani looked up a few Wikipedia entries (on ${d}) and wrote the lessons with ${ms}, following the Course Craft Playbook ${PB().version}. This is light research only.`
    : `**How this course was made.** Amani wrote it using ${ms}, following the Knowvia Course Craft Playbook ${PB().version}. It used the model's own knowledge. No web research was done, and no facts were checked against named sources.`;
  const list = R.sources.length ? '\n\n## Sources read\n\n' + R.sources.map((s) => `${s.id}. [${s.title}](${s.url}), ${s.host}, read ${s.date}${j.done_.some((d2) => d2 && (d2.refs || []).some((r) => r.n === s.id)) ? '' : ' (background only)'}`).join('\n') : '';
  const vids = R.videos ? `\n\n## Videos\n\nVideo links were found by search and each one was checked to exist and be playable on ${d}. Videos are optional extras. Their content was not reviewed by Knowvia.` : '';
  return `# Sources and honesty\n\n${how}\n\n**What that means.** Search finds what is on the web, but it does not make every claim true. A person has not reviewed this course. Check anything important, especially prices, laws and tool features that change, before relying on it. Examples marked as invented are for practice only.${list}${vids}\n\n## Topics covered\n\n${terms.length ? terms.map((t) => '- ' + t).join('\n') : '- See the lessons'}\n`;
}
function slug(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'course'; }

/* ---------------- Actions ---------------- */
const R = REG.acts;
R['b-cat'] = (t, d) => { BS.cat = d.v; BS.q = ''; A().renderScreen(); };
R['b-pick'] = (t, d) => { BS.topic = d.t; BS.view = 'setup'; A().renderScreen(); };
R['b-back'] = () => { BS.view = 'catalog'; A().renderScreen(); };
R['b-level'] = (t, d) => { BS.level = d.v; A().renderScreen(); };
R['b-depth'] = (t, d) => { BS.depth = d.v; A().renderScreen(); };
R['b-res'] = (t, d) => { BS.research = d.v === 'on'; A().renderScreen(); };
R['b-model'] = (t, d) => { BS.modelKey = d.v; A().renderScreen(); };
R['b-stall'] = (t, d) => { BS.stall = d.v; A().renderScreen(); };
R['bsw-yes'] = () => { const j = BS.job; if (j && j.offer) j.offer.yes(); };
R['bsw-no'] = () => { const j = BS.job; if (j && j.offer) j.offer.no(); };
REG.ins['b-topic'] = (t) => { BS.topic = t.value.slice(0, 90); };

function launchWith(brief, spec, answers) {
  const K = window.KVResearch, use = BS.research && K && K.status() === 'ready';
  if (spec && answers && window.KVDirector) { try { window.KVDirector.remember(spec, answers); } catch (e) { /* ignore */ } }
  launch({ topic: BS.topic.trim(), level: BS.level, depth: BS.depth, useResearch: !!use, auto: BS.modelKey === 'auto', agent: agentOn(), review: BS.review, stall: BS.stall, brief });
}
async function begin() {
  const a = A(), D = window.KVDirector, list = choices(), topic = (BS.topic || '').trim();
  if (!list.length) { a.toast('Connect a model first'); return; }
  if (topic.length < 2) { a.toast('Type a topic first'); return; }
  const K = window.KVResearch, use = BS.research && K && K.status() === 'ready';
  if (!D || !BS.interview) { launchWith(D ? D.makeBrief(D.standardSpec(topic), {}, true, topic) : null); return; }
  const tk = ++BS.ivT; BS.iv = { spec: null, answers: {}, idx: 0, done: false }; BS.view = 'ask'; a.renderScreen();
  let spec; try { spec = await D.analyze(topic, BS.level, { research: !!use }); } catch (e) { spec = D.standardSpec(topic); }
  if (tk !== BS.ivT || BS.view !== 'ask') return;
  if (!spec.needs || !(spec.questions || []).length) { BS.iv = null; launchWith(D.makeBrief(spec, {}, true, topic)); return; }
  BS.iv = { spec, answers: {}, idx: 0, done: false }; a.renderScreen();
}
function ivNext() { const iv = BS.iv; if (!iv) return; if (iv.idx + 1 >= iv.spec.questions.length) iv.done = true; else iv.idx++; A().renderScreen(); }
R['b-start'] = begin;
R['b-go'] = () => { const iv = BS.iv; if (!iv || !iv.spec) return; const D = window.KVDirector; launchWith(D.makeBrief(iv.spec, iv.answers, false, BS.topic), iv.spec, iv.answers); };
R['b-ans'] = (t, d) => { const iv = BS.iv; if (!iv) return; iv.answers[iv.spec.questions[iv.idx].id] = d.v; ivNext(); };
R['b-auto'] = () => { const iv = BS.iv; if (!iv) return; iv.answers[iv.spec.questions[iv.idx].id] = '__auto'; ivNext(); };
R['b-ivnext'] = () => { const iv = BS.iv; if (!iv) return; const q = iv.spec.questions[iv.idx], v = ((A().$('#b-ivtext') || {}).value || '').trim(); iv.answers[q.id] = v || '__auto'; ivNext(); };
REG.ins['b-ivtext'] = (t) => { const iv = BS.iv; if (iv && iv.spec) iv.answers[iv.spec.questions[iv.idx].id] = t.value.slice(0, 120); };
R['b-ivprev'] = () => { const iv = BS.iv; if (iv && iv.idx > 0) { iv.idx--; A().renderScreen(); } };
R['b-ivredo'] = () => { const iv = BS.iv; if (iv) { iv.done = false; iv.idx = 0; A().renderScreen(); } };
R['b-skipiv'] = () => { const D = window.KVDirector; BS.ivT++; const sp = BS.iv && BS.iv.spec ? BS.iv.spec : D.standardSpec(BS.topic); BS.iv = null; launchWith(D.makeBrief(sp, {}, true, BS.topic)); };
R['b-ivcancel'] = () => { BS.ivT++; BS.iv = null; BS.view = 'setup'; A().renderScreen(); };
R['b-mode'] = (t, d) => { BS.agent = d.v === 'agent'; A().renderScreen(); };
R['b-iv'] = (t, d) => { BS.interview = d.v === 'on'; A().renderScreen(); };
R['b-rev'] = (t, d) => { BS.review = d.v === 'on'; A().renderScreen(); };
R['b-conn'] = (t, d) => { const a = A(); if (a.openProvider) a.openProvider(d.v); else a.go('me'); };
R['b-approve'] = () => { const j = BS.job; if (j && j.approveRes) { const r = j.approveRes; j.approveRes = null; r(true); } };
R['b-pause'] = () => { const j = BS.job; if (!j || !j.running) return; j.paused = true; j.cancelled = true; closeOffer(j); try { j.ctrl.abort(); } catch (e) { /* ignore */ } if (j.approveRes) { const r = j.approveRes; j.approveRes = null; r(false); } };
R['b-resume'] = () => { if (BS.job && BS.job.running) return; resumeSaved(); };
R['b-discard'] = () => { clearSaved(); BS.job = null; BS.view = 'catalog'; pill(); A().renderScreen(); };

R['b-bg'] = () => A().go('home');
R['b-cancel'] = () => {
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'b-ov';
  ov.innerHTML = '<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"><h3>Stop building?</h3><p class="help">The lessons written so far will be discarded. To keep them, use Pause instead.</p><div class="row-actions"><button class="btn" data-act="b-no">Keep building</button><button class="btn primary" data-act="b-yes">Stop</button></div></div>';
  document.body.appendChild(ov);
};
R['b-no'] = () => { const o = document.getElementById('b-ov'); if (o) o.remove(); };
R['b-yes'] = () => { const o = document.getElementById('b-ov'); if (o) o.remove(); const j = BS.job; if (j) { j.paused = false; j.cancelled = true; closeOffer(j); try { j.ctrl.abort(); } catch (e) { /* ignore */ } if (j.approveRes) { const r = j.approveRes; j.approveRes = null; r(false); } } };
R['b-retry'] = () => { const j = BS.job; if (!j) return; j.ctrl = new AbortController(); j.cancelled = false; j.paused = false; j.failed = new Set(); Object.keys(COOL).forEach((k) => delete COOL[k]); Object.keys(PROVWAIT).forEach((k) => delete PROVWAIT[k]); j.health = 'ok'; j.lives = []; logEv(j, 'Continuing the build.'); BS.view = 'run'; main(j); };
R['b-newmodel'] = () => { const j = BS.job; if (j) { BS.topic = j.topic; } BS.job = null; BS.view = 'setup'; A().renderScreen(); };
R['b-more'] = () => { BS.job = null; BS.view = 'catalog'; BS.q = ''; pill(); A().renderScreen(); };
R['b-open'] = () => { const a = A(), j = BS.job; if (!j || !j.pack) return; a.setActivePack(j.pack.id); const first = a.lessons(j.pack)[0]; BS.job = null; BS.view = 'catalog'; pill(); a.go('lesson/' + first.id); };
R['b-pb-read'] = () => {
  const a = A(), ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'pb-ov';
  ov.innerHTML = `<div class="ov-card pn-strong kv-in pbread" role="dialog" aria-modal="true" aria-label="Course Craft Playbook"><div class="pbbody prose">${a.renderMd(PB().full)}</div><div class="row-actions"><button class="btn" data-act="b-pb-copy">Copy for any AI</button><button class="btn primary" data-act="b-pb-close">Close</button></div></div>`;
  document.body.appendChild(ov);
};
R['b-pb-close'] = () => { const o = document.getElementById('pb-ov'); if (o) o.remove(); };
R['b-pb-copy'] = async () => {
  const a = A(), txt = PB().full;
  try { await navigator.clipboard.writeText(txt); a.toast('Playbook copied. Paste it into any AI.'); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); a.toast('Playbook copied. Paste it into any AI.'); } catch (e2) { a.toast('Could not copy. Use Download instead.'); } ta.remove(); }
};
R['b-pb-dl'] = () => { const b = new Blob([PB().full], { type: 'text/markdown' }), u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = 'Course-Craft-Playbook.md'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); };

/* search box: update results without losing focus */
document.addEventListener('input', (ev) => { if (ev.target && ev.target.id === 'bq') { BS.q = ev.target.value; const r = A().$('#bres'); if (r) r.innerHTML = resultsHtml(); } });
document.addEventListener('submit', (ev) => { if (ev.target && ev.target.id === 'bform') { ev.preventDefault(); const q = (A().$('#bq') || {}).value || ''; if (q.trim().length >= 2) { BS.topic = q.trim(); BS.view = 'setup'; A().renderScreen(); } } });
window.KVBuild.state = BS; window.KVBuild.limits = LIM; window.KVBuild.cool = COOL;
})();
