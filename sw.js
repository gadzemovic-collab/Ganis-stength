const CACHE_PREFIX = 'rep-harbor-';
const CACHE = CACHE_PREFIX + 'v78';
const ASSETS = [
  './', './index.html', './shark.js?v=3', './shark-frames.json?v=1',
  './female-shark-sheet.webp?v=1', './female-shark.webp?v=1',
  './weight.js?v=14', './milestones.js?v=2', './progress-photos.js?v=1',
  './exercise-images.js?v=1', './exercise-images/catalog.json', './exercise-images/placeholder.svg',
  './manifest.webmanifest', './rep-harbor-180.png?v=12',
  './rep-harbor-192.png?v=12', './rep-harbor-512.png?v=12',
];
const exerciseImage = /^exercise-images\/[a-z0-9-]+\.webp$/;
const knownURLs = new Set(ASSETS.map(asset => new URL(asset, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const catalog = await fetch('./exercise-images/catalog.json', { cache: 'reload' });
    if (!catalog.ok) throw new Error('Exercise image catalog unavailable');
    const images = Object.values(await catalog.json()).filter(Boolean).map(asset => asset.file);
    if (!images.every(path => exerciseImage.test(path))) throw new Error('Invalid exercise image catalog');
    await cache.addAll([...ASSETS, ...images].map(asset => new Request(asset, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const appNavigation = request.mode === 'navigate' &&
    knownURLs.has(url.origin + url.pathname);
  const bundledImage = request.url.startsWith(self.registration.scope) &&
    exerciseImage.test(request.url.slice(self.registration.scope.length));
  if (!knownURLs.has(request.url) && !appNavigation && !bundledImage) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(appNavigation ? './index.html' : request);
    return cached || fetch(request);
  })());
});
