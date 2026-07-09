/* ============================================================
   우리집 칭찬가게 — 서비스 워커
   - 앱 파일: 네트워크 우선 (항상 최신), 오프라인이면 캐시
   - 폰트/SDK 등 외부 파일: 캐시 우선 (빠르고 오프라인 대응)
   - Firebase 실시간 DB 통신은 건드리지 않음
   ============================================================ */

const CACHE = 'praise-cache-v1';

const CORE = [
  '.',
  'index.html',
  'app.js',
  'styles.css',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 알림을 누르면 앱을 앞으로 가져오거나 새로 연다
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow('.');
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 실시간 DB 통신은 캐시하면 안 됨 → 브라우저 기본 동작
  if (url.hostname.endsWith('firebasedatabase.app') || url.hostname.endsWith('firebaseio.com')) return;

  if (url.origin === location.origin) {
    // 앱 파일: 네트워크 우선 → 성공하면 캐시 갱신, 실패(오프라인)하면 캐시
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit =>
            hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
          )
        )
    );
  } else {
    // 외부 파일(폰트, SDK): 캐시 우선 → 없으면 받아서 캐시
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
      )
    );
  }
});
