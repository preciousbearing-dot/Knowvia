/* The screens for Knowvia's voice: Voice settings and lab, the offline voice download, the player bar, the Listen button on lessons. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp, K = () => window.KVVoice;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r) => (r || document).querySelector(s);
const ic = (n) => A().ic(A().I[n], 20, 1.9);
const hhmm = (t) => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const mb = (n) => (n >= 1048576 ? Math.round(n / 104857.6) / 10 + ' MB' : Math.round(n / 1024) + ' KB');
const LAB = { cloud: '', offline: '', phone: '', busy: '' };
const ENG = [
  { id: 'auto', n: 'Automatic (recommended)', d: 'Uses the cloud voice when you are online, the offline voice when you are not, and your phone\'s voice as the last resort. Nothing to manage.' },
  { id: 'cloud', n: 'Cloud voice (Gemini)', d: 'The most natural voice, with a different character for each Amani personality. Needs internet and your free Gemini key. The free plan has a daily limit.' },
  { id: 'offline', n: 'Offline voice', d: 'A small voice that lives on this phone. Private, works with no internet and has no limit. English only, a little less natural.' },
  { id: 'phone', n: 'This phone\'s own voice', d: 'The voice built into Android. Instant and free, but more robotic. Cannot be saved as audio, so it speaks live.' }
];
function engStatus(id) {
  const v = K(), V = v.V();
  if (id === 'auto') return { ok: v.canSpeak(), t: v.canSpeak() ? 'Ready' : 'Nothing set up yet' };
  if (id === 'cloud') {
    if (!v.AVAIL.cloud() && navigator.onLine === false) return { ok: false, t: 'No internet right now' };
    let key = ''; try { key = A().cloudCfg('gemini').key; } catch (e) { key = ''; }
    if (!key) return { ok: false, t: 'Needs a Gemini key (free)' };
    if (Date.now() < (V.cbUntil || 0)) return { ok: false, t: 'Resting until about ' + hhmm(V.cbUntil) };
    return { ok: true, t: 'Ready' };
  }
  if (id === 'offline') { if (!v.native) return { ok: false, t: 'Android app only' }; const o = v.OFF; return o.ready ? { ok: true, t: 'Installed' } : { ok: false, t: 'Not installed' }; }
  return v.AVAIL.phone() ? { ok: true, t: 'Ready' } : { ok: false, t: 'Not available here' };
}
const persName = () => { try { const r = K().roleId(); return ({ amani: 'Amani', teacher: 'Teacher', tutor: 'Private tutor', coach: 'Coach', mentor: 'Mentor', friend: 'Friend', partner: 'Study partner', bigbro: 'Big brother', bigsis: 'Big sister', father: 'Father figure', padi: 'Padi', sabi: 'Sabi guy', homegirl: 'Homegirl', homeboy: 'Homeboy' })[r] || 'Amani'; } catch (e) { return 'Amani'; } };

/* ---------------- The Voice screen ---------------- */
function engHtml() {
  const V = K().V();
  return ENG.map((e) => { const s = engStatus(e.id), on = V.engine === e.id; return `<button class="mrow of-row ${on ? 'on' : ''}" data-act="v-engine" data-v="${e.id}" role="radio" aria-checked="${on}"><span class="rad"></span><span class="grow"><b>${esc(e.n)}</b><span class="s">${esc(e.d)}</span></span><span class="badge ${s.ok ? 'ok' : 'warn'}">${esc(s.t)}</span></button>`; }).join('');
}
function voicesHtml() {
  const v = K(), V = v.V(), cur = v.gemVoice(), sid = v.offSid(), pv = v.pickPhoneVoice(), pvs = v.phoneVoices();
  const cloud = `<label class="field"><span>Cloud voice for ${esc(persName())}</span><select data-in="v-cloud" aria-label="Cloud voice">${v.GEM_VOICES.map((g) => `<option value="${g[0]}" ${g[0] === cur ? 'selected' : ''}>${g[0]} · ${g[1]}</option>`).join('')}</select></label>
    <div class="row-actions"><button class="btn sm" data-act="v-hear" data-v="cloud">Hear it</button><span class="help vlab" id="vlab-cloud">${esc(LAB.cloud)}</span></div>`;
  const off = !v.native ? '' : `<label class="field"><span>Offline voice for ${esc(persName())}</span><select data-in="v-off" aria-label="Offline voice" ${v.OFF.ready ? '' : 'disabled'}>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<option value="${i}" ${i === sid ? 'selected' : ''}>Voice ${i + 1}</option>`).join('')}</select></label>
    <div class="row-actions"><button class="btn sm" data-act="v-hear" data-v="offline" ${v.OFF.ready ? '' : 'disabled'}>Hear it</button><span class="help vlab" id="vlab-offline">${v.OFF.ready ? esc(LAB.offline) : 'Install the offline voice below to try this.'}</span></div>`;
  const phone = `<label class="field"><span>This phone's voice</span><select data-in="v-phone" aria-label="Phone voice">${pvs.length ? pvs.map((x) => `<option value="${esc(x.voiceURI)}" ${pv && x.voiceURI === pv.voiceURI ? 'selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`).join('') : '<option>No English voice found</option>'}</select></label>
    <div class="row-actions"><button class="btn sm" data-act="v-hear" data-v="phone">Hear it</button><span class="help vlab" id="vlab-phone">${esc(LAB.phone)}</span></div>`;
  const rates = [0.8, 1, 1.15, 1.3, 1.5];
  return `<p class="help">Each Amani personality has its own voice. You are using <b>${esc(persName())}</b>. Change the personality in Me, and the voice follows. Pick the voice you like here.</p>${cloud}${off}${phone}
    <p class="sub-h">Speed</p><div class="chips" role="radiogroup" aria-label="Speaking speed">${rates.map((r) => `<button class="chip ${Math.abs((V.rate || 1) - r) < 0.01 ? 'on' : ''}" data-act="v-rate" data-v="${r}" role="radio" aria-checked="${Math.abs((V.rate || 1) - r) < 0.01}">${r === 1 ? 'Normal' : r + 'x'}</button>`).join('')}</div>`;
}
function offHtml() {
  const v = K(), o = v.OFF, st = o.st || {}, M = v.OFF_MODEL;
  if (!v.native) return `<p class="help">The offline voice is part of the Android app. In the browser Knowvia uses the cloud voice and your device's own voice.</p>`;
  if (!o.engine) return `<p class="help">This version of the app does not include the voice engine yet. Update the Android app to get the offline voice.</p>`;
  const running = ['running', 'waiting', 'unpacking'].includes(st.state), pct = st.pct || 0;
  const stages = ['Check the phone', 'Download', 'Unpack', 'Ready to use'];
  const stage = !running ? (o.ready ? 4 : 0) : st.state === 'unpacking' ? 2 : 1;
  const stepper = `<ol class="vsteps" aria-label="Setup stages">${stages.map((s, i) => `<li class="${i < stage ? 'done' : i === stage ? 'now' : ''}"><i></i>${esc(s)}</li>`).join('')}</ol>`;
  if (running) {
    const unp = st.state === 'unpacking', right = !unp && !st.waiting && st.speed ? st.speed + ' MB/s' + (st.eta ? ' · about ' + Math.max(1, Math.round(st.eta / 60)) + ' min left' : '') : '';
    return `<h4>Setting up the offline voice</h4>${stepper}<p class="help" role="status">${st.state === 'waiting' ? 'Connection lost. Waiting for the internet, then the download continues by itself.' : unp ? 'Unpacking the voice on this phone. This part cannot be paused and only takes a moment.' : 'Downloading ' + esc(M.name) + ': ' + mb(st.done || 0) + ' of ' + mb(st.total || M.bytes)}</p>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><p class="meta of-meta"><span>${pct}%</span><span>${esc(right)}</span></p>
      ${unp ? '' : '<div class="row-actions"><button class="btn" data-act="v-off-pause">Pause</button><button class="btn" data-act="v-off-cancel">Cancel</button></div>'}`;
  }
  if (st.state === 'paused') return `<h4>Download paused</h4><p class="help">Paused at <b>${pct}%</b>. What was downloaded is kept, so resuming continues from here.</p><div class="bar"><i style="width:${pct}%"></i></div><div class="row-actions"><button class="btn primary" data-act="v-off-get">Resume the download</button><button class="btn" data-act="v-off-cancel">Cancel it</button></div>`;
  if (st.state === 'error') return `<h4>Setup stopped</h4><p class="help">${esc(st.error || 'The download stopped.')}</p><div class="row-actions"><button class="btn primary" data-act="v-off-get">Try again</button><button class="btn" data-act="v-off-cancel">Dismiss</button></div>`;
  if (o.ready) {
    const t = o.tune, last = o.last;
    const speed = t ? `Measured on this phone: it speaks <b>${Math.round(1 / Math.max(0.01, t.rtf) * 10) / 10} times faster than real time</b> using ${t.threads} ${t.threads === 1 ? 'thread' : 'threads'}.` : last && last.audioMs ? `The last sentence took ${Math.round(last.genMs / 100) / 10} s to make ${Math.round(last.audioMs / 100) / 10} s of speech.` : 'Speed is not measured yet.';
    return `<h4>The offline voice is installed</h4><p class="help">${esc(M.name)} · ${mb(o.bytes || 0)} on this phone · 8 English voices. ${speed}</p>
      <div class="row-actions"><button class="btn" data-act="v-off-tune" ${TUNE.running ? 'disabled' : ''}>${TUNE.running ? 'Testing...' : 'Test and tune the speed'}</button><button class="btn ${ARM === 'off' ? 'danger' : ''}" data-act="v-off-del">${ARM === 'off' ? 'Tap again to remove' : 'Remove it'}</button></div>
      ${TUNE.running ? `<p class="help" role="status">${esc(TUNE.msg)}</p><div class="bar"><i style="width:${TUNE.pct || 5}%"></i></div>` : TUNE.res ? `<p class="help">${esc(TUNE.res)}</p>` : ''}`;
  }
  return `<h4>Add the offline voice</h4><p class="help"><b>${esc(M.name)}</b>: a small voice with ${M.voices} English voices. It downloads once (about ${M.mb} MB, from its official source), then speaks with no internet and no limit. Your phone needs about ${M.mb * 3} MB free while it unpacks.</p>
    <p class="help">It is a little less natural than the cloud voice and speaks English only. Nigerian accents are not available in free voices yet, so it is clear and neutral.</p>${stepper}
    <div class="row-actions"><button class="btn primary" data-act="v-off-get">Download the offline voice (${M.mb} MB)</button></div>`;
}
function storeHtml() {
  const V = K().V();
  return `<label class="switchrow"><input type="checkbox" data-in="v-rewrite" ${V.rewrite ? 'checked' : ''}><span><b>Write lessons for the ear</b><span class="s">Amani rewrites each lesson as a natural spoken script before it is read, using one cloud write per lesson. Switch off to read the lesson text as it is.</span></span></label>
    <label class="switchrow"><input type="checkbox" data-in="v-next" ${V.autoNext ? 'checked' : ''}><span><b>Keep going to the next lesson</b><span class="s">When a lesson ends, the next one starts by itself.</span></span></label>
    <p class="help" id="v-store">Saved audio: checking...</p><div class="row-actions"><button class="btn" data-act="v-clear">Clear saved audio</button></div>`;
}
let TUNE = { running: false, msg: '', pct: 0, res: '' }, ARM = '';
const paintSlot = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
function paintAll() { paintSlot('v-eng', engHtml()); paintSlot('v-voices', voicesHtml()); paintSlot('v-off', offHtml()); }
function paintStore() { K().storeInfo().then((s) => { const e = document.getElementById('v-store'); if (e) e.textContent = s.clips ? 'Saved audio: ' + mb(s.bytes) + ' (' + s.clips + ' pieces). It is only deleted when you clear it, or when it passes 500 MB.' : 'Saved audio: nothing yet. Audio you play is kept here, so it is never made twice.'; }); }
REG.screens.voice = function () {
  const v = K(); v.offRefresh().then(() => { paintAll(); }); paintStore();
  return `<div class="page voice"><header class="vtop"><p class="eyebrow">Settings</p><h1>Voice</h1><p class="lede">Hear lessons and answers read aloud, in a voice that suits you.</p></header>
    <section class="setting pn-strong"><h3>Who speaks</h3><div class="mlist" id="v-eng" role="radiogroup" aria-label="Which voice speaks">${engHtml()}</div></section>
    <section class="setting pn-strong"><h3>Voice lab</h3><div id="v-voices">${voicesHtml()}</div></section>
    <section class="setting pn-strong ofcard"><h3>Offline voice</h3><div id="v-off">${offHtml()}</div></section>
    <section class="setting pn-strong"><h3>Audio lessons and saved audio</h3>${storeHtml()}</section>
    <p class="help vfoot">Voices come from Google's Gemini (cloud) and the open Kitten model (offline). The offline voice is built on open-source software; the cloud voice uses your free Gemini key and its daily limit.</p></div>`;
};
REG.names.voice = 'Voice';
const R = REG.acts;
R['v-engine'] = (t, d) => { const V = K().V(); V.engine = d.v; A().save(); paintAll(); };
R['v-rate'] = (t, d) => { K().setRate(parseFloat(d.v)); paintSlot('v-voices', voicesHtml()); };
REG.ins['v-cloud'] = (t) => { const V = K().V(); V.cloud[K().roleId()] = t.value; };
REG.ins['v-off'] = (t) => { const V = K().V(); V.off[K().roleId()] = parseInt(t.value, 10) || 0; };
REG.ins['v-phone'] = (t) => { K().V().phone = t.value; };
REG.ins['v-rewrite'] = (t) => { K().V().rewrite = !!t.checked; };
REG.ins['v-next'] = (t) => { K().V().autoNext = !!t.checked; };
R['v-hear'] = async (t, d) => {
  const e = d.v, el = document.getElementById('vlab-' + e); if (el) el.textContent = 'Getting a sample...';
  const r = await K().sample(e);
  const msg = !r.ok ? (r.err || 'Could not play the sample.') : e === 'phone' ? 'Playing.' : 'Started in ' + Math.round(r.ms / 100) / 10 + ' s. ' + (r.rtf ? (r.rtf < 1 ? 'Made ' + Math.round(1 / r.rtf * 10) / 10 + 'x faster than it plays.' : 'Slower than real time: expect pauses on long lessons.') : '');
  LAB[e] = msg; const el2 = document.getElementById('vlab-' + e); if (el2) el2.textContent = msg; paintAll();
};
R['v-off-get'] = async () => {
  const D = window.KVDevice;
  try { if (D && D.refresh) { await D.refresh(); const free = D.state && D.state.specs && D.state.specs.diskFreeGb; if (free != null && free < 0.35) { A().toast('Not enough free space: the offline voice needs about ' + K().OFF_MODEL.mb * 3 + ' MB while it unpacks. You have ' + Math.round(free * 1024) + ' MB.'); return; } } } catch (e) { /* the install checks space again */ }
  K().offInstall().catch((e) => A().toast((e && e.message) || 'Could not start the download'));
};
R['v-off-pause'] = () => { K().offPause(); };
R['v-off-cancel'] = () => { K().offCancel().then(() => K().offRefresh()); };
R['v-off-del'] = () => { if (ARM !== 'off') { ARM = 'off'; paintSlot('v-off', offHtml()); setTimeout(() => { if (ARM === 'off') { ARM = ''; paintSlot('v-off', offHtml()); } }, 4000); return; } ARM = ''; K().offRemove().then(() => { A().toast('The offline voice was removed'); paintAll(); }); };
R['v-off-tune'] = async () => {
  if (TUNE.running) return; TUNE = { running: true, msg: 'Starting', pct: 5, res: '' }; paintSlot('v-off', offHtml());
  try { const r = await K().tuneOffline((p) => { TUNE.msg = p.msg; TUNE.pct = p.pct; paintSlot('v-off', offHtml()); }); TUNE.res = r.best ? 'Best: ' + r.best.threads + (r.best.threads === 1 ? ' thread' : ' threads') + '. Saved.' : 'Could not measure the speed.'; }
  catch (e) { TUNE.res = (e && e.message) || 'The speed test could not finish.'; }
  TUNE.running = false; paintSlot('v-off', offHtml());
};
R['v-clear'] = async () => { await K().clearAudio(); A().toast('Saved audio cleared'); paintStore(); };
let lastReady = null;
K().subscribeOff(() => { if (!document.getElementById('v-off')) return; paintSlot('v-off', offHtml()); const r = !!K().OFF.ready; if (r !== lastReady) { lastReady = r; paintSlot('v-eng', engHtml()); paintSlot('v-voices', voicesHtml()); } });

