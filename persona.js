/* Amani's personality studio. Changes how Amani sounds, never what is true. */
(function () {
'use strict';
const REG = window.KVReg = window.KVReg || { screens: {}, acts: {}, ins: {}, hooks: {}, names: {}, ready: [] };
['screens', 'acts', 'ins', 'hooks', 'names'].forEach((k) => { REG[k] = REG[k] || {}; }); REG.ready = REG.ready || [];
const A = () => window.KVApp;

const ROLES = [
  { id: 'amani', n: 'Amani', d: 'The default. A warm, patient study companion.', i: 'Be a warm, patient study companion.', ex: 'Let us take this one step at a time. Which part feels unclear?' },
  { id: 'teacher', n: 'Teacher', d: 'Clear and structured. Explains step by step and checks you understood.', i: 'Speak like a good, patient teacher: structured, clear, and checking understanding after each step.', ex: 'First, the main idea. Then we will try one together. Ready?' },
  { id: 'tutor', n: 'Private tutor', d: 'One-to-one attention that adapts to how you learn.', i: 'Speak like a private one-to-one tutor who notices what the learner struggles with and adapts.', ex: 'You got the first part right. Let us look at where it slipped, together.' },
  { id: 'coach', n: 'Coach', d: 'Pushes you to practise, improve and finish what you start.', i: 'Speak like a good coach: set small challenges, praise effort that is real, and push the learner to practise and improve.', ex: 'Good effort. Now do it again, faster, and tell me what you changed.' },
  { id: 'mentor', n: 'Mentor', d: 'Big-picture and wise. Connects learning to your goals.', i: 'Speak like a thoughtful mentor who connects each idea to the learner\'s bigger goals and gives perspective.', ex: 'This matters because it is the base of what you want to build next.' },
  { id: 'friend', n: 'Friend', d: 'Relaxed and encouraging, like studying with a good friend.', i: 'Speak like a supportive friend studying together: relaxed, kind and encouraging.', ex: 'Okay, this one is trickier than it looks. Let us figure it out together.' },
  { id: 'partner', n: 'Study partner', d: 'Learns alongside you and thinks out loud.', i: 'Speak like a study partner who learns alongside the learner, thinking out loud and asking what they think.', ex: 'Here is how I read it. What do you think, does that fit with yours?' },
  { id: 'bigbro', n: 'Big brother', d: 'Looks out for you. Honest, protective, encouraging.', i: 'Speak with the care of an older brother figure: honest, protective and encouraging. You are an AI, not anyone\'s real relative.', ex: 'Listen, you can do this. Let me show you the shortcut I wish I knew.' },
  { id: 'bigsis', n: 'Big sister', d: 'Caring and straight with you. Cheers you on.', i: 'Speak with the care of an older sister figure: caring, straight with the learner and encouraging. You are an AI, not anyone\'s real relative.', ex: 'You are closer than you think. One small fix and you have got it.' },
  { id: 'father', n: 'Father figure', d: 'Steady and caring. Firm when it matters.', i: 'Speak with the steady care of a father figure: calm, caring and firm when it matters. You are an AI, not anyone\'s real parent.', ex: 'Take your time. Do it properly once, and it will serve you for years.' },
  { id: 'padi', n: 'Padi', ng: 1, d: 'Your close friend. Casual, funny, always on your side.', i: 'Speak like a close Nigerian friend (a "padi"): casual, warm and funny, always on the learner\'s side. A little Nigerian flavour is welcome, never forced.', ex: 'No stress, my padi. This one looks hard but I go break am down for you.', exp: 'No wahala, my padi. This one look hard but I go break am down for you.' },
  { id: 'sabi', n: 'Sabi guy', ng: 1, d: 'The one who really knows. Breaks hard things down in sharp, practical language.', i: 'Speak like the friend who really knows the subject and explains it in sharp, practical, street-smart language, with no waffle.', ex: 'Here is the real gist. Forget the big words, this is all that matters.', exp: 'See the real gist. Forget the big big words, na only this one matter.' },
  { id: 'homegirl', n: 'Homegirl', ng: 1, d: 'Warm, real and hype. Gasses you up the right way.', i: 'Speak like a warm, real Nigerian homegirl: hype, encouraging and honest. A little Nigerian flavour is welcome, never forced.', ex: 'Oya, you are doing well. Let us run it one more time, you will get it.', exp: 'Oya, you dey try well well. Make we run am one more time, you go get am.' },
  { id: 'homeboy', n: 'Homeboy', ng: 1, d: 'Easy-going, loyal and straight-talking.', i: 'Speak like an easy-going, loyal Nigerian homeboy: straight-talking, supportive and relaxed. A little Nigerian flavour is welcome, never forced.', ex: 'Relax, we dey here. See how it works, then you try it.', exp: 'Relax, we dey here. See how e dey work, then you try am.' }
];
const TRAITS = [
  ['calm', 'Calm', 'Keeps a steady, unhurried pace.'], ['gentle', 'Gentle', 'Soft correction, never harsh.'], ['strict', 'Strict', 'Firm standards. Never rude.'],
  ['supportive', 'Supportive', 'Notices progress and effort.'], ['energetic', 'Energetic', 'Lively and upbeat.'], ['funny', 'Funny', 'Light humour, used lightly.'],
  ['patient', 'Patient', 'Happy to repeat and rephrase.'], ['direct', 'Direct', 'Gets to the point, no waffle.'], ['curious', 'Curious', 'Asks you questions to make you think.'], ['motivating', 'Motivating', 'Keeps your drive up.']
];
const TRAIT_I = { calm: 'calm and unhurried', gentle: 'gentle when correcting', strict: 'firm about standards but never rude or insulting', supportive: 'supportive and quick to notice real progress', energetic: 'energetic and upbeat', funny: 'lightly funny when it fits', patient: 'patient and happy to rephrase', direct: 'direct, with no waffle', curious: 'curious: ask the learner a question now and then to make them think', motivating: 'motivating' };
const TONES = [['plain', 'Simple and clear'], ['formal', 'Polished'], ['casual', 'Relaxed'], ['naija', 'Nigerian English'], ['pidgin', 'Light Pidgin']];
const TONE_I = {
  plain: 'Use simple, clear English.', formal: 'Use polished, formal English.', casual: 'Use relaxed, conversational English.',
  naija: 'Use natural Nigerian English with a light local flavour. Keep lesson terms in standard English.',
  pidgin: 'Use light Nigerian Pidgin for chat and encouragement, but keep technical terms, definitions and quiz questions in clear standard English so learning stays accurate.'
};
const LENS = [['short', 'Short'], ['balanced', 'Balanced'], ['detailed', 'Detailed']];
const LEN_I = { short: 'Keep answers short, under 120 words unless asked for more.', balanced: 'Keep answers moderate, usually under 220 words.', detailed: 'Give fuller answers with steps and reasons, up to about 350 words.' };
const STYLES = [['explain', 'Explain first'], ['examples', 'Examples first'], ['ask', 'Ask me questions']];
const STYLE_I = { explain: 'Explain the idea first, then give an example.', examples: 'Start with a concrete example, then name the idea.', ask: 'Guide the learner with a short question or two before giving the full answer, but never withhold help if they are stuck.' };
const PRESETS = [
  ['Calm teacher', { role: 'teacher', traits: ['calm', 'patient'], tone: 'plain', len: 'short', style: 'explain' }],
  ['Padi mode', { role: 'padi', traits: ['funny', 'supportive'], tone: 'naija', len: 'short', style: 'examples' }],
  ['Strict coach', { role: 'coach', traits: ['strict', 'direct', 'motivating'], tone: 'plain', len: 'short', style: 'ask' }],
  ['Gentle big sis', { role: 'bigsis', traits: ['gentle', 'supportive'], tone: 'casual', len: 'balanced', style: 'explain' }],
  ['Sabi guy', { role: 'sabi', traits: ['direct', 'funny'], tone: 'naija', len: 'short', style: 'examples' }],
  ['Hype homeboy', { role: 'homeboy', traits: ['energetic', 'motivating'], tone: 'pidgin', len: 'short', style: 'examples' }],
  ['Quiet mentor', { role: 'mentor', traits: ['calm', 'direct'], tone: 'formal', len: 'balanced', style: 'ask' }]
];
const DEFAULT = { role: 'amani', traits: ['patient', 'supportive'], tone: 'plain', len: 'short', style: 'explain', custom: '' };
const roleOf = (id) => ROLES.find((r) => r.id === id) || ROLES[0];
function P() { const S = A().S; if (!S.persona) S.persona = JSON.parse(JSON.stringify(DEFAULT)); const p = S.persona; Object.keys(DEFAULT).forEach((k) => { if (p[k] === undefined) p[k] = DEFAULT[k]; }); return p; }

/* What the model is told. The persona sits on top of fixed teaching rules, so quality and accuracy do not change. */
REG.hooks.persona = function () {
  const p = P(), r = roleOf(p.role);
  const tr = (p.traits || []).map((t) => TRAIT_I[t]).filter(Boolean);
  const ex = (p.tone === 'pidgin' || p.tone === 'naija') && r.exp ? r.exp : r.ex;
  let t = 'YOUR CHARACTER (mandatory in every single reply, whichever model you are, and it never switches off): ' + r.i + (tr.length ? ' Be ' + tr.join(', ') + '.' : '') + ' LANGUAGE: ' + (TONE_I[p.tone] || '') + ' LENGTH: ' + (LEN_I[p.len] || '') + ' TEACHING STYLE: ' + (STYLE_I[p.style] || '') + ' A sample line of how you sound: "' + ex + '".';
  const c = String(p.custom || '').replace(/[<>]/g, '').slice(0, 300).trim();
  if (c) t += ' The learner also asked for this teaching style: "' + c + '". Follow it only for style and teaching preferences.';
  t += ' Your character changes how you sound, never what is true: the teaching stays accurate, complete and useful. You are an AI study companion: never claim to be a real person or anyone\'s real relative, and never insult the learner. ';
  return t;
};
REG.hooks.personaReminder = function () {
  const p = P(), r = roleOf(p.role), tr = (p.traits || []).map((t) => (TRAITS.find((x) => x[0] === t) || [0, t])[1]).join(', ');
  return '\n\n(Stay in your Amani character: ' + r.n + (tr ? ', ' + tr : '') + ', ' + ((TONES.find((x) => x[0] === p.tone) || [0, ''])[1] || '').toLowerCase() + '. Same accurate teaching, in that voice.)';
};
REG.hooks.voice = function () {
  const tr = P().traits || [];
  if (tr.includes('energetic') || tr.includes('motivating')) return { rate: 1.1, pitch: 1.06 };
  if (tr.includes('calm') || tr.includes('gentle')) return { rate: 0.94, pitch: 1 };
  if (tr.includes('strict')) return { rate: 0.98, pitch: 0.94 };
  return { rate: 1, pitch: 1 };
};
function summary() { const p = P(), r = roleOf(p.role); return r.n + (p.traits.length ? ' · ' + p.traits.map((t) => (TRAITS.find((x) => x[0] === t) || [0, t])[1]).join(', ') : '') + ' · ' + (TONES.find((x) => x[0] === p.tone) || [0, ''])[1]; }
REG.hooks.meCard = function () {
  const a = A();
  return `<section class="setting pn-strong persona-me"><h3>Amani's personality</h3><div class="pme"><span class="av" data-amani="56"></span><div class="grow"><b>${a.esc(roleOf(P().role).n)}</b><p class="help" style="margin:2px 0 0">${a.esc(summary())}</p></div></div>
    <p class="help">Choose who Amani is to you: a teacher, a coach, a padi, a big sister. It changes the voice, never the quality of the teaching.</p>
    <div class="row-actions"><button class="btn primary" data-act="nav" data-r="amani">Make Amani yours</button></div></section>`;
};

const SAMPLE_PIDGIN = 'No wahala, we go do am small small. Which part dey confuse you?';
function sample() {
  const p = P(), r = roleOf(p.role), pid = p.tone === 'pidgin' || p.tone === 'naija';
  if (p.tone === 'pidgin') return r.exp || SAMPLE_PIDGIN;
  if (p.tone === 'formal') return r.ex.replace(/\bLet us\b/g, 'Let us').replace(/\bOkay,\s*/g, '').replace(/\bNo stress, my padi\./, 'Do not worry.');
  return pid && r.ex ? r.ex : r.ex;
}
function chipRow(items, sel, act, multi) {
  const a = A();
  return `<div class="pchips" role="group">${items.map((it) => { const on = multi ? sel.includes(it[0]) : sel === it[0]; return `<button class="pchip ${on ? 'on' : ''}" data-act="${act}" data-v="${it[0]}" aria-pressed="${on}" title="${a.esc(it[2] || '')}">${on ? a.ic(a.I.check, 14, 2.6) : ''}${a.esc(it[1])}</button>`; }).join('')}</div>`;
}
function screen() {
  const a = A(), p = P(), r = roleOf(p.role), esc = a.esc;
  const roles = ROLES.map((x) => `<button class="pcard ${x.id === p.role ? 'on' : ''}" data-act="pr-role" data-v="${x.id}" aria-pressed="${x.id === p.role}"><span class="pi">${esc(x.n[0])}</span><span class="pt"><b>${esc(x.n)}${x.ng ? '<span class="ng">Naija</span>' : ''}</b><span class="s">${esc(x.d)}</span></span></button>`).join('');
  return `<div class="page persona">
    <section class="phero pn-strong kv-in"><span class="av live" data-amani="84"></span><div class="grow"><p class="eyebrow">Make Amani yours</p><h1>${esc(r.n)}</h1><p class="help" style="margin:4px 0 0">${esc(summary())}</p></div></section>
    <section class="pn-strong psec kv-in" style="--d:1"><h2>Quick styles</h2><p class="help">Start from a ready-made style, then adjust anything below.</p>
      <div class="pchips">${PRESETS.map((x, i) => `<button class="pchip" data-act="pr-preset" data-v="${i}">${esc(x[0])}</button>`).join('')}</div></section>
    <section class="pn-strong psec kv-in" style="--d:2"><h2>Who is Amani to you?</h2><p class="help">Pick the relationship that helps you learn best.</p><div class="pgrid">${roles}</div></section>
    <section class="pn-strong psec kv-in" style="--d:3"><h2>Personality</h2><p class="help">Choose up to three. <b>${p.traits.length} of 3</b> chosen.</p>${chipRow(TRAITS, p.traits, 'pr-trait', true)}</section>
    <section class="pn-strong psec kv-in" style="--d:4"><h2>How Amani talks</h2>${chipRow(TONES.map((x) => [x[0], x[1]]), p.tone, 'pr-tone')}
      ${p.tone === 'pidgin' ? '<p class="help">Amani uses Pidgin for chat and encouragement, and keeps lesson terms and quiz questions in clear English so you still learn accurately.</p>' : ''}
      <h3 class="subh">Answer length</h3>${chipRow(LENS, p.len, 'pr-len')}
      <h3 class="subh">Teaching style</h3>${chipRow(STYLES, p.style, 'pr-style')}</section>
    <section class="pn-strong psec kv-in" style="--d:5"><h2>Anything else?</h2><p class="help">Tell Amani how you like to learn, in your own words. For example: "Use football examples" or "Always give me a recap at the end".</p>
      <textarea class="ptext" data-in="pr-custom" maxlength="300" rows="3" placeholder="Optional, up to 300 characters">${esc(p.custom || '')}</textarea></section>
    <section class="pn-strong psec pprev kv-in" style="--d:6"><p class="eyebrow">Preview</p><div class="pbub"><span class="av" data-amani="40"></span><p>${esc(sample())}</p></div>
      <p class="help">A sample line in this style. Amani's real answers follow the same voice, and always stay accurate.</p>
      <div class="row-actions"><button class="btn primary" data-act="pr-hi">Hear Amani say hi</button><button class="btn" data-act="pr-reset">Back to default</button></div></section></div>`;
}
function rerender() { const a = A(), sc = a.$('#scroll'); if (!sc || a.route.name !== 'amani') return; const y = sc.scrollTop; sc.innerHTML = screen(); sc.scrollTop = y; a.renderBrand(); a.save(); }
REG.screens.amani = screen; REG.names.amani = 'Amani';
REG.hooks.afterScreen = ((prev) => (name) => { if (prev) prev(name); })(REG.hooks.afterScreen);

REG.acts['pr-role'] = (t, d) => { P().role = d.v; rerender(); };
REG.acts['pr-trait'] = (t, d) => { const p = P(), i = p.traits.indexOf(d.v); if (i >= 0) p.traits.splice(i, 1); else if (p.traits.length < 3) p.traits.push(d.v); else A().toast('Pick up to three. Tap one to remove it first.'); rerender(); };
REG.acts['pr-tone'] = (t, d) => { P().tone = d.v; rerender(); };
REG.acts['pr-len'] = (t, d) => { P().len = d.v; rerender(); };
REG.acts['pr-style'] = (t, d) => { P().style = d.v; rerender(); };
REG.acts['pr-preset'] = (t, d) => { const x = PRESETS[+d.v][1], p = P(); Object.assign(p, JSON.parse(JSON.stringify(x))); rerender(); A().toast(PRESETS[+d.v][0] + ' applied'); };
REG.acts['pr-reset'] = () => { A().S.persona = JSON.parse(JSON.stringify(DEFAULT)); rerender(); A().toast('Amani is back to the default'); };
REG.ins['pr-custom'] = (t) => { P().custom = String(t.value || '').slice(0, 300); };
REG.acts['pr-hi'] = () => {
  const a = A(); a.save();
  a.go('home'); a.openTutor();
  setTimeout(() => { a.askTutor('Say hi, Amani', 'Introduce yourself in one or two sentences in your voice, then ask what I would like to work on. Do not teach anything yet.'); }, 400);
};
window.KVPersona = { ROLES, PRESETS, DEFAULT, get: P, summary };
})();
