// Service Worker for Facto PWA - V3.1
// Strategy: Network-First (always try to get the latest version)
const CACHE_NAME = 'facto-v3.1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './styles-v2.css',
    './styles-v2.1.css',
    './app.js',
    './manifest.json',
    './assets/sounds/focus_white.wav',
    './assets/sounds/focus_pink.wav',
    './assets/sounds/focus_brown.wav',
    './assets/sounds/focus_rain.wav',
    './assets/sounds/focus_heavy_rain.wav',
    './assets/sounds/focus_ocean.wav',
    './assets/sounds/focus_fire.wav',
    './assets/sounds/focus_wind.wav',
    './assets/sounds/focus_432hz.wav',
    './assets/sounds/focus_528hz.wav',
    './assets/sounds/focus_space.wav',
    './assets/sounds/focus_alpha.wav',
    './assets/sounds/focus_theta.wav',
    './assets/sounds/7 Power Manifesting The Luck Generator.mp3'
];

// Install event - cache files and skip waiting immediately
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Fetch event - NETWORK FIRST, fallback to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Got a fresh response - update the cache
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, responseClone));
                return response;
            })
            .catch(() => {
                // Network failed - serve from cache (offline mode)
                return caches.match(event.request);
            })
    );
});

// Activate event - clean up ALL old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('./')
    );
});