/* ---------------- Me card ---------------- */
const prevMe = REG.hooks.meCard;
REG.hooks.meCard = () => {
  const v = K(), V = v.V(), eng = ENG.find((e) => e.id === V.engine) || ENG[0], any = v.canSpeak();
  const line = any ? 'Reading aloud: ' + eng.n.replace(' (recommended)', '') + '. Voice for ' + persName() + (v.AVAIL.cloud() ? ': ' + v.gemVoice() : '') + '.' : 'No voice is ready yet. Connect Gemini for the best voice, or add the free offline voice.';
  return (prevMe ? prevMe() : '') + `<section class="setting pn-strong"><h3>Voice</h3><p class="help">${esc(line)}</p><div class="row-actions"><button class="btn ${any ? '' : 'primary'}" data-act="nav" data-r="voice">${any ? 'Voice settings' : 'Set up a voice'}</button></div></section>`;
};

/* ---------------- Listen on a lesson ---------------- */
const SAVED = Object.create(null);
function headHtml(l) {
  const v = K(), PL = v.PL, here = PL.lessonId === l.id && PL.st !== 'idle', prep = v.PREP.id === l.id ? v.PREP : null, can = v.canSpeak(), eng = v.usable()[0];
  if (!can) return `<div class="lhear" data-lid="${l.id}"><button class="btn" data-act="nav" data-r="voice">${ic('speaker')} Set up a voice to listen</button></div>`;
  const playing = here && PL.st === 'playing', loading = here && PL.st === 'loading', paused = here && PL.st === 'paused';
  const label = playing ? 'Pause' : paused ? 'Resume' : loading ? 'Getting ready...' : (v.V().pos[l.id] > 0 ? 'Continue listening' : 'Listen to this lesson');
  let line = '';
  if (here && PL.err) line = PL.err; else if (prep && prep.st === 'running') line = 'Saving audio: part ' + Math.min(prep.i + 1, prep.n || 1) + ' of ' + (prep.n || '...'); else if (prep && prep.st === 'error') line = prep.err; else if (prep && prep.st === 'done') line = 'Saved. This lesson now plays instantly, even offline.'; else if (SAVED[l.id] && SAVED[l.id].saved) line = 'Saved on this phone: plays instantly, even offline.'; else line = 'About ' + l.minutes + ' minutes · ' + (eng === 'cloud' ? 'cloud voice' : eng === 'offline' ? 'offline voice' : 'phone voice');
  const save = eng && eng !== 'phone' && !(SAVED[l.id] && SAVED[l.id].saved) ? (prep && prep.st === 'running' ? `<button class="btn sm" data-act="v-save-cancel">Stop saving</button>` : `<button class="btn sm" data-act="v-save" data-id="${l.id}">Save audio</button>`) : '';
  return `<div class="lhear" data-lid="${l.id}"><button class="btn primary lplay ${playing ? 'on' : ''}" data-act="v-lesson" data-id="${l.id}">${ic('speaker')} ${label}</button>${save}<span class="help lline" role="status">${esc(line)}</span></div>`;
}
REG.hooks.lessonHead = (l) => { if (!SAVED[l.id]) { SAVED[l.id] = { saved: false }; K().savedState(l.id).then((s) => { SAVED[l.id] = s; paintHead(); }).catch(() => {}); } return headHtml(l); };
function paintHead() { document.querySelectorAll('.lhear[data-lid]').forEach((e) => { const l = A().lessonById(e.dataset.lid); if (l) e.outerHTML = headHtml(l); }); }
R['v-lesson'] = (t, d) => { K().playLesson(d.id); };
R['v-save'] = (t, d) => { K().prepare(d.id).then(() => { delete SAVED[d.id]; paintHead(); }); paintHead(); };
R['v-save-cancel'] = () => { K().cancelPrepare(); paintHead(); };

