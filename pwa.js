/* Install as an app (phone or laptop browser) and keep working offline. Not used inside the Windows launcher. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const inLauncher = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && location.port === '8765';
const web = /^https?:$/.test(location.protocol) && !inLauncher;
const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
const ua = navigator.userAgent || '';
const iOS = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua);
let deferred = null, installed = false, swState = web && 'serviceWorker' in navigator ? 'pending' : 'none';

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; refresh(); });
window.addEventListener('appinstalled', () => { installed = true; deferred = null; try { A().toast('Knowvia is installed'); } catch (x) {} refresh(); });
function refresh() { if (A() && A().route && A().route.name === 'me') A().renderScreen(); }

if (web && 'serviceWorker' in navigator && (location.hostname !== 'localhost' || /[?&]pwa=1/.test(location.search))) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const done = () => { swState = 'ready'; refresh(); };
      if (reg.active) done(); else navigator.serviceWorker.ready.then(done);
    }).catch(() => { swState = 'fail'; refresh(); });
  });
} else if (swState === 'pending') swState = 'none';

function body() {
  if (standalone() || installed) return '<p class="help"><b>Installed.</b> You are using Knowvia as an app. Your courses, progress and keys stay on this device.</p>';
  if (iOS) return '<p class="help">On iPhone: open this page in <b>Safari</b>, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</p>';
  if (deferred) return '<p class="help">Add Knowvia to your home screen. It opens full screen like a normal app and keeps working with no internet.</p><div class="row-actions"><button class="btn primary" data-act="pwa-install">Install Knowvia</button></div>';
  if (android) return '<p class="help">In Chrome, tap the <b>⋮</b> menu at the top right, then <b>Install app</b> (or <b>Add to Home screen</b>). If you do not see it, open this page in Chrome, not inside another app.</p>';
  return '<p class="help">In Chrome or Edge, look for the install icon at the right end of the address bar, or open the menu and choose <b>Install Knowvia</b>.</p>';
}
function offlineLine() {
  if (swState === 'ready') return 'Offline ready: lessons, quizzes and flashcards work with no internet on this device.';
  if (swState === 'fail') return 'Offline mode could not be switched on in this browser. The app still works while you are online.';
  if (swState === 'pending') return 'Getting ready to work offline…';
  return '';
}
const prevMe = REG.hooks.meCard;
REG.hooks.meCard = () => {
  const prev = prevMe ? prevMe() : '';
  if (!web) return prev;
  const off = offlineLine();
  return prev + `<section class="setting pn-strong"><h3>Install on this device</h3>${body()}${off ? `<p class="help">${A().esc(off)}</p>` : ''}
    <p class="help">Note: the offline tutor (Ollama) and live web research need the Windows app. In the installed phone app, Amani uses a cloud model when you have internet.</p></section>`;
};
REG.acts['pwa-install'] = () => {
  if (!deferred) return;
  deferred.prompt();
  deferred.userChoice.then((c) => { deferred = null; if (c && c.outcome === 'accepted') installed = true; refresh(); }).catch(() => {});
};
})();
