"use client";

// Native Web Push (VAPID) client hook — registers the service worker, subscribes
// the browser via PushManager, and syncs the subscription to the server. Powers
// the "Enable push on this device" toggle in notification settings.
//
// All no-ops gracefully when: the browser lacks Push/SW support, no VAPID key is
// configured server-side (enabled=false), or permission is denied.

import { useCallback, useEffect, useState } from "react";

const SW_URL = "/push-sw.js";

type PushStatus = {
  supported: boolean; // browser has serviceWorker + PushManager + Notification
  enabled: boolean; // server has VAPID keys configured
  permission: NotificationPermission | "default";
  subscribed: boolean;
  loading: boolean;
  busy: boolean;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function browserSupportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function useWebPush() {
  const [status, setStatus] = useState<PushStatus>({
    supported: false,
    enabled: false,
    permission: "default",
    subscribed: false,
    loading: true,
    busy: false,
  });

  // Initial probe: server-enabled? already subscribed on this device?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = browserSupportsPush();
      let enabled = false;
      try {
        const res = await fetch("/api/push/public-key", { credentials: "include" });
        if (res.ok) enabled = Boolean((await res.json()).enabled);
      } catch {
        /* ignore */
      }
      let subscribed = false;
      if (supported) {
        try {
          const reg = await navigator.serviceWorker.getRegistration(SW_URL);
          const sub = await reg?.pushManager.getSubscription();
          subscribed = Boolean(sub);
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      setStatus({
        supported,
        enabled,
        permission: supported ? Notification.permission : "default",
        subscribed,
        loading: false,
        busy: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!browserSupportsPush()) return false;
    setStatus((s) => ({ ...s, busy: true }));
    try {
      const keyRes = await fetch("/api/push/public-key", { credentials: "include" });
      const { enabled, publicKey } = (await keyRes.json()) as { enabled: boolean; publicKey: string };
      if (!enabled || !publicKey) return false;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus((s) => ({ ...s, permission, busy: false }));
        return false;
      }

      const reg = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      const ok = res.ok;
      setStatus((s) => ({ ...s, permission, subscribed: ok, busy: false }));
      return ok;
    } catch (err) {
      console.warn("[web-push] subscribe failed", err);
      setStatus((s) => ({ ...s, busy: false }));
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!browserSupportsPush()) return;
    setStatus((s) => ({ ...s, busy: true }));
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setStatus((s) => ({ ...s, subscribed: false, busy: false }));
    } catch {
      setStatus((s) => ({ ...s, busy: false }));
    }
  }, []);

  return { ...status, subscribe, unsubscribe };
}