/* ---------------- The player bar ---------------- */
function bar() {
  let b = document.getElementById('aplayer');
  if (!b) { b = document.createElement('div'); b.id = 'aplayer'; b.className = 'aplayer pn-strong'; b.hidden = true; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Audio lesson player'); document.body.appendChild(b); }
  return b;
}
let lastBar = '';
function paintBar(PL) {
  const b = bar(), show = PL.kind === 'lesson' && PL.st !== 'idle';
  if (!show) { b.hidden = true; lastBar = ''; return; }
  const n = PL.items.length, i = Math.min(PL.i, Math.max(0, n - 1)), pct = n ? Math.round(PL.i / n * 100) : 0;
  const status = PL.st === 'error' ? PL.err : PL.st === 'loading' && !n ? (PL.note || 'Getting the lesson ready...') : PL.st === 'loading' ? 'Getting the next part...' : n ? 'Part ' + (i + 1) + ' of ' + n : '';
  const playing = PL.st === 'playing', rate = K().V().rate || 1;
  const key = [PL.st, PL.i, n, PL.title, status, rate, PL.note].join('|');
  if (key === lastBar && !b.hidden) return; lastBar = key;
  b.hidden = false;
  b.innerHTML = `<div class="ap-top"><button class="ap-title linkbtn" data-act="v-open" aria-label="Open this lesson">${esc(PL.title)}</button><button class="ap-x" data-act="v-stop" aria-label="Close the player">${A().ic('<path d="M6 6l12 12M18 6L6 18"/>', 18, 2)}</button></div>
    <div class="ap-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <div class="ap-row"><span class="ap-st" role="status">${esc(status)}${PL.note && n ? ' ' + esc(PL.note) : ''}</span><span class="ap-ctl">
    <button class="ap-b" data-act="v-prev" aria-label="Previous part" ${n ? '' : 'disabled'}>${A().ic('<path d="M7 6v12M18 6l-8 6 8 6z"/>', 20, 2)}</button>
    <button class="ap-b big" data-act="v-toggle" aria-label="${playing ? 'Pause' : 'Play'}">${PL.st === 'loading' ? '<span class="typing"><i></i><i></i><i></i></span>' : playing ? A().ic('<path d="M8 5v14M16 5v14"/>', 22, 2.4) : A().ic('<path d="M8 5l11 7-11 7z"/>', 22, 2)}</button>
    <button class="ap-b" data-act="v-nxt" aria-label="Next part" ${n ? '' : 'disabled'}>${A().ic('<path d="M17 6v12M6 6l8 6-8 6z"/>', 20, 2)}</button>
    <button class="ap-sp" data-act="v-speed" aria-label="Speaking speed">${rate === 1 ? '1x' : rate + 'x'}</button></span></div>`;
}
R['v-toggle'] = () => { const v = K(); if (v.PL.st === 'paused') v.resume(); else if (v.PL.st === 'playing' || v.PL.st === 'loading') v.pause(); else if (v.PL.st === 'error' && v.PL.lessonId) v.playLesson(v.PL.lessonId, { from: v.PL.i }); };
R['v-prev'] = () => K().skip(-1);
R['v-nxt'] = () => K().skip(1);
R['v-stop'] = () => K().stop();
R['v-open'] = () => { const id = K().PL.lessonId; if (id) A().go('lesson/' + id); };
R['v-speed'] = () => { const L = [0.8, 1, 1.15, 1.3, 1.5], r = K().V().rate || 1, i = L.findIndex((x) => Math.abs(x - r) < 0.01); K().setRate(L[(i + 1) % L.length]); };
K().subscribe((PL) => {
  paintBar(PL); paintHead();
  document.querySelectorAll('.listen.on').forEach((b) => b.classList.toggle('busy', PL.st === 'loading'));
  if (PL.kind === 'chat' && PL.st === 'idle') document.querySelectorAll('.listen.on').forEach((b) => b.classList.remove('on', 'busy'));
});
K().subscribePrep(() => paintHead());
REG.ready.push(() => { paintBar(K().PL); });
window.KVVoiceUI = { paintAll, headHtml };
})();
