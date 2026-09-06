/* 서비스 종료 — 기존 설치 기기의 캐시를 정리하고 서비스 워커를 해제한다 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const windows = await clients.matchAll({ type: 'window' });
    windows.forEach(c => c.navigate(c.url));
  })());
});
