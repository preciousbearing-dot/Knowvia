/* Knowvia service worker: keeps the app working with no internet.
   Pages and code: fresh from the network when online, the saved copy when not. Fonts and icons: saved copy first. */
const V = 'knowvia-shell-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'version.js', 'brand.js', 'data/packs.js', 'playbook.js', 'catalog.js', 'persona.js', 'net.js', 'research.js', 'pwa.js', 'device.js', 'offline.js', 'rules.js', 'voice.js', 'voice-ui.js', 'follow.js', 'update.js', 'sources.js', 'sources-ui.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'library.js', 'store.js', 'request.js', 'director.js', 'build.js', 'figures.js', 'math.js', 'viewer.js', 'profile.js', 'app.js', 'version.json', 'manifest.webmanifest', 'icon.png', 'math.js', 'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css', 'vendor/katex/fonts/KaTeX_AMS-Regular.woff2', 'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2', 'vendor/katex/fonts/KaTeX_Main-Bold.woff2', 'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2', 'vendor/katex/fonts/KaTeX_Main-Italic.woff2', 'vendor/katex/fonts/KaTeX_Main-Regular.woff2', 'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2', 'vendor/katex/fonts/KaTeX_Math-Italic.woff2', 'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size1-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size2-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size3-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size4-Regular.woff2', 'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const fontOrIcon = /\/(fonts|icons)\//.test(u.pathname);
  if (fontOrIcon) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); return res; })));
    return;
  }
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then((hit) => hit || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
