"use client";

/**
 * Notices when Foundry has been deployed since this tab loaded (§175). Dan, 26 Nov 2026: a tab
 * left open overnight opened the Dispatch panel in yesterday's design, because the page was still
 * running the code it loaded with.
 *
 * It notes the deployed commit when the page loads (`/api/health`), and checks again whenever the
 * tab comes back into view and every 10 minutes. When a newer one is live it shows a small pill
 * with a Refresh button, and the next move to another page reloads instead, so the new version
 * arrives at a natural moment without anyone losing what they were typing.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

const CHECK_EVERY_MS = 10 * 60 * 1000;

async function deployedCommit(): Promise<string | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { commitShort?: string | null };
    return body.commitShort ?? null;
  } catch {
    return null;
  }
}

export function UpdateWatcher() {
  const loaded = useRef<string | null>(null);
  const [stale, setStale] = useState(false);
  const pathname = usePathname();
  const firstPath = useRef(pathname);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const now = await deployedCommit();
      if (cancelled || !now) return;
      if (!loaded.current) loaded.current = now;
      else if (now !== loaded.current) setStale(true);
    };
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(t);
    };
  }, []);

  // Moving to another page while out of date loads it fresh, on the new version.
  useEffect(() => {
    if (stale && pathname !== firstPath.current) window.location.reload();
    firstPath.current = pathname;
  }, [pathname, stale]);

  if (!stale) return null;
  return (
    <div
      role="status"
      className="motion-rise fixed bottom-20 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--border-1)] bg-[var(--surface-0)] py-1.5 pl-4 pr-1.5 text-sm text-[var(--text-2)] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.2)]"
    >
      Foundry has been updated.
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-700)] px-3 py-1 text-xs font-medium text-white transition hover:bg-[var(--brand-800)]"
      >
        <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
        Refresh
      </button>
    </div>
  );
}
