// ======== AA-HUB Service Worker ========
// オフラインキャッシュ・プッシュ通知対応

const CACHE_NAME = 'aahub-v1';
const STATIC_CACHE = 'aahub-static-v1';
const API_CACHE = 'aahub-api-v1';

// アプリシェル - 必ずキャッシュするファイル
const APP_SHELL = [
  '/dashboard',
  '/offline',
];

// キャッシュ対象の静的リソースパターン
const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\/icons\//,
  /\.(?:png|jpg|jpeg|svg|gif|ico|woff2?)$/,
];

// キャッシュ対象のAPIパターン（GET only）
const CACHEABLE_API_PATTERNS = [
  /\/api\/admin\/reports/,
  /\/api\/notifications\/preferences/,
];

// ======== インストール ========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('SW: Failed to cache app shell:', err);
      });
    })
  );
  self.skipWaiting();
});

// ======== アクティベート ========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ======== フェッチ戦略 ========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // POSTリクエストはキャッシュしない
  if (request.method !== 'GET') return;

  // Firebase Auth関連はスキップ
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseapp.com')) return;

  // 静的リソース → Cache First
  if (STATIC_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // キャッシュ可能API → Network First (5秒タイムアウト)
  if (CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(networkFirst(request, API_CACHE, 5000));
    return;
  }

  // ナビゲーション → Network First (オフラインフォールバック)
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // その他 → Network First (3秒タイムアウト)
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, CACHE_NAME, 3000));
  }
});

// ======== Cache First戦略 ========
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ======== Network First戦略 ========
async function networkFirst(request, cacheName, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ======== ナビゲーションハンドラ ========
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // オフラインページにフォールバック
    const offlinePage = await caches.match('/offline');
    if (offlinePage) return offlinePage;

    return new Response(
      '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AA-HUB - オフライン</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;color:#18181b}div{text-align:center;padding:2rem}h1{font-size:1.5rem;margin-bottom:1rem}p{color:#71717a}</style></head><body><div><h1>オフラインです</h1><p>インターネット接続を確認してください。</p><button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#18181b;color:#fff;border:none;border-radius:0.5rem;cursor:pointer">再読み込み</button></div></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// ======== プッシュ通知 ========
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'AA-HUB', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'default',
    data: {
      url: data.actionUrl || '/dashboard',
    },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AA-HUB', options)
  );
});

// ======== 通知クリック ========
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 既存ウィンドウがあればフォーカス
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // なければ新規ウィンドウ
      return self.clients.openWindow(url);
    })
  );
});
