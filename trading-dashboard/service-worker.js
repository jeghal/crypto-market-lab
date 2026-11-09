const CACHE_NAME = 'cryptowatch-v18';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './journal.html',
  './journal.css',
  './dashboard/journal-page.js',
  './dashboard/signal-journal.js',
  './dashboard/data-health.js',
  './script.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './radar/index.html',
  './radar/assets/css/style.css',
  './radar/assets/js/api.js',
  './radar/assets/js/market-core.js',
  './radar/assets/js/ui.js',
  './radar/assets/js/transforms.js',
  './radar/assets/js/collectors.js',
  './radar/assets/js/main.js',
  './radar/assets/js/vendor/jszip.min.js',
  './radar/Prompt Master Spot.txt',
  './radar/Prompt Strict Backup.txt',
  './radar/Prompt Fast Scan.txt',
  './radar/otoco_prompt.md',
  './dashboard/app.js',
  './dashboard/api.js',
  './dashboard/market-core.js',
  './dashboard/app-teardown.js',
  './dashboard/app-lifecycle.js',
  './dashboard/chart.js',
  './dashboard/chart-interactions-controller.js',
  './dashboard/config.js',
  './dashboard/candle-limit.js',
  './dashboard/dom.js',
  './dashboard/events-controller.js',
  './dashboard/indicators.js',
  './dashboard/indicators.worker.js',
  './dashboard/levels.js',
  './dashboard/listener-registry.js',
  './dashboard/market-sentiment.js',
  './dashboard/momentum-scanner.js',
  './dashboard/notifications.js',
  './dashboard/pwa.js',
  './dashboard/pro-decision-controller.js',
  './dashboard/patterns.js',
  './dashboard/realtime-session-controller.js',
  './dashboard/run-controller.js',
  './dashboard/signal.js',
  './dashboard/signal-shared.js',
  './dashboard/symbol-interval-controller.js',
  './dashboard/screener-controller.js',
  './dashboard/state.js',
  './dashboard/storage.js',
  './dashboard/startup-controller.js',
  './dashboard/trade-calculator.js',
  './dashboard/trade-calculator-controller.js',
  './dashboard/ui.js',
  './dashboard/ui-screener.js',
  './dashboard/ui-decision-explanation.js',
  './dashboard/ui-signal.js',
  './dashboard/ui-scenario.js',
  './dashboard/ui-tooltip.js',
  './dashboard/chart-render.js',
  './dashboard/chart-indicators.js',
  './dashboard/utils.js',
  './dashboard/watchlist.js',
  './dashboard/websocket.js',
  './dashboard/worker-pool.js',
];

// Install — precache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Activate — remove stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Fetch — Cache First for local assets, Network Only for external APIs
function isAppShellRequest(url, request) {
  if (request.mode === 'navigate') return true;
  return PRECACHE_URLS.some(path => url.pathname.endsWith(path.replace(/^\.\//, '/')));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isExternal = url.hostname.includes('binance.com')
    || url.hostname.includes('binance.vision')
    || url.hostname.includes('coingecko.com')
    || url.hostname.includes('alternative.me')
    || url.hostname.includes('fonts.bunny.net');

  // Always hit network for external/API calls
  if (isExternal) return;

  const isCacheableScheme = url.protocol === 'http:' || url.protocol === 'https:';

  // Prefer fresh app code/HTML on deploys; fallback to cache offline.
  if (isAppShellRequest(url, event.request)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (!response.ok) return response;
          if (isCacheableScheme) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response.ok) return response;
        if (isCacheableScheme) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }),
  );
});
