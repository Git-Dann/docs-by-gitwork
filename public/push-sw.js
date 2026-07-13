/* Foundry Web Push service worker.
 * Receives push events (even when Foundry isn't open) and shows a notification;
 * clicking it focuses an existing Foundry tab or opens the deep link. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = {};
  }
  const title = data.title || "Foundry";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: "/foundry-logo.png",
    badge: "/foundry-logo.png",
    data: { url: data.url || "/app" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Prefer an already-open Foundry window; focus it and route to the target.
      for (const win of wins) {
        if (win.url && win.url.includes("/app") && "focus" in win) {
          win.focus();
          if ("navigate" in win) win.navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
