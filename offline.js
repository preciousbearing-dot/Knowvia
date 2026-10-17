/* Offline tutor: device check, a ranked list of models with honest warnings, and a download that can pause, resume and survive a dropped connection. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;
const esc = (s) => A().esc(s);

/* From lightest to strongest. Sizes are what Ollama downloads, rounded. */
const CATALOG = [
  { id: 'qwen2.5:0.5b', name: 'Qwen 2.5 0.5B', b: 0.5, gb: 0.4, note: 'Tiny and very fast. Fine for simple questions. Expect mistakes on anything harder.' },
  { id: 'llama3.2:1b', name: 'Llama 3.2 1B', b: 1.2, gb: 1.3, note: 'Small and quick. Short answers and simple explanations.' },
  { id: 'qwen2.5:1.5b', name: 'Qwen 2.5 1.5B', b: 1.5, gb: 1.0, note: 'Small, with decent maths and reading for its size.' },
  { id: 'gemma2:2b', name: 'Gemma 2 2B', b: 2.6, gb: 1.6, note: 'Clear, friendly explanations for a small model.' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', b: 3.2, gb: 2.0, note: 'The best all-round small tutor. Good explanations and quizzes.' },
  { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', b: 3.1, gb: 1.9, note: 'Strong at maths, structure and following instructions.' },
  { id: 'phi3.5', name: 'Phi 3.5 Mini', b: 3.8, gb: 2.2, note: 'Good reasoning for its size. Writing is a little plain.' },
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', b: 7.6, gb: 4.7, note: 'Strong. Clearly better reasoning and longer explanations. Needs a capable computer.' },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', b: 8, gb: 4.9, note: 'Strong all-rounder with natural, helpful answers.' },
  { id: 'gemma2:9b', name: 'Gemma 2 9B', b: 9.2, gb: 5.4, note: 'Very good writing and explanations. Heavy for a laptop.' },
  { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', b: 14.8, gb: 9.0, note: 'Very strong. Wants 16 GB of memory and is slow without a graphics card.' },
  { id: 'qwen2.5:32b', name: 'Qwen 2.5 32B', b: 32.8, gb: 20, note: 'Near the best you can run at home. Needs a powerful computer.' },
  { id: 'llama3.3:70b', name: 'Llama 3.3 70B', b: 70.6, gb: 43, note: 'The strongest here. Needs a workstation-class computer.' }
];
const ST = { spec: null, installed: [], web: false, loading: false, open: false, pick: '', arm: '', shown: false, checking: false };
const minRam = (m) => Math.ceil(m.gb * 1.2 + 2);
const fmtGb = (g) => (g >= 10 ? Math.round(g) : Math.round(g * 10) / 10) + ' GB';

/* What the browser can tell us when there is no launcher. */
async function webSpecs() {
  const n = navigator; let free = null, gpu = '';
  try { if (n.storage && n.storage.estimate) { const e = await n.storage.estimate(); if (e.quota) free = Math.max(0, (e.quota - (e.usage || 0)) / 2 ** 30); } } catch (e) { /* ignore */ }
  try { const c = document.createElement('canvas'), g = c.getContext('webgl') || c.getContext('experimental-webgl'); const x = g && g.getExtension('WEBGL_debug_renderer_info'); if (x) gpu = String(g.getParameter(x.UNMASKED_RENDERER_WEBGL) || ''); } catch (e) { /* ignore */ }
  const dedicated = /nvidia|geforce|rtx|gtx|radeon rx|arc a/i.test(gpu);
  return { ram_gb: n.deviceMemory || null, ram_capped: !!n.deviceMemory && n.deviceMemory >= 8, cores: n.hardwareConcurrency || null, disk_free_gb: free === null ? null : Math.round(free * 10) / 10, gpu: { name: gpu, vram_gb: null, dedicated }, os: (n.userAgentData && n.userAgentData.platform) || n.platform || '' };
}
async function load(force) {
  const a = A();
  if (ST.loading || (ST.spec && !force)) return;
  ST.loading = true;
  try {
    if (a.DESK) { const r = await a.studio('specs'); if (r && r.ok) { ST.spec = r.specs; ST.installed = r.installed || []; ST.web = false; } }
    else { ST.spec = await webSpecs(); ST.web = true; }
  } catch (e) { ST.spec = ST.spec || null; }
  ST.loading = false;
  if (!ST.shown) { ST.shown = true; ST.checking = true; setTimeout(() => { ST.checking = false; paint(); }, 1500); }
  paint();
}

/* Will this model suit this computer? Honest answers, and every model is still listed. */
function fit(m, sp) {
  const ram = sp && sp.ram_gb, need = minRam(m), disk = m.gb + 1, cpuOnly = !(sp && sp.gpu && sp.gpu.dedicated);
  if (ram && !sp.ram_capped && ram < need) return { v: 'no', warn: 'Needs about ' + need + ' GB of memory. This computer has ' + fmtGb(ram) + '.' };
  if (ram && sp.ram_capped && need > ram) return { v: 'unsure', warn: 'Needs about ' + need + ' GB of memory. A browser only reports up to 8 GB, so check your real memory first.' };
  if (sp && sp.disk_free_gb != null && sp.disk_free_gb < disk && !ST.web) return { v: 'no', warn: 'Needs about ' + fmtGb(disk) + ' of free space. There is ' + fmtGb(sp.disk_free_gb) + '.' };
  if (ram && !sp.ram_capped && need > ram * 0.65) return { v: 'slow', warn: 'It will run, but slowly, and other programs may struggle while it does.' };
  if (cpuOnly && m.b > 5) return { v: 'slow', warn: 'Without a dedicated graphics card, this size answers slowly.' };
  return { v: 'ok', warn: '' };
}
function speedOf(m, sp) { const w = m.b / (sp && sp.gpu && sp.gpu.dedicated ? 3 : 1); return w <= 1.6 ? 'Fast' : w <= 4.5 ? 'Medium' : 'Slow'; }
function recommend(sp) {
  const cpuOnly = !(sp && sp.gpu && sp.gpu.dedicated), ram = (sp && sp.ram_gb) || 0; let best = null;
  CATALOG.forEach((m) => { const f = fit(m, sp); if (f.v !== 'ok') return; if (cpuOnly && m.b > 4 && !(ram >= 24 && !sp.ram_capped && m.b <= 8)) return; best = m; });
  return best || CATALOG.find((m) => fit(m, sp).v !== 'no') || CATALOG[0];
}

const STAGES = [['check', 'Check this computer'], ['install', 'Install Ollama'], ['start', 'Start Ollama'], ['pull', 'Download the model'], ['verify', 'Check the download']];
function stepper(j) {
  const a = A(), cur = STAGES.findIndex((s) => s[0] === j.stage);
  return `<ul class="of-stages">${STAGES.map(([id, nm], i) => { const st = i < cur ? 'done' : i === cur ? 'now' : 'wait'; return `<li class="${st}">${st === 'done' ? a.ic(a.I.check, 14, 2.8) : '<i></i>'}${esc(nm)}</li>`; }).join('')}</ul>`;
}
function eta(s) { s = +s || 0; if (!s) return ''; if (s < 90) return 'about ' + s + ' seconds left'; const m = Math.round(s / 60); return m < 90 ? 'about ' + m + ' minutes left' : 'about ' + (Math.round(m / 6) / 10) + ' hours left'; }
function specLine(sp) {
  if (!sp) return '';
  const bits = [];
  if (sp.ram_gb) bits.push((sp.ram_capped ? sp.ram_gb + '+ GB' : fmtGb(sp.ram_gb)) + ' memory');
  if (sp.cores) bits.push(sp.cores + ' processor cores');
  if (sp.disk_free_gb != null) bits.push(fmtGb(sp.disk_free_gb) + (ST.web ? ' storage available to this app' : ' free'));
  bits.push(sp.gpu && sp.gpu.dedicated ? 'graphics card: ' + (sp.gpu.name || 'yes') : 'no dedicated graphics card');
  return bits.join(' · ');
}
function checkStages() {
  const a = A(), items = ['Memory', 'Storage', 'Processor', 'Graphics'];
  return `<ul class="of-stages chk">${items.map((x, i) => `<li class="${i < 3 ? 'done' : 'now'}" style="animation-delay:${i * 0.3}s">${i < 3 ? a.ic(a.I.check, 14, 2.8) : '<i></i>'}${x}</li>`).join('')}</ul>`;
}
function badges(m, f, installed, rec) {
  return (rec ? '<span class="badge">Recommended</span>' : '') + (installed ? '<span class="badge ok">Installed</span>' : '') + (f.v === 'no' ? '<span class="badge bad">Too heavy</span>' : f.v === 'slow' ? '<span class="badge warn">Slow here</span>' : f.v === 'unsure' ? '<span class="badge warn">Check memory</span>' : '');
}
function rows(sp, rec, sel, st) {
  return CATALOG.map((m) => {
    const f = fit(m, sp), inst = ST.installed.includes(m.id) || (st && (st.models || []).includes(m.id)), on = sel === m.id;
    return `<button class="mrow of-row ${on ? 'on' : ''} ${f.v}" data-act="of-pick" data-v="${esc(m.id)}" role="radio" aria-checked="${on}"><span class="rad"></span><span class="grow"><b>${esc(m.name)}</b>
      <span class="s">${fmtGb(m.gb)} download · needs about ${minRam(m)} GB memory · speed: ${speedOf(m, sp)}</span><span class="s">${esc(m.note)}</span>${f.warn ? `<span class="s of-warn">${esc(f.warn)}</span>` : ''}</span>${badges(m, f, inst, rec && rec.id === m.id)}</button>`;
  }).join('');
}

/* The card. st is the launcher status, or null in a browser. */
function card(st) {
  const a = A(), j = (st && st.job) || {};
  if (!ST.spec && !ST.loading) setTimeout(() => load(), 0);
  if (st && j.running) {
    const pull = j.stage === 'pull', right = pull && !j.waiting && j.speed ? `${j.speed} MB/s${j.eta ? ' · ' + eta(j.eta) : ''}` : '';
    return `<div class="ofcard"><h3>Setting up your offline tutor</h3>${stepper(j)}<p class="help" role="status">${esc(j.msg || 'Working...')}</p>
      <div class="bar" role="progressbar" aria-valuenow="${j.pct || 0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${j.pct || 0}%"></i></div>
      <p class="meta of-meta"><span>${j.pct || 0}%</span><span>${esc(right)}</span></p>
      ${j.waiting ? '<p class="help of-wait">No internet right now. The download picks up by itself the moment you are back online. What was downloaded is kept.</p>' : ''}
      ${pull ? '<div class="row-actions"><button class="btn" data-act="of-pause">Pause</button><button class="btn" data-act="of-cancel">Cancel</button></div>' : '<p class="help">This part cannot be paused. It only takes a moment.</p>'}</div>`;
  }
  if (st && j.paused) return `<div class="ofcard"><h3>Download paused</h3><p class="help">Paused at <b>${j.pct || 0}%</b> of ${esc(j.model || 'the model')}. What was downloaded is kept, so resuming continues from here.</p>
    <div class="bar"><i style="width:${j.pct || 0}%"></i></div><div class="row-actions"><button class="btn primary" data-act="of-get" data-v="${esc(j.model || '')}">Resume the download</button><button class="btn" data-act="of-cancel">Cancel it</button></div></div>`;
  if (st && j.error) return `<div class="ofcard"><h3>Setup stopped</h3><p class="help">${esc(j.error)}</p><div class="row-actions"><button class="btn primary" data-act="of-get" data-v="${esc(j.model || ST.pick || '')}">Try again</button><button class="btn" data-act="of-dismiss">Choose another model</button></div></div>`;
  const sp = ST.spec, rec = sp ? recommend(sp) : null, sel = ST.pick || (rec && rec.id) || '', m = CATALOG.find((x) => x.id === sel);
  let head = '';
  if (!sp) head = `<h3>Checking this device...</h3><p class="help">Looking at memory, storage, processor and graphics.</p>`;
  else if (ST.checking) head = `<h3>Checking this device...</h3>${checkStages()}`;
  else head = `<h3>${st && st.ready ? 'Your offline tutor is ready' : ST.web ? 'Can this device run an offline tutor?' : 'Set up your offline tutor'}</h3><p class="help of-spec">${esc(specLine(sp))}</p>`;
  let body = '';
  if (sp && !ST.checking) {
    const f = m ? fit(m, sp) : { v: 'ok' }, inst = m && (ST.installed.includes(m.id) || (st && (st.models || []).includes(m.id)));
    const verdict = ST.web ? (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? `<p class="help">Offline models for phones need a built-in engine, which is the next big update to this Android app. For now Amani uses a cloud model when you have internet. The list below shows what a phone like this could handle.</p>` : `<p class="help">Offline models run inside the Knowvia desktop app on a laptop or computer. They cannot run in a browser or on a phone yet. A phone version is planned. The list below shows what a computer like this could handle.</p>`) :
      `<p class="help">${st && st.ready ? 'Add another model, or switch between the ones you have.' : (rec ? '<b>' + esc(rec.name) + '</b> is the strongest model that suits this computer, so it is picked for you.' : '')}</p>`;
    const list = ST.open ? `<p class="sub-h">From lightest to strongest</p><div class="mlist" role="radiogroup">${rows(sp, rec, sel, st)}</div>` : '';
    let act = '';
    if (!ST.web && m) {
      if (inst) act = `<button class="btn primary" data-act="of-use" data-v="${esc(m.id)}">Use ${esc(m.name)}</button>${(st && (st.models || []).length > 1) || ST.installed.length > 1 ? `<button class="btn ${ST.arm === m.id ? 'danger' : ''}" data-act="of-del" data-v="${esc(m.id)}">${ST.arm === m.id ? 'Tap again to remove' : 'Remove it'}</button>` : ''}`;
      else if (f.v === 'no') act = `<button class="btn" data-act="of-get" data-v="${esc(m.id)}">Download anyway</button><span class="help of-act-note">${esc(f.warn)}</span>`;
      else act = `<button class="btn primary" data-act="of-get" data-v="${esc(m.id)}">${esc(st && !st.installed ? 'Install and download ' : 'Download ')}${esc(m.name)} (${fmtGb(m.gb)})</button>`;
      if (f.v === 'slow' && !inst) act += `<span class="help of-act-note">${esc(f.warn)}</span>`;
    }
    const eng = st && !st.installed && !ST.web ? '<p class="help">Setup also installs Ollama first, the engine that runs the model (about 1 GB, once).</p>' : st && st.installed && !st.running ? '<p class="help">Ollama is installed but not running. Setup starts it for you.</p>' : '';
    body = verdict + eng + `<div class="row-actions">${act}<button class="btn" data-act="of-more">${ST.open ? 'Hide the list' : 'See all ' + CATALOG.length + ' models'}</button></div>` + list + (!ST.web ? '<p class="help">The first download needs internet, once. After that the tutor works offline. If the connection drops, the download waits and resumes by itself.</p>' : '');
  }
  return `<div class="ofcard">${head}${body}</div>`;
}
function paint() { const a = A(); if (a.DESK) { if (a.renderSetup) a.renderSetup(); } else { const e = document.getElementById('of-web-slot'); if (e) e.innerHTML = card(null); } }

const R = REG.acts;
R['of-pick'] = (t, d) => { ST.pick = d.v; ST.arm = ''; paint(); };
R['of-more'] = () => { ST.open = !ST.open; paint(); };
R['of-dismiss'] = () => { const a = A(); a.studio('cancel', { method: 'POST', body: '{}' }).then(() => { if (a.refreshDesk) a.refreshDesk(); }).catch(() => {}); };
R['of-get'] = (t, d) => { const a = A(), model = d.v || ST.pick; if (!model) return; ST.arm = ''; a.studio('setup', { method: 'POST', body: JSON.stringify({ model }) }).then(() => { ST.spec = null; if (a.refreshDesk) a.refreshDesk(); }).catch(() => a.toast('Could not start the download')); };
R['of-pause'] = () => { const a = A(); a.studio('pause', { method: 'POST', body: '{}' }).then(() => { if (a.refreshDesk) a.refreshDesk(); }); };
R['of-cancel'] = () => { const a = A(); a.studio('cancel', { method: 'POST', body: '{}' }).then(() => { ST.spec = null; if (a.refreshDesk) a.refreshDesk(); }); };
R['of-use'] = (t, d) => { const a = A(); a.S.tutor.model = d.v; a.S.tutor.brain = 'local'; a.save(); a.toast('Amani now uses ' + d.v + ' offline'); if (a.afterTutorChange) a.afterTutorChange(); paint(); };
R['of-del'] = (t, d) => {
  const a = A();
  if (ST.arm !== d.v) { ST.arm = d.v; paint(); setTimeout(() => { if (ST.arm === d.v) { ST.arm = ''; paint(); } }, 4000); return; }
  ST.arm = ''; a.studio('model/delete', { method: 'POST', body: JSON.stringify({ model: d.v }) }).then((r) => { ST.spec = null; ST.installed = (r && r.models) || []; a.toast('Removed ' + d.v); if (a.refreshDesk) a.refreshDesk(); });
};
window.KVOffline = { card, load, paint, fit, recommend, CATALOG, state: ST, minRam };
})();
