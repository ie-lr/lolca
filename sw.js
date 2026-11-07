/**
 * sw.js - Service Worker for Light of Life Christian Academy (LOLCA)
 * Caches assets for offline performance and supports PWA device installation.
 */

const CACHE_NAME = 'lolca-cache-v3';
const STATIC_ASSETS = [
  './',
  'index.html',
  'admin.html',
  'student.html',
  'assets/css/tokens.css',
  'assets/css/styles.css',
  'assets/js/config.js',
  'assets/js/api.js',
  'assets/js/app.js',
  'assets/images/icon-192.png',
  'assets/images/icon-512.png',
  'assets/images/LOLCA logo circle shape.png',
  'manifest-admin.json',
  'manifest-student.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => cached);
    })
  );
});
