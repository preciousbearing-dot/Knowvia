/* The Knowvia Director. Decides what a course needs before it is built.
   Rules first (instant), the connected AI second (for topics the rules do not know), and a safe standard course if anything fails.
   The AI only proposes. This code checks every answer before it is used. */
(function () {
'use strict';
const A = () => window.KVApp;
const CKEY = 'kv.dir.cache', DAY = 86400000;
const clip = (t, n) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9+# ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- Questions that many software topics share ---------- */
const o = (v, t, d, re) => ({ v, t, d, re });
const Q_DEVICE = () => ({ id: 'device', key: 'device', q: 'What will you practise on?', why: 'The phone and computer versions often work differently.', kind: 'single', rec: 'phone',
  options: [o('phone', 'My phone', 'Steps for the phone app'), o('pc', 'A computer', 'Steps for the desktop version'), o('both', 'Both', 'Mostly the same, with notes where they differ')], line: 'Device: {a}. Give every step for that device.' });
const goal = (opts, rec) => ({ id: 'goal', key: 'goal', q: 'What do you want this for?', why: 'It decides the examples and the practice tasks.', kind: 'single', rec: rec || opts[0][0],
  options: opts.map((x) => o(x[0], x[1], x[2])), line: 'Goal: {a}. Choose examples and practice tasks that serve this goal.' });
const toolQ = (q, opts, rec, why) => ({ id: 'tool', key: 'tool', q, why: why || 'The course teaches one tool properly instead of guessing.', kind: 'single', rec, options: opts,
  line: 'Tool to teach: {a}. Teach every step in this tool only, using its real menus, buttons and names. Mention other tools only to say when someone might switch.' });
const TIME = () => ({ id: 'time', key: 'time', q: 'How much time can you give each day?', why: 'It shapes how big each lesson feels.', kind: 'single', rec: '20',
  options: [o('10', 'About 10 minutes', 'Very short lessons'), o('20', 'About 20 minutes', 'A comfortable daily lesson'), o('45', '45 minutes or more', 'Fuller lessons with practice')], line: 'Time: {a} a day. Keep each lesson to a size that fits.' });

/* ---------- Topics where the course depends on a personal choice ---------- */
const RULES = [
  { id: 'video', re: /\b(video edit|video editing|editing videos?|video production|filmmaking|reels? edit|short video)/, name: 'video editing',
    quality: ['Real steps in one editor, with its actual menus', 'Practice tasks that produce a finished video', 'Export settings for the platform the learner posts on'],
    std: 'Teach the principles that work in any editor (cuts, pacing, audio, titles, colour, export). Use the most popular free editor for step-by-step examples and say so once. Add one short lesson comparing the main editors.',
    tool: toolQ('Which video editor do you want to learn?', [
      o('CapCut', 'CapCut', 'Free to start. Phone and computer. The easiest way to make short videos.', /capcut/), o('DaVinci Resolve', 'DaVinci Resolve', 'Free. Computer. Professional editing and colour.', /davinci|resolve/),
      o('Adobe Premiere Pro', 'Adobe Premiere Pro', 'Paid. Computer. A common choice for jobs.', /premiere/), o('Filmora', 'Filmora', 'Easy and polished. Phone and computer.', /filmora/),
      o('InShot', 'InShot', 'Free to start. Phone only. Very simple.', /inshot/), o('VN Editor', 'VN Editor', 'Free. Phone and computer. Clean timeline.', /\bvn\b/)], 'CapCut'),
    more: [Q_DEVICE(), goal([['social', 'Videos for social media', 'Reels, TikTok, YouTube Shorts'], ['income', 'Earn as an editor', 'Freelance or a job'], ['personal', 'Personal videos', 'Family, events, memories']], 'social')] },
  { id: 'photo', re: /\b(photo edit|photo editing|photoshop|lightroom|picture edit|retouch)/, name: 'photo editing',
    quality: ['Real steps in one app', 'Before and after practice on a photo'], std: 'Teach the ideas that work in any app (crop, light, colour, retouching, export) and use the most popular free app for examples, saying so once.',
    tool: toolQ('Which photo editor do you want to learn?', [o('Adobe Lightroom', 'Lightroom', 'Great for colour and light. Phone and computer.', /lightroom/), o('Adobe Photoshop', 'Photoshop', 'The full editor. Computer.', /photoshop/), o('Snapseed', 'Snapseed', 'Free. Phone. Easy and powerful.', /snapseed/), o('Canva', 'Canva', 'Free to start. Quick edits and designs.', /canva/), o('GIMP', 'GIMP', 'Free. Computer. A free Photoshop alternative.', /gimp/)], 'Snapseed'),
    more: [Q_DEVICE()] },
  { id: 'design', re: /\b(graphic design|logo design|poster design|canva|brand design|flyer design)/, name: 'graphic design',
    quality: ['Real steps in one design app', 'Projects such as a logo, a poster and a social post'], std: 'Teach the design principles (layout, type, colour, hierarchy) first, then use the most popular free design app for practice and say so once.',
    tool: toolQ('Which design app do you want to learn?', [o('Canva', 'Canva', 'Free to start. Phone and computer. The easiest start.', /canva/), o('Adobe Photoshop', 'Photoshop', 'Powerful. Computer.', /photoshop/), o('Adobe Illustrator', 'Illustrator', 'Logos and vector art. Computer.', /illustrator/), o('Figma', 'Figma', 'Free to start. Interface and brand design.', /figma/), o('CorelDRAW', 'CorelDRAW', 'Popular for print work. Computer.', /corel/)], 'Canva'),
    more: [Q_DEVICE(), goal([['business', 'For a business or brand', 'Logos, flyers, social posts'], ['income', 'Earn as a designer', 'Freelance or a job'], ['hobby', 'For fun', 'Personal projects']], 'business')] },
  { id: 'uiux', re: /\b(ui ?\/? ?ux|ux design|ui design|product design|figma)/, name: 'UI and UX design',
    quality: ['Design thinking explained simply', 'A small project from idea to screens'], std: 'Teach the UX process and UI principles, and use the most popular free design tool for the practice screens, saying so once.',
    tool: toolQ('Which design tool do you want to use?', [o('Figma', 'Figma', 'Free to start. The most used tool for interface design.', /figma/), o('Adobe XD', 'Adobe XD', 'Older tool, still in some teams.', /\bxd\b/), o('Penpot', 'Penpot', 'Free and open source.', /penpot/)], 'Figma'),
    more: [goal([['job', 'Get a design job', 'A portfolio with real projects'], ['freelance', 'Freelance', 'Client work'], ['own', 'My own app or product', 'Design for something I am building']], 'job')] },
  { id: 'spreadsheet', re: /\b(excel|spreadsheet|google sheets|data entry)\b/, name: 'spreadsheets',
    quality: ['Real formulas with working examples', 'Practice files the learner builds'], std: 'Teach spreadsheet thinking (cells, formulas, tables, charts, cleaning data) with Microsoft Excel and a note where Google Sheets differs.',
    tool: toolQ('Which spreadsheet app do you use?', [o('Microsoft Excel', 'Microsoft Excel', 'The most used in offices and jobs.', /excel/), o('Google Sheets', 'Google Sheets', 'Free. Works in a browser and on a phone.', /sheets/)], 'Microsoft Excel'),
    more: [Q_DEVICE(), goal([['work', 'For work or a job', 'Reports, budgets, data'], ['business', 'For my own business', 'Sales, stock, accounts'], ['study', 'For school', 'Coursework and projects']], 'work')] },
  { id: 'data', re: /\b(data analysis|data analytics|data analyst|power bi|business intelligence|sql)\b/, name: 'data analysis',
    quality: ['One tool taught properly', 'Practice on real-looking datasets', 'Charts and a final mini report'], std: 'Teach analysis thinking (questions, cleaning, summaries, charts) using Microsoft Excel for the practice, with a short note on other tools.',
    tool: toolQ('Which tool should the course use?', [o('Microsoft Excel', 'Excel', 'The easiest way in. Used everywhere.', /excel/), o('Python', 'Python', 'Powerful and free. Needs a computer.', /python/), o('SQL', 'SQL', 'For working with databases.', /\bsql\b/), o('Power BI', 'Power BI', 'Dashboards and reports. Computer.', /power ?bi/), o('Google Sheets', 'Google Sheets', 'Free. Works on a phone.', /sheets/)], 'Microsoft Excel'),
    more: [goal([['job', 'Get a data job', 'Portfolio projects'], ['work', 'Use it in my current work', 'Reports and decisions'], ['study', 'For study', 'A course or exam']], 'job')] },
  { id: 'code', re: /\b(learn (to )?cod(e|ing)|programming|coding|computer programming|software development)\b/, name: 'programming', named: /\b(python|javascript|java|c\+\+|c#|php|html|css|react|node|swift|kotlin|rust|go|typescript|sql)\b/,
    quality: ['One language taught properly', 'Small programs the learner writes and runs', 'Reading error messages'], std: 'Teach the core ideas of programming (variables, decisions, loops, functions, data) using Python, and say why Python was used.',
    tool: toolQ('Which language do you want to learn first?', [o('Python', 'Python', 'The friendliest start. Used in data, automation and AI.', /python/), o('JavaScript', 'JavaScript', 'The language of websites and apps.', /javascript/), o('HTML and CSS', 'HTML and CSS', 'Build web pages. No coding logic yet.', /html|css/), o('Java', 'Java', 'Android apps and big systems.', /\bjava\b/), o('PHP', 'PHP', 'Websites and WordPress.', /php/)], 'Python'),
    more: [Q_DEVICE(), goal([['job', 'Get a tech job', 'Skills employers ask for'], ['build', 'Build my own app or site', 'A project I care about'], ['study', 'For school', 'A course or exam']], 'build')] },
  { id: 'web', re: /\b(web ?(site)? ?(development|design)|build (a )?websites?|wordpress)\b/, name: 'web development',
    quality: ['A real site built step by step', 'Publishing it online for free'], std: 'Teach how websites work and build a simple site with HTML, CSS and a little JavaScript, then publish it free.',
    tool: toolQ('How do you want to build websites?', [o('HTML, CSS and JavaScript', 'Code it myself', 'HTML, CSS and JavaScript. The strongest foundation.', /html|css|javascript/), o('WordPress', 'WordPress', 'Build sites without much code. Common for client work.', /wordpress/), o('No-code builder', 'A no-code builder', 'Drag and drop tools such as Wix or Framer.', /wix|framer|webflow/)], 'HTML, CSS and JavaScript'),
    more: [Q_DEVICE(), goal([['income', 'Earn building sites for others', 'Client projects'], ['own', 'My own site or business', 'One real site'], ['learn', 'To learn to code', 'Understand how it works']], 'income')] },
  { id: 'music', re: /\b(music production|beat ?making|make beats|produce music|audio production|mixing and mastering)\b/, name: 'music production',
    quality: ['One music app taught properly', 'A finished beat or song'], std: 'Teach the ideas that work in any music app (rhythm, melody, arrangement, mixing) with a free app for the practice, saying so once.',
    tool: toolQ('Which music app do you want to use?', [o('FL Studio', 'FL Studio', 'Very popular for beats. Computer.', /fl studio/), o('BandLab', 'BandLab', 'Free. Phone and browser.', /bandlab/), o('GarageBand', 'GarageBand', 'Free on Apple devices.', /garageband/), o('Ableton Live', 'Ableton Live', 'Professional. Computer.', /ableton/), o('Cakewalk', 'Cakewalk', 'Free. Windows computer.', /cakewalk/)], 'BandLab'),
    more: [Q_DEVICE()] },
  { id: 'three', re: /\b(3d|blender|animation|animate|motion graphics)\b/, name: '3D and animation',
    quality: ['One program taught properly', 'A finished small project'], std: 'Teach the principles (shape, motion, timing, light) with the most popular free program for the practice, saying so once.',
    tool: toolQ('Which program do you want to learn?', [o('Blender', 'Blender', 'Free. Computer. 3D modelling and animation.', /blender/), o('After Effects', 'After Effects', 'Paid. Computer. Motion graphics.', /after effects/), o('CapCut', 'CapCut', 'Free to start. Simple animations and effects.', /capcut/), o('Canva', 'Canva', 'Simple animated designs. Free to start.', /canva/)], 'Blender'),
    more: [Q_DEVICE()] },
  { id: 'auto', re: /\b(ai automation|automation|workflow automation|no.?code automation|zapier|n8n|make\.com)\b/, name: 'automation',
    quality: ['One automation tool taught properly', 'Working automations the learner builds'], std: 'Teach automation thinking (triggers, actions, data) and build examples in n8n, saying so once.',
    tool: toolQ('Which automation tool do you want to learn?', [o('n8n', 'n8n', 'Free to run yourself. Very powerful.', /n8n/), o('Make', 'Make', 'Visual, with a free plan.', /\bmake\b/), o('Zapier', 'Zapier', 'Easiest. Free plan is small.', /zapier/)], 'n8n'),
    more: [goal([['income', 'Earn by building automations for others', 'Client workflows'], ['own', 'Automate my own work', 'Save my own time'], ['learn', 'To learn how it works', 'Understand the ideas']], 'income')] }
];

/* ---------- Learner profile: asked once, reused ---------- */
function profile() { const S = A() && A().S; return (S && S.learner) || {}; }
function remember(spec, answers) {
  const a = A(); if (!a || !a.S) return; const L = a.S.learner || (a.S.learner = {});
  (spec.questions || []).forEach((q) => { if (['device', 'time', 'budget'].includes(q.key) && answers[q.id] && answers[q.id] !== '__auto') L[q.key] = answers[q.id]; });
  a.save();
}

/* ---------- A spec is the Director's decision for one topic ---------- */
function fromRule(r, topic) {
  const named = r.tool.options.find((x) => x.re && x.re.test(norm(topic))), qs = [];
  const toolQuestion = r.tool; const already = named || (r.named && r.named.test(norm(topic)) ? { t: (norm(topic).match(r.named) || [''])[0] } : null);
  if (!already) qs.push(clone(toolQuestion));
  r.more.forEach((q) => qs.push(clone(q)));
  const pf = profile(); qs.forEach((q) => { if (pf[q.key] && q.options.some((x) => x.v === pf[q.key])) q.saved = pf[q.key]; });
  return { source: 'rule', needs: qs.length > 0, why: 'There are several popular ways to learn ' + r.name + ', and the steps change with the tool you use.', type: 'software', questions: qs.slice(0, 4), standard: r.std, quality: r.quality,
    preset: already ? { tool: already.t || already.v } : null, toolOptions: r.tool.options.map((x) => x.t), ruleId: r.id };
}
const clone = (q) => JSON.parse(JSON.stringify(q, (k, v) => (v instanceof RegExp ? undefined : v)));
function ruleFor(topic) { const n = norm(topic); return RULES.find((r) => r.re.test(n)) || null; }
function standardSpec(topic) {
  const r = ruleFor(topic);
  return { source: 'fallback', needs: false, why: '', type: '', questions: [], standard: r ? r.std : 'Build a standard course that suits anyone starting out. Do not assume a tool, device or goal.', quality: r ? r.quality : [] };
}

/* ---------- Check what the AI sends back. Nothing unchecked is used. ---------- */
function validate(raw) {
  let j = raw; if (typeof raw === 'string') { const s = raw.replace(/```json|```/gi, ''), i = s.indexOf('{'), k = s.lastIndexOf('}'); if (i < 0 || k < i) return null; try { j = JSON.parse(s.slice(i, k + 1).replace(/,\s*([}\]])/g, '$1')); } catch (e) { return null; } }
  if (!j || typeof j !== 'object') return null;
  const used = new Set(), qs = [];
  (Array.isArray(j.questions) ? j.questions : []).slice(0, 5).forEach((q, n) => {
    if (!q || !q.q) return;
    let id = clip(q.id || q.key || 'q' + n, 20).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'q' + n; while (used.has(id)) id += n; used.add(id);
    const kind = ['single', 'text'].includes(q.kind) ? q.kind : 'single';
    const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((x) => (typeof x === 'string' ? { v: clip(x, 40), t: clip(x, 40), d: '' } : { v: clip(x.v || x.t, 40), t: clip(x.t || x.v, 40), d: clip(x.d, 110) })).filter((x) => x.t);
    if (kind === 'single' && opts.length < 2) return;
    const rec = opts.some((x) => x.v === q.rec) ? q.rec : (opts[0] ? opts[0].v : '');
    qs.push({ id, key: clip(q.key || id, 20).toLowerCase().replace(/[^a-z0-9_]/g, '') || id, q: clip(q.q, 120), why: clip(q.why, 140), kind, options: opts, rec, line: clip(q.line, 220) });
  });
  const needs = !!j.needsInterview && qs.length > 0;
  return { source: 'ai', needs, why: clip(j.why, 200), type: clip(j.type, 20), questions: needs ? qs : [], standard: clip(j.standard, 300) || 'Build a standard course that suits anyone starting out.', quality: (Array.isArray(j.quality) ? j.quality : []).slice(0, 5).map((x) => clip(x, 120)) };
}

function cacheGet(topic) { try { const c = JSON.parse(localStorage.getItem(CKEY) || '{}'), e = c[norm(topic)]; if (e && Date.now() - e.t < 30 * DAY) return e.spec; } catch (x) { /* ignore */ } return null; }
function cachePut(topic, spec) { try { const c = JSON.parse(localStorage.getItem(CKEY) || '{}'); c[norm(topic)] = { t: Date.now(), spec }; const keys = Object.keys(c); if (keys.length > 40) keys.sort((x, y) => c[x].t - c[y].t).slice(0, keys.length - 40).forEach((k) => delete c[k]); localStorage.setItem(CKEY, JSON.stringify(c)); } catch (x) { /* ignore */ } }

/* ---------- The analyst: one quick call for topics the rules do not know ---------- */
async function analyze(topic, level, opt) {
  opt = opt || {};
  const r = ruleFor(topic); if (r) return fromRule(r, topic);
  const hit = cacheGet(topic); if (hit) return hit;
  const B = window.KVBuild; if (!B || !B.quick) return standardSpec(topic);
  let found = '';
  const K = window.KVResearch;
  if (opt.research && K && K.status() === 'ready') {
    try { const s = await K.search(topic + ' best tools or approaches for beginners ' + new Date().getFullYear(), { max: 5 }); if (s && s.ok) { found = (s.results || []).slice(0, 5).map((x) => '- ' + clip(x.title, 80) + ': ' + clip(x.content, 220)).join('\n'); opt.credits = 1; } } catch (e) { /* the analyst works without it */ }
  }
  const sys = 'You are the Director of Knowvia, an app that builds study courses. Return ONLY valid JSON, with no text before or after it.';
  const usr = `Topic: "${clip(topic, 90)}". Learner level: ${level}. The learner studies alone on a phone or laptop, possibly in Nigeria with limited data.\n` +
    `Decide what is needed to build a course that truly teaches this.\n` +
    `1. Does the course depend on a personal choice that changes its content a lot, such as a specific tool, software, programming language, platform, exam board or goal? If the topic is the same for everyone (for example photosynthesis or basic algebra), set needsInterview to false and questions to [].\n` +
    `2. If yes, write 1 to 4 short questions in plain words. Each has 2 to 5 options with a one-line description. Recommend one option: the most common, free, beginner-friendly one. The first question is the most important.\n` +
    `3. "line" is a short instruction for the course writers with {a} replaced by the learner's answer.\n` +
    `4. "standard" is one sentence describing the course to build if the learner skips the questions, so it suits anyone.\n` +
    `5. "quality" lists 3 to 5 things this course needs to be useful.\n` + (found ? `\nSearch results (use only to name current options):\n${found}\n` : '') +
    `\nReturn JSON: {"needsInterview":true,"why":"one sentence","type":"software|concept|maths|craft|language|technical|business|creative|life","questions":[{"id":"tool","key":"tool","q":"...","why":"...","kind":"single","options":[{"v":"id","t":"Name","d":"one line"}],"rec":"id","line":"Tool to teach: {a}. ..."}],"standard":"...","quality":["..."]}`;
  try {
    const out = await B.quick([{ role: 'system', content: sys }, { role: 'user', content: usr }], { max: 1500, temp: 0.3, timeout: 30000 });
    const spec = validate(out); if (!spec) return standardSpec(topic);
    const pf = profile(); spec.questions.forEach((q) => { if (pf[q.key] && q.options.some((x) => x.v === pf[q.key])) q.saved = pf[q.key]; });
    cachePut(topic, spec); return spec;
  } catch (e) { return standardSpec(topic); }
}

/* ---------- Turn answers into the brief every builder reads ---------- */
function answerLabel(q, a) { if (q.kind === 'text') return clip(a, 80); const x = q.options.find((y) => y.v === a); return x ? x.t : clip(a, 80); }
function makeBrief(spec, answers, skipped, topic) {
  answers = answers || {};
  if (skipped || !spec || !spec.questions.length) {
    const std = spec && spec.standard ? spec.standard : 'Build a standard course that suits anyone starting out.';
    return { skipped: true, lines: [], tool: '', others: [], summary: 'Standard course for anyone', text: 'LEARNER BRIEF: the learner gave no preferences. Build a standard course that suits anyone starting out. Do not assume a tool, device or goal. ' + std + (spec && spec.preset && spec.preset.tool ? ' The topic already names ' + spec.preset.tool + ', so teach it with that.' : '') };
  }
  const lines = [], parts = []; let tool = '', others = [];
  spec.questions.forEach((q) => {
    let a = answers[q.id], auto = false; if (a === undefined || a === '__auto' || a === '') { a = q.rec || (q.options[0] && q.options[0].v); auto = true; }
    if (a === undefined) return;
    const lab = answerLabel(q, a); lines.push({ id: q.id, label: q.q.replace(/\?$/, ''), value: lab, auto });
    parts.push((q.line ? q.line.replace(/\{a\}/g, lab) : (q.key + ': ' + lab + '.')) + (auto ? ' (Amani chose this as the best default.)' : ''));
    if (q.key === 'tool') { tool = lab; others = q.options.filter((x) => x.v !== a).map((x) => x.t); }
  });
  if (spec.preset && spec.preset.tool && !tool) { tool = spec.preset.tool; others = (spec.toolOptions || []).filter((x) => x.toLowerCase() !== tool.toLowerCase()); parts.unshift('Tool to teach: ' + tool + '. Teach every step in this tool only, using its real menus, buttons and names.'); lines.unshift({ id: 'tool', label: 'Tool', value: tool, auto: false, fromTopic: true }); }
  const q2 = (spec.quality || []).length ? ' This course needs: ' + spec.quality.join('; ') + '.' : '';
  return { skipped: false, lines, tool, others, summary: lines.map((l) => l.value).join(' · '), text: 'LEARNER BRIEF (this decides the whole course; follow it in every lesson, example and question):\n- ' + parts.join('\n- ') + q2 };
}

window.KVDirector = { analyze, makeBrief, standardSpec, ruleFor, validate, remember, norm, RULES, profile };
})();
