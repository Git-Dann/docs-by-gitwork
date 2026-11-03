"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/pulse/pulse-overview";

/** Absolute, because the card exists to hand someone a link to paste elsewhere. */
export const PULSE_FEATURES_URL = "https://foundry.gitwork.co.uk/pulse/features";

/**
 * `02 // ABOUT PULSE` — a short summary of what Pulse is, and the shareable page that
 * lists everything it does (`/pulse/features`). The counts are passed in from the
 * server page, so the check registry never reaches the browser and the numbers are the
 * page's own.
 *
 * Replaced the Research studies card. Study is still reachable from a scan's results
 * ("Research study") and at /app/study.
 */
export function PulseAboutPanel({
  checks,
  areas,
  collapsed = false,
  onToggle,
  number = "02",
}: {
  checks: number;
  areas: number;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Section number, so a page can place the card in its own `NN //` sequence. */
  number?: string;
}) {
  const [copied, setCopied] = useState(false);
  const figures = `${checks.toLocaleString("en-GB")} checks · ${areas} areas`;

  function copyUrl() {
    navigator.clipboard.writeText(PULSE_FEATURES_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <article className="widget-card h-full">
      <CardHeader number={number} title="ABOUT PULSE" status="Share" collapsed={collapsed} onToggle={onToggle} />

      {collapsed ? (
        <div className="flex flex-1 items-center justify-between gap-3 p-4">
          <span className="min-w-0 truncate font-mono text-[11px] text-[var(--text-4)]" title={figures}>
            {figures}
          </span>
          <a href={PULSE_FEATURES_URL} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button variant="secondary" size="sm">View ↗</Button>
          </a>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <p className="text-[12px] leading-snug text-[var(--text-4)]">
            Launch-readiness checks for websites, GitHub repos and app-store listings, with a ready /
            not-ready verdict. The page lists every area Pulse checks and everything else it does.
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <dt className="widget-data-label">Checks</dt>
            <dd className="text-right font-mono text-[11px] text-[var(--text-3)]">{checks.toLocaleString("en-GB")}</dd>
            <dt className="widget-data-label">Areas</dt>
            <dd className="text-right font-mono text-[11px] text-[var(--text-3)]">{areas}</dd>
          </dl>

          <div className="mt-3 border-t border-[var(--border-2)] pt-3">
            <p className="text-xs text-[var(--text-3)]">Share this link</p>
            <div className="mt-1 flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2">
              <code title={PULSE_FEATURES_URL} className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-3)]">
                {PULSE_FEATURES_URL}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 text-[11px] font-medium text-[var(--brand-700)] hover:underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <a href={PULSE_FEATURES_URL} target="_blank" rel="noopener noreferrer" className="mt-auto block pt-3">
            <Button variant="secondary" size="sm" className="w-full">Open page ↗</Button>
          </a>
        </div>
      )}
    </article>
  );
}
