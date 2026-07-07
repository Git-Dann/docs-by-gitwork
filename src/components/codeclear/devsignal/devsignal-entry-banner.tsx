"use client";

import Link from "next/link";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * Entry point into DevSignal from the Code landing page. DevSignal is surfaced
 * *within* Code (no new top-level sidebar item) — vetted candidates flow into
 * the Code roster only after a human promotion.
 */
export function DevSignalEntryBanner() {
  const { canManageDevSignal } = usePermissions();
  if (!canManageDevSignal) return null;

  return (
    <Link
      href="/app/codeclear/devsignal"
      className="mb-6 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 transition hover:border-blue-300 hover:bg-blue-100"
    >
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-600">DevSignal</p>
        <p className="mt-0.5 text-sm font-medium text-neutral-900">Developer vetting &amp; staging review</p>
        <p className="text-sm text-neutral-500">
          Assess candidates through the pipeline, then promote the right ones into Code.
        </p>
      </div>
      <span className="font-mono text-sm text-blue-600">Open →</span>
    </Link>
  );
}
