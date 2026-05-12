/* global self, clients */
// Hostex Auto-Reply service worker — just enough for Web Push.
// No offline caching: we deliberately keep the worker minimal so it never
// serves a stale build.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Hostex 自动回复", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Hostex 自动回复";
  const options = {
    body: data.body || "",
    icon: data.icon || "/apple-icon",
    badge: "/icon.svg",
    tag: data.tag,             // collapse multiple notifications from same convo
    renotify: !!data.tag,      // make sound when a new message comes for an existing tag
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // If a window already shows this url, focus it
      for (const c of all) {
        try {
          const u = new URL(c.url);
          if (u.pathname === url || c.url.endsWith(url)) {
            await c.focus();
            return;
          }
        } catch { /* ignore */ }
      }
      // Otherwise just focus any open window and navigate it
      for (const c of all) {
        if ("focus" in c && "navigate" in c) {
          await c.focus();
          try { await c.navigate(url); } catch { /* ignore */ }
          return;
        }
      }
      // No open windows — open a new one
      await self.clients.openWindow(url);
    })(),
  );
});
