// localViewer service worker — cache app shell + CDN libs after first load.
const CACHE = 'localviewer-v5';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './src/format.js',
  './src/header.js',
  './src/tabs.js',
  './src/tabbar.js',
  './src/yamlview.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache the user's file payload coming from the local helper.
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return;

  // Stale-while-revalidate for app shell + CDN deps.
  const isCDN = CDN_HOSTS.includes(url.hostname);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isCDN) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
