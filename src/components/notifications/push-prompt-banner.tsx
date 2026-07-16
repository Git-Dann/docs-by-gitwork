"use client";

// One-time "turn on push" nudge, shown in the app shell on next load to anyone who
// COULD get browser push but hasn't subscribed yet. Self-hides when push is disabled
// server-side, unsupported, already on, blocked, or dismissed. Dismissal + a taken
// action persist in localStorage so we never nag twice.

import { useEffect, useState } from "react";
import { BellAlertIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useWebPush } from "@/hooks/use-web-push";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "gitwork.push-prompt.dismissed.v1";

export function PushPromptBanner() {
  const { supported, enabled, permission, subscribed, loading, busy, subscribe } = useWebPush();
  // Start hidden to avoid a flash before we've read localStorage / probed support.
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (loading || hidden || !enabled || !supported || subscribed || permission === "denied") {
    return null;
  }

  const remember = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const enable = async () => {
    await subscribe();
    // Whatever the outcome (granted → `subscribed` hides it; dismissed/denied →
    // they made a choice), don't prompt again on future loads.
    remember();
  };

  return (
    <div className="border-b border-[var(--border-2)] bg-[var(--surface-brand)] px-6 py-2.5 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm text-[var(--text-2)]">
          <BellAlertIcon className="h-5 w-5 shrink-0 text-[var(--brand-600)]" />
          <span>
            <strong className="font-semibold text-[var(--text-1)]">Turn on notifications</strong> —
            get task assignments, client requests and updates even when Foundry is closed.
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="primary" size="sm" onClick={() => void enable()} disabled={busy}>
            {busy ? "Enabling…" : "Enable"}
          </Button>
          <button
            type="button"
            onClick={remember}
            aria-label="Not now"
            className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
