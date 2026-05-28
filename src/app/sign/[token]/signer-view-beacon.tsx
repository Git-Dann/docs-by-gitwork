/**
 * Fire-and-forget POST to /api/sign/[token]/view on mount.
 *
 * Records a SIGNER_VIEWED event on the request's audit log. Idempotent on the server side —
 * `firstViewedAt` is set only on the first view but each fresh load still appends a row.
 *
 * Rendered invisibly inside the public signing page.
 */

"use client";

import { useEffect } from "react";

export function SignerViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    // Use sendBeacon when available so the request survives page-navigation. Fall back to fetch.
    const url = `/api/sign/${token}/view`;
    try {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        // sendBeacon must be passed a Blob/string; empty body is fine — token is in the URL.
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
