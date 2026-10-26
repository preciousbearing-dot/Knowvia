/* Knowvia maths: $x^2$ inline, $$...$$ on its own lines for display, also \( \) and \[ \].
   KaTeX is bundled in vendor/katex, so maths works with no network. It loads the first time a page shows maths.
   Until it has loaded (or if it cannot), the formula shows as readable text in the same place.
   scan() is plain JS with no browser needs, so tools/check_math.js runs the same rules the app uses. */
(function (root) {
  'use strict';
  const MAXLEN = 600;          /* one formula longer than this is shown as plain text, never typeset */
  const isSpace = (c) => c === undefined || /\s/.test(c);

  /* Finds formulas in one line or paragraph of text (code spans must already be removed).
     $ ... $ follows the usual rule so money is safe: "$5 and $10" is not a formula, because the opening $ must be
     followed by a non-space, the closing $ must follow a non-space and must not be followed by a digit. A backslash escapes a $. */
  function scan(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        if (s[i + 1] === '(') { const j = s.indexOf('\\)', i + 2); if (j > 0) { out.push({ a: i, b: j + 2, tex: s.slice(i + 2, j), display: false }); i = j + 2; continue; } }
        if (s[i + 1] === '[') { const j = s.indexOf('\\]', i + 2); if (j > 0) { out.push({ a: i, b: j + 2, tex: s.slice(i + 2, j), display: true }); i = j + 2; continue; } }
        i += 2; continue;
      }
      if (c === '$') {
        if (s[i + 1] === '$') { const j = s.indexOf('$$', i + 2); if (j > 0 && s.slice(i + 2, j).trim()) { out.push({ a: i, b: j + 2, tex: s.slice(i + 2, j), display: true }); i = j + 2; continue; } i += 2; continue; }
        if (isSpace(s[i + 1])) { i++; continue; }
        let j = i + 1;
        while (j < s.length && s[j] !== '$') { if (s[j] === '\\') j++; j++; }
        if (j < s.length && !isSpace(s[j - 1]) && !/\d/.test(s[j + 1] || '')) { out.push({ a: i, b: j + 1, tex: s.slice(i + 1, j), display: false }); i = j + 1; continue; }
        i++; continue;
      }
      i++;
    }
    return out;
  }


  /* Whole lesson text: every formula with its line number, plus problems that make maths silently fail (an unclosed $$ block).
     Used by tools/check_math.js, so the checker applies the same rules as the app. Code fences and `code spans` are skipped. */
  function scanDoc(md) {
    const lines = String(md).replace(/\r/g, '').split('\n'), items = [], problems = [];
    let i = 0, fence = false;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*```/.test(l)) { fence = !fence; i++; continue; }
      if (fence) { i++; continue; }
      if (/^\s*(\$\$|\\\[)/.test(l)) {
        const open = l.trim().startsWith('$$') ? '$$' : '\\[', close = open === '$$' ? '$$' : '\\]';
        const first = l.trim().slice(open.length), buf = []; let j = i, done = false;
        const k = first.indexOf(close);
        if (k >= 0) { if (!first.slice(k + close.length).trim()) { buf.push(first.slice(0, k)); done = true; } }
        else { buf.push(first); j = i + 1; while (j < lines.length && !/^\s*$/.test(lines[j])) { const kk = lines[j].indexOf(close); if (kk >= 0) { if (!lines[j].slice(kk + close.length).trim()) { buf.push(lines[j].slice(0, kk)); done = true; } break; } buf.push(lines[j]); j++; } }
        if (done && buf.join('').trim()) { items.push({ line: i + 1, tex: buf.join('\n').trim(), display: true }); i = j + 1; continue; }
        if (!first.includes(close)) problems.push({ line: i + 1, msg: 'display maths opened with ' + open + ' is never closed on its own line, so it shows as plain text' });
      }
      const noCode = l.replace(/`[^`\n]+`/g, (c) => ' '.repeat(c.length));
      scan(noCode).forEach((f) => items.push({ line: i + 1, tex: f.tex.trim(), display: f.display }));
      i++;
    }
    return { items, problems };
  }

  const cache = new Map();
  let state = 'idle', waiters = [];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const OPT = (display) => ({ displayMode: !!display, throwOnError: false, output: 'htmlAndMathml', trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, errorColor: 'currentColor' });

  const BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^/]*$/, '') : '';

  function load() {
    if (root.katex) return Promise.resolve(root.katex);
    if (state === 'failed') return Promise.reject(new Error('maths library unavailable'));
    return new Promise((res, rej) => {
      waiters.push([res, rej]);
      if (state === 'loading') return;
      state = 'loading';
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = BASE + 'vendor/katex/katex.min.css'; document.head.appendChild(link);
      const sc = document.createElement('script'); sc.src = BASE + 'vendor/katex/katex.min.js';
      sc.onload = () => { state = 'ready'; waiters.splice(0).forEach((w) => w[0](root.katex)); };
      sc.onerror = () => { state = 'failed'; waiters.splice(0).forEach((w) => w[1](new Error('maths library unavailable'))); };
      document.head.appendChild(sc);
    });
  }

  /* HTML for one formula. Typeset straight away when KaTeX is already loaded (cached, so a chat bubble that is redrawn while
     text streams in does not flicker). Otherwise a plain-text placeholder, and the first use starts the load. */
  function html(tex, display) {
    tex = String(tex).trim();
    const cls = display ? 'kv-math kv-block' : 'kv-math';
    if (tex.length > MAXLEN) return `<span class="${cls} plain" data-done="1">${esc(tex.slice(0, MAXLEN))}</span>`;
    const key = (display ? 'D' : 'I') + tex;
    if (root.katex) {
      let h = cache.get(key);
      if (h === undefined) {
        try { h = root.katex.renderToString(tex, OPT(display)); } catch (e) { h = null; }
        if (cache.size > 400) cache.clear();
        cache.set(key, h);
      }
      if (h) return `<span class="${cls} done" data-done="1" data-tex="${esc(tex)}">${h}</span>`;
      return `<span class="${cls} plain" data-done="1">${esc(tex)}</span>`;
    }
    load().then(() => typeset(document), failAll);
    return `<span class="${cls} pending" data-tex="${esc(tex)}">${esc(tex)}</span>`;
  }

  function failAll() {
    document.querySelectorAll('.kv-math.pending').forEach((el) => { el.classList.remove('pending'); el.classList.add('plain'); el.setAttribute('data-done', '1'); });
  }

  /* Typeset any placeholder still on the page, for example after the library finished loading. */
  function typeset(scope) {
    if (!root.katex) return 0;
    const els = (scope || document).querySelectorAll('.kv-math.pending:not([data-done])');
    let n = 0;
    els.forEach((el) => {
      const tex = el.getAttribute('data-tex') || '';
      const display = el.classList.contains('kv-block');
      el.setAttribute('data-done', '1'); el.classList.remove('pending');
      try { el.innerHTML = root.katex.renderToString(tex, OPT(display)); el.classList.add('done'); n++; }
      catch (e) { el.textContent = tex; el.classList.add('plain'); }
    });
    return n;
  }
  /* The last tex text a block of display maths needs: a $$ block on its own lines (see renderMd). */
  function block(tex) { return `<div class="kv-mathrow">${html(tex, true)}</div>`; }

  const api = { scan, scanDoc, html, block, load, typeset, MAXLEN, _cache: cache };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KVMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
