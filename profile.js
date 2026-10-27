/* Source profile: before Amani makes lessons from something, she looks at what it is.
   quick() works offline from the text itself. ask() is one small cloud call that reads a few samples and says more.
   A source that looks clearly teachable is left alone. Only when Amani is unsure does she tell the learner what she found and offer choices. */
(function () {
'use strict';
const TYPES = { lesson: 'a talk or lesson', textbook: 'textbook or course pages', exercises: 'practice questions', notes: 'notes', article: 'an article', podcast: 'a podcast or interview', tutorial: 'a how-to or tutorial', news: 'a news report', story: 'a story or fiction', comedy: 'comedy or entertainment', music: 'a song or music video', sermon: 'a sermon or speech', reference: 'reference material or a list', data: 'a table of data', chat: 'a conversation', junk: 'something with almost no readable content', other: 'something Amani could not place' };
const OFFERS = { lessons: 'Make lessons anyway', summary: 'Make a short summary', keyideas: 'Pull out the key ideas', chat: 'Just chat about it' };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function stats(src) {
  const units = src.units || [], text = units.map((u) => u.t || '').join('\n').slice(0, 60000), words = (text.match(/[\p{L}\p{N}']+/gu) || []).length;
  const letters = (text.match(/\p{L}/gu) || []).length, alpha = text.length ? letters / text.length : 0;
  const lines = text.split(/\n+/).map((l) => l.trim().toLowerCase()).filter((l) => l.length > 3), seen = {}; let dup = 0, lineLen = 0; lines.forEach((l) => { lineLen += l.length; if (seen[l]) dup++; else seen[l] = 1; });
  const sents = text.split(/[.!?]+\s/).filter((x) => x.trim()), avgSent = sents.length ? words / sents.length : 0;
  const music = (text.match(/\[(?:music|singing|instrumental|♪[^\]]*)\]|♪|\(music\)/gi) || []).length, laugh = (text.match(/\[(?:laughter|laughing|applause|cheering)\]|\((?:laughter|laughs|applause)\)/gi) || []).length;
  const words5 = text.toLowerCase().match(/[\p{L}']+/gu) || [], uniq = new Set(words5).size, ttr = words5.length ? uniq / words5.length : 1;
  const ex = (text.match(/\b(?:exercise|example|question|q\.?\s*\d|problem|solve|simplify|find the|calculate|express)\b/gi) || []).length;
  return { units: units.length, chars: text.length, words, alpha, dupRatio: lines.length >= 12 && lineLen / lines.length < 70 ? dup / lines.length : 0, avgSent, music, laugh, ttr, ex, exPer1k: words ? ex * 1000 / words : 0, secs: (src.extra && src.extra.secs) || 0 };
}

function make(type, teach, reasons, extra) {
  const offers = teach === 'none' ? ['chat', 'summary'] : teach === 'low' ? ['summary', 'keyideas', 'chat', 'lessons'] : [];
  return Object.assign({ type, label: TYPES[type] || TYPES.other, teach, unsure: teach !== 'ok', quiz: teach === 'ok', reasons, offers, by: 'rules' }, extra || {});
}
function quick(src) {
  const s = stats(src), r = [];
  if (!s.units || s.chars < 120 || s.alpha < 0.45) return make('junk', 'none', ['There is almost no readable text here' + (s.alpha && s.alpha < 0.45 ? ', and much of it is symbols or numbers' : '') + '.'], { s });
  const tagRate = s.units ? (s.music) / s.units : 0;
  if (src.kind === 'youtube' && (tagRate >= 0.3 || (s.music >= 6 && s.words < 400))) return make('music', 'none', ['Most of the transcript is music markers, so there is almost no spoken teaching in it.'], { s });
  if (s.dupRatio >= 0.3 && s.words < 1200) return make('music', 'none', ['Many lines repeat, like the chorus of a song.'], { s });
  if (s.words < 120) return make('notes', 'none', ['It is only about ' + s.words + ' words. That is a note, not a course.'], { s });
  if (s.words < 350) return make('notes', 'low', ['It is short (about ' + s.words + ' words), so a full lesson with practice would be padded.'], { s });
  if (src.kind === 'youtube' && s.secs && s.secs < 150 && s.words < 600) return make('other', 'low', ['This video is very short (about ' + Math.max(1, Math.round(s.secs / 60)) + ' minutes), so there is little to build a course from.'], { s });
  if (s.laugh && s.laugh * 1000 / Math.max(1, s.words) >= 4) return make('comedy', 'low', ['The transcript is full of laughter and applause markers. It may be comedy or entertainment rather than teaching.'], { s });
  const type = s.exPer1k >= 12 ? 'exercises' : src.kind === 'youtube' ? 'lesson' : 'textbook';
  return make(type, 'ok', [], { s });
}

const SYS = 'You help a study app decide what to do with something a learner added. You are given a title, the kind of source and short samples. Decide what it is and whether it can honestly be taught. Be strict: a comedy sketch, music video, gossip, ad, casual chat or a plain story has little to teach. A talk, textbook page, tutorial, lecture or explainer does. Reply with ONLY JSON, no other text, in this form:\n{"type":"lesson|textbook|exercises|notes|article|podcast|tutorial|news|story|comedy|music|sermon|reference|data|chat|junk|other","topic":"max 12 words","summary":"one or two plain sentences saying what it is about","teach":"high|medium|low|none","why":"one short sentence for the learner saying why","quiz":true or false (true only when there are facts or skills a learner can be tested on),"offers":["lessons","summary","keyideas","chat"] (the options that make sense, best first)}';
function samples(src) {
  const u = src.units || [], n = u.length, pick = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i && u[v]);
  return pick.map((i) => '[' + (u[i].cite || 'part ' + (i + 1)) + ']\n' + clip(u[i].t, 1100)).join('\n\n');
}
function parse(txt) { const s = String(txt || '').replace(/```(?:json)?/gi, ''), i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i < 0 || j <= i) return null; try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; } }
function fromAi(j, base) {
  if (!j || typeof j !== 'object') return null;
  const type = TYPES[j.type] ? j.type : 'other', teach = ['high', 'medium', 'low', 'none'].includes(j.teach) ? j.teach : null; if (!teach) return null;
  const ok = teach === 'high' || teach === 'medium', offs = (Array.isArray(j.offers) ? j.offers : []).filter((o, i, a) => OFFERS[o] && a.indexOf(o) === i);
  const offers = ok ? [] : (offs.length ? offs : teach === 'none' ? ['chat', 'summary'] : ['summary', 'keyideas', 'chat', 'lessons']);
  if (!ok && !offers.includes('chat')) offers.push('chat');
  return { type, label: TYPES[type], teach: ok ? 'ok' : teach, unsure: !ok, quiz: ok && j.quiz !== false, reasons: [clip(j.why, 220)].filter(Boolean), topic: clip(j.topic, 100), summary: clip(j.summary, 300), offers, by: 'ai', s: base && base.s };
}
async function ask(src, o) {
  o = o || {}; const a = window.KVApp, base = quick(src);
  const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: 'Title: ' + clip(src.title, 120) + '\nSource kind: ' + src.kind + (src.extra && src.extra.author ? '\nChannel: ' + clip(src.extra.author, 60) : '') + (src.extra && src.extra.secs ? '\nLength: about ' + Math.round(src.extra.secs / 60) + ' minutes' : '') + '\nWords: ' + (base.s ? base.s.words : '?') + '\n\nSAMPLES:\n' + samples(src) }];
  const out = String(await a.llm(msgs, { model: o.model, max: 600, temp: 0.1, signal: o.signal, fast: true, strict: true }));
  const p = fromAi(parse(out), base); if (!p) { const e = new Error('Amani could not read the answer.'); e.bad = true; throw e; }
  p.at = Date.now(); p.len = src.stats ? src.stats.chars : 0; return p;
}
/* the profile to use now: a saved cloud one while the text has not changed, else the quick one */
function of(src) { const p = src.profile; if (p && p.by === 'ai' && p.len === (src.stats ? src.stats.chars : 0)) return p; return quick(src); }

window.KVProfile = { quick, ask, of, parse, fromAi, TYPES, OFFERS };
})();
