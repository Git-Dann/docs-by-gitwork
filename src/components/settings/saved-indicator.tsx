"use client";

import { useEffect, useRef, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { cn } from "@/lib/format";

/**
 * A tiny "Saved · just now" / "Saving…" pip designed to live in a SettingsCard's `right`
 * header slot. Watches a TanStack mutation and shows confirmation that a save actually
 * happened, so users editing free-text fields aren't left guessing whether their changes
 * stuck.
 *
 * Behaviour:
 *   - isPending → "Saving…" (with spinner)
 *   - isError   → "Couldn't save"
 *   - just succeeded → "Saved · just now" for 3 seconds, then quietly disappears
 *   - otherwise → renders nothing (no perma-"Saved" footprint after page load)
 *
 * Uses `submittedAt` to detect *new* successes, not just the "isSuccess" flag (which
 * stays true between mutations and would otherwise leave the pip stuck on after first save).
 */
export function SavedIndicator({
  mutation,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation: UseMutationResult<any, any, any, any>;
  className?: string;
}) {
  const [recentlySaved, setRecentlySaved] = useState(false);
  const lastSeenSubmit = useRef(0);

  useEffect(() => {
    const ts = mutation.submittedAt ?? 0;
    if (!ts || mutation.isPending || mutation.isError) return;
    if (ts > lastSeenSubmit.current) {
      lastSeenSubmit.current = ts;
      setRecentlySaved(true);
      const t = setTimeout(() => setRecentlySaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [mutation.submittedAt, mutation.isPending, mutation.isError]);

  if (mutation.isPending) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]",
          className,
        )}
      >
        <span className="inline-block h-2 w-2 animate-spin rounded-full border border-[var(--text-4)] border-t-transparent" />
        Saving…
      </span>
    );
  }

  if (mutation.isError) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--danger-600)]",
          className,
        )}
        title={(mutation.error as Error | null)?.message ?? undefined}
      >
        Couldn&apos;t save
      </span>
    );
  }

  if (recentlySaved) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]",
          className,
        )}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Saved · just now
      </span>
    );
  }

  return null;
}
