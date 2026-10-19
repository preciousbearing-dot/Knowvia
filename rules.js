/* Cloud and offline, told honestly. Offline is for chat only, uses the default Amani voice, and says so everywhere it matters. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp, esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isOff = () => A().S.tutor.brain === 'local';

/* a short, plain comparison: used in setup, in Me and in the model menu */
function compare() {
  return `<div class="cmp" role="group" aria-label="Cloud compared with offline">
    <div class="cmp-col"><b>Cloud</b><ul><li>Smartest answers</li><li>Fast</li><li>Needs internet</li><li>Your full Amani voice</li><li>Builds courses and lessons</li></ul></div>
    <div class="cmp-col"><b>Offline</b><ul><li>Private, stays on this device</li><li>Works with no internet</li><li>Slower, simpler answers</li><li>Default Amani voice</li><li>Chat only</li></ul></div></div>`;
}
REG.hooks.compare = compare;

/* the speed readout and the "check your internet" hint under the chat box */
REG.hooks.offlineLine = function () {
  const D = window.KVDevice, tps = D && D.state && D.state.tps, bc = A().bestCloud && A().bestCloud();
  const sp = tps ? ' About ' + Math.max(1, Math.round(tps * 0.75 * 10) / 10) + ' words a second here.' : '';
  return sp + (bc ? ' <button class="linkbtn" data-act="tocloud">Switch to cloud</button>' : ' Check your internet to use your full Amani.');
};

/* a soft pop-up when the chat moves offline, and a small welcome-back when it returns to the cloud */
REG.hooks.offlineOn = function () {
  const a = A(), S = a.S, now = Date.now(); if (document.getElementById('off-note')) return;
  if (S.offNoteAt && now - S.offNoteAt < 6 * 60000) { a.toast('Offline mode: default Amani voice, shorter answers'); return; }
  S.offNoteAt = now; a.save();
  const bc = a.bestCloud && a.bestCloud(), o = document.createElement('div'); o.id = 'off-note'; o.className = 'ov soft';
  o.innerHTML = `<div class="ov-card pn-strong kv-in" role="dialog" aria-modal="true"><h3>Amani is offline</h3>
    <p class="help">Offline models are small, so Amani answers more simply and a bit slower, in her <b>default voice</b>. Your style choices (${esc(personaName())}) are kept and come back as soon as you switch to a cloud model.</p>
    <p class="help"><b>Check your internet</b> to use your full Amani. Offline works for chat only: courses and lessons are written by a cloud model.</p>
    <div class="row-actions">${bc ? '<button class="btn primary" data-act="off-cloud">Switch to cloud</button>' : ''}<button class="btn ${bc ? '' : 'primary'}" data-act="off-ok">Got it</button></div></div>`;
  document.body.appendChild(o);
};
REG.hooks.offlineOff = function () { const a = A(); if (a.S.persona) a.toast('Your full Amani is back'); };
function personaName() { try { const p = A().S.persona || {}; const t = ({ padi: 'Padi', sabi: 'Sabi guy', homegirl: 'Homegirl', homeboy: 'Homeboy' })[p.role] || 'your character'; return t + (p.tone && p.tone !== 'plain' ? ', ' + p.tone : ''); } catch (e) { return 'your character'; } }
REG.acts['off-ok'] = () => { const o = document.getElementById('off-note'); if (o) o.remove(); };
REG.acts['off-cloud'] = () => { const o = document.getElementById('off-note'); if (o) o.remove(); const a = A(); const bc = a.bestCloud(); if (!bc) { a.go('me'); return; } a.S.tutor.brain = 'cloud'; a.S.tutor.provider = bc.p; a.save(); a.afterTutorChange(); a.toast('Amani is back on a cloud model'); };

window.KVRules = { compare, personaName };
})();
