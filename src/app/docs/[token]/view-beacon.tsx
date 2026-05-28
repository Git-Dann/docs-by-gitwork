/**
 * Fire-and-forget DocumentView beacon for /docs/[token].
 *
 * Records who viewed the public document share, when, and from where (IP + UA captured
 * server-side). Used by the editor's recent-activity feed.
 */

"use client";

import { useEffect } from "react";

export function DocsViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    const url = `/api/docs/${token}/view`;
    try {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(url);
        return;
      }
    } catch {
      // Fall through to fetch
    }
    void fetch(url, { method: "POST", keepalive: true });
  }, [token]);

  return null;
}
