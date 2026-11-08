// 앱 설치(작업 표시줄 고정)용 서비스 워커
// 파일을 저장(캐시)하지 않고 항상 인터넷에서 받아옵니다. 그래서 사이트를 고치면 바로 반영됩니다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 페이지 이동만 처리: 인터넷이 끊겼을 때 안내 문구 표시
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:sans-serif;padding:40px;text-align:center"><h2>인터넷에 연결되어 있지 않습니다</h2><p>연결된 뒤 다시 열어 주세요.</p></body>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

// 알림을 누르면 열려 있는 창을 앞으로 가져오고 관리자 화면으로 이동
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); c.postMessage({ type: "open-admin" }); return; } }
    if (self.clients.openWindow) await self.clients.openWindow("./#/admin");
  })());
});
