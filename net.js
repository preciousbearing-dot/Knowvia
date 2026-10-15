/* Connection watcher. When Amani is on a cloud model and the internet drops, retry quietly, then offer the offline tutor. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const st = { down: false, retrying: false, snooze: 0, card: null, lastOk: Date.now() };
const RETRY = [2000, 4000, 6000, 8000]; /* quiet retries before we bother the learner */

async function probe() {
  if (navigator.onLine === false) return false;
  const targets = ['https://www.gstatic.com/generate_204', 'https://www.cloudflare.com/cdn-cgi/trace'];
  for (const u of targets) {
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 5000);
      await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ac.signal });
      clearTimeout(tm); return true;
    } catch (e) { /* try the next one */ }
  }
  return false;
}
const cloudMode = () => { const a = A(); return a && a.S.onboarded && a.S.tutor.brain === 'cloud'; };

function clearNetErrors() {
  const a = A(); let n = 0;
  Object.keys(a.S.chats || {}).forEach((k) => { const l = a.S.chats[k]; for (let i = l.length - 1; i >= 0; i--) if (l[i].net && (l[i].err || l[i].failed)) { l.splice(i, 1); n++; } });
  if (n) { a.save(); a.renderTutor(); }
  return n;
}
function closeCard() { if (st.card) { st.card.classList.add('out'); const c = st.card; setTimeout(() => c.remove(), 350); st.card = null; } }
function showCard(html, id) {
  closeCard();
  const el = document.createElement('div'); el.className = 'netcard pn-strong'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.dataset.kind = id;
  el.innerHTML = html; document.body.appendChild(el); st.card = el;
  return el;
}
function offlineCard() {
  const a = A(), loc = a.localModelList();
  const ic = a.ic(a.I.wifi, 22, 1.8);
  if (loc.length) {
    showCard(`<div class="nc-ic off">${ic}</div><div class="nc-t"><b>You seem to be offline</b><p>Amani cannot reach the cloud right now. Switch to your offline tutor (${a.esc(loc[0])}) and keep studying?</p>
      <div class="row-actions"><button class="btn primary sm" data-act="net-switch">Switch to offline tutor</button><button class="btn sm" data-act="net-wait">Keep waiting</button></div></div>`, 'off');
  } else {
    showCard(`<div class="nc-ic off">${ic}</div><div class="nc-t"><b>You seem to be offline</b><p>Amani needs the internet for this model. Your lessons and flashcards still work. Set up the offline tutor while you are online, so Amani never goes quiet.</p>
      <div class="row-actions"><button class="btn primary sm" data-act="net-wait">Got it</button></div></div>`, 'off');
  }
}
function backCard() {
  const a = A(), pv = a.S.tutor.prev; if (!pv) return;
  const name = (a.PROV[pv.provider] || {}).name || 'the cloud';
  showCard(`<div class="nc-ic on">${a.ic(a.I.wifi, 22, 1.8)}</div><div class="nc-t"><b>You are back online</b><p>Return Amani to ${a.esc(pv.model || 'your cloud model')} (${a.esc(name)})? The offline tutor is still available any time.</p>
    <div class="row-actions"><button class="btn primary sm" data-act="net-back">Switch back</button><button class="btn sm" data-act="net-stay">Stay offline</button></div></div>`, 'on');
  setTimeout(() => { if (st.card && st.card.dataset.kind === 'on') closeCard(); }, 20000);
}
async function retryLoop() {
  if (st.retrying || !cloudMode()) return;
  st.retrying = true;
  for (let i = 0; i < RETRY.length; i++) {
    await new Promise((r) => setTimeout(r, RETRY[i]));
    if (await probe()) { st.retrying = false; netOk(); return; }
  }
  st.retrying = false; st.down = true;
  if (Date.now() >= st.snooze && cloudMode()) offlineCard();
}
function netFail() { if (cloudMode() && !st.down) retryLoop(); else if (cloudMode() && st.down && Date.now() >= st.snooze && !st.card) offlineCard(); }
function netOk() {
  st.lastOk = Date.now();
  const was = st.down; st.down = false;
  if (st.card && st.card.dataset.kind === 'off') closeCard();
  const n = clearNetErrors();
  if (was || n) { if (A().S.tutor.prev && A().S.tutor.brain === 'local') backCard(); else if (n) A().toast('Back online. You can ask again.'); }
}
REG.hooks.netFail = netFail; REG.hooks.netOk = netOk;

REG.acts['net-switch'] = () => { const a = A(); a.switchToOffline(true); closeCard(); a.clearErrors(a.chat()); a.renderTutor(); a.toast('Amani now uses the offline tutor'); };
REG.acts['net-wait'] = () => { st.snooze = Date.now() + 5 * 60000; closeCard(); };
REG.acts['net-back'] = () => { const a = A(), pv = a.S.tutor.prev; if (pv) { a.S.tutor.brain = 'cloud'; a.S.tutor.provider = pv.provider; a.cloudCfg(pv.provider).model = pv.model || a.cloudCfg(pv.provider).model; a.S.tutor.prev = null; a.save(); a.afterTutorChange(); a.toast('Amani is back on ' + (pv.model || 'the cloud')); } closeCard(); };
REG.acts['net-stay'] = () => { A().S.tutor.prev = null; A().save(); closeCard(); };

REG.ready.push(() => {
  window.addEventListener('offline', () => { setTimeout(() => { if (navigator.onLine === false) netFail(); }, 2500); });
  window.addEventListener('online', async () => { if (await probe()) netOk(); });
  /* a light check every 40 seconds while a cloud model is in use */
  setInterval(async () => { if (document.hidden || !cloudMode()) return; if (await probe()) { if (st.down) netOk(); } else netFail(); }, 40000);
});
window.KVNet = { probe, state: st, offlineCard, backCard };
})();
