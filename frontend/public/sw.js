/* PCHelper (ЛР8) — service worker для PWA.
 *
 * Важно: страница (index.html) не кэшируется навсегда. После обновления
 * сборки имена файлов в /assets меняются, и старая страница ссылается
 * на уже удалённый JavaScript — получается белый экран. Поэтому
 * навигационные запросы идут в сеть, а кэш остаётся запасным вариантом
 * для офлайн-режима.
 */
const CACHE = 'pchelper-v2';

const SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Сначала сеть, потом кэш. Для страниц и API: свежий ответ важнее скорости.
 *
 * @param {Request} request Запрос.
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }
    return Response.error();
  }
}

/**
 * Сначала кэш, потом сеть. Для файлов с хешем в имени: они не меняются.
 *
 * @param {Request} request Запрос.
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Навигация и HTML — всегда пробуем сеть, иначе после обновления
  // приложения остаётся старая страница со ссылками на удалённые файлы.
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
