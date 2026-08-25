/*
 * The offline shell (W10.6).
 *
 * Scope is deliberately narrow. This caches the pages and static assets the
 * app is made of so that Trip Mode still opens on a train with no signal; the
 * itinerary itself is kept separately in localStorage by lib/offline.ts, and
 * nothing that needs a token is ever written to the cache.
 *
 * Three rules, in this order:
 *   1. Never touch anything but same-origin GETs.
 *   2. Navigations: network first, fall back to the cached page, then to the
 *      cached trip list — an installed app must always render something.
 *   3. Static build output: cache first, it is content-hashed and immutable.
 */

const VERSION = 'rove-v1';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;

// The one page worth having before it is ever visited: an installed app opens
// at /trips, and opening to a browser error is what makes people uninstall.
const PRECACHE = ['/trips'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      // A precache miss (offline first run, auth redirect) must not stop the
      // worker installing — everything else it does still works.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageFirstFromNetwork(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(cacheFirst(request));
  }
});

async function pageFirstFromNetwork(request) {
  try {
    const response = await fetch(request);
    // Only a real page is worth keeping: a redirect to /login cached as the
    // trip room would lock a signed-in user out of their own itinerary.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const fallback = await caches.match('/trips');
    if (fallback) return fallback;

    return new Response('<h1>ออฟไลน์อยู่</h1><p>ลองใหม่เมื่อมีสัญญาณ</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL);
    cache.put(request, response.clone());
  }
  return response;
}
