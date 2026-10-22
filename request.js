/* Ask the Knowvia team to build a course. Sends a push notification to the team through ntfy, keeps a local list of
   requests (capped), and marks one ready when the Course store lists a course for it. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
/* topic is the private channel the team's phone listens to; wa is an optional WhatsApp number for the one-tap fallback */
const CFG = Object.assign({ topic: 'knowvia-req-hp7k2q9x4m', server: 'https://ntfy.sh', wa: '', cap: 3 }, window.KV_REQ || {});
const F = { open: false, topic: '', goal: '', contact: '', busy: false, err: '', sent: null };
const list = () => { const a = A(); a.S.requests = Array.isArray(a.S.requests) ? a.S.requests : []; return a.S.requests; };
const openN = () => list().filter((r) => r.status === 'sent').length;
const rid = () => 'rq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function text(r) { return `Course request ${r.id}\nCourse: ${r.topic}\nGoal: ${r.goal || '(not given)'}\nFrom: ${r.contact || '(no contact)'}\nApp: Knowvia ${window.KV_VERSION || ''}`; }
function waLink(r) { return CFG.wa ? 'https://wa.me/' + CFG.wa.replace(/\D/g, '') + '?text=' + encodeURIComponent(text(r)) : ''; }

function cta(topic) {
  const a = A(), n = openN(), left = Math.max(0, CFG.cap - n);
  return `<section class="req-cta pn-strong"><div class="req-ic">${a.ic(a.I.spark, 22, 1.8)}</div><div class="grow"><b>Want it built by the Knowvia team?</b><p class="help">We write it with extra care and add it to the Course store. You get a notification here when it is ready. Usually a few days.</p>
    <div class="row-actions"><button class="btn sm primary" data-act="rq-open" data-topic="${a.esc(topic || '')}" ${left ? '' : 'disabled'}>Request this course</button></div>${left ? '' : '<p class="meta">You have the most open requests we can take at once. We will tell you when one is ready.</p>'}${mineHtml()}</div></section>`;
}
function mineHtml() {
  const a = A(), l = list().slice(-3).reverse(); if (!l.length) return '';
  return `<ul class="req-list">${l.map((r) => `<li><span>${a.esc(r.topic)}</span><em class="${r.status}">${r.status === 'ready' ? 'Ready in the store' : 'Requested'}</em></li>`).join('')}</ul>`;
}
function sheet() {
  const a = A(); if (!F.open) return '';
  if (F.sent) {
    const w = waLink(F.sent);
    return `<div class="ov" id="rq-ov"><div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"><h3>${F.sent.pushed ? 'Request sent' : 'Saved, but not sent yet'}</h3>
      <p class="help">${F.sent.pushed ? 'The team has been notified. We will build <b>' + a.esc(F.sent.topic) + '</b> and add it to the Course store. You will see a message here when it is ready.' : 'We could not reach the team from here. Your request is saved on this device. Connect to the internet and send it again' + (w ? ', or send it on WhatsApp now.' : '.')}</p>
      <div class="row-actions">${F.sent.pushed ? '' : `<button class="btn primary" data-act="rq-retry">Send again</button>${w ? `<a class="btn" href="${a.esc(w)}" target="_blank" rel="noopener">Send on WhatsApp</a>` : ''}`}<button class="btn" data-act="rq-close">Done</button></div></div></div>`;
  }
  return `<div class="ov" id="rq-ov"><div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true" aria-label="Request a course"><h3>Request a course</h3>
    <div class="field"><label for="rq-topic">Course</label><input id="rq-topic" data-in="rq-topic" value="${a.esc(F.topic)}" maxlength="90" placeholder="For example: Bookkeeping for small shops" autocomplete="off"></div>
    <div class="field"><label for="rq-goal">What do you want to be able to do after it? <span class="meta">(optional)</span></label><textarea id="rq-goal" data-in="rq-goal" rows="3" maxlength="400" placeholder="A few words are enough">${a.esc(F.goal)}</textarea></div>
    <div class="field"><label for="rq-contact">Your name or WhatsApp <span class="meta">(optional, so we can reach you)</span></label><input id="rq-contact" data-in="rq-contact" value="${a.esc(F.contact)}" maxlength="60" autocomplete="off"></div>
    ${F.err ? `<p class="meta" style="color:var(--bad,#c0392b)">${a.esc(F.err)}</p>` : ''}
    <div class="row-actions"><button class="btn" data-act="rq-close">Cancel</button><button class="btn primary" data-act="rq-send" ${F.busy ? 'disabled' : ''}>${F.busy ? 'Sending…' : 'Send request'}</button></div></div></div>`;
}
function draw() { const o = document.getElementById('rq-ov'); if (o) o.remove(); if (F.open) { const d = document.createElement('div'); d.innerHTML = sheet(); document.body.appendChild(d.firstElementChild); const i = document.getElementById('rq-topic') || document.getElementById('rq-goal'); if (i && !F.sent && !F.topic) i.focus(); } }

async function push(r) {
  try {
    const res = await fetch(CFG.server, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: CFG.topic, title: 'Course request: ' + r.topic, message: text(r), priority: 3, tags: ['books'] }) });
    return res.ok;
  } catch (e) { return false; }
}
async function send(r) { r.pushed = await push(r); r.status = 'sent'; A().save(); return r; }

REG.ins['rq-topic'] = (t) => { F.topic = t.value; }; REG.ins['rq-goal'] = (t) => { F.goal = t.value; }; REG.ins['rq-contact'] = (t) => { F.contact = t.value; };
REG.acts['rq-open'] = (t, d) => { F.open = true; F.sent = null; F.err = ''; F.topic = d.topic || F.topic || ''; draw(); };
REG.acts['rq-close'] = () => { F.open = false; F.topic = F.goal = ''; F.sent = null; draw(); A().renderScreen(); };
REG.acts['rq-send'] = async () => {
  if (F.busy) return;
  const topic = F.topic.trim(); if (topic.length < 3) { F.err = 'Tell us which course you would like.'; draw(); return; }
  if (openN() >= CFG.cap) { F.err = 'You have the most open requests we can take at once.'; draw(); return; }
  F.busy = true; F.err = ''; draw();
  const r = { id: rid(), topic, goal: F.goal.trim(), contact: F.contact.trim(), at: Date.now(), status: 'sent', pushed: false };
  list().push(r); await send(r);
  F.busy = false; F.sent = r; draw();
};
REG.acts['rq-retry'] = async () => { const r = F.sent; if (!r) return; F.busy = true; r.pushed = await push(r); A().save(); F.busy = false; draw(); };

/* when the store lists a course for one of my requests, tell me */
function sync(cat) {
  if (!cat || !cat.courses) return;
  list().forEach((r) => {
    if (r.status !== 'sent') return;
    const c = cat.courses.find((x) => x.status !== 'soon' && Array.isArray(x.requests) && x.requests.includes(r.id));
    if (c) { r.status = 'ready'; r.course = c.id; A().save(); A().toast('Your requested course is ready: ' + c.title); }
  });
}
window.KVRequest = { cta, sync, CFG, F, list };
const prev = REG.hooks.afterScreen;
REG.hooks.afterScreen = (n) => { if (prev) prev(n); };
})();
