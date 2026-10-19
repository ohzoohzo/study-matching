// 브라우저 푸시 알림을 받는 서비스 워커예요. 서버(/api/recruit/*)가 보낸 { title, body, url }을 알림으로 보여 주고,
// 알림을 누르면 그 스터디 상세(url)를 열어요. 화면이나 데이터는 저장하지 않아요(오프라인 캐시 없음).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "스터디 모집", { body: d.body || "", data: { url: d.url || "/" }, lang: "ko" }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url ? e.notification.data.url : "/", self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      try { await c.navigate(url); } catch (err) { /* 이 창을 옮기지 못하면 새 창으로 열어요 */ return self.clients.openWindow(url); }
      return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
