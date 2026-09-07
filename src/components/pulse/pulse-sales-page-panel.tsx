"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/pulse/pulse-overview";

/**
 * The public sales page's canonical URL.
 *
 * Absolute, not a relative `/production-ready`, because the job this card exists to do is
 * hand someone a link to paste into gitwork.co.uk — a relative path is useless there.
 */
const SALES_PAGE_URL = "https://foundry.gitwork.co.uk/production-ready";

/**
 * `03 // SALES PAGE` — the second door to the free scanner.
 *
 * There are two entry points to the same tool and they convert differently, so both get a
 * card: this one is the standalone page gitwork.co.uk links TO, `04 // PUBLIC EMBED` is
 * the widget that gets dropped INTO a page. Same scanner, same triaged findings; what
 * differs is who is holding the page.
 *
 * Replaced the Starters card in this row. Starters already has its own front door — the
 * mono `· STARTERS` link in the HQ context strip — and a library of reusable prompts was
 * never really a sibling of "how the outside world reaches Pulse", which is what the other
 * three cards are about.
 */
export function PulseSalesPagePanel({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText(SALES_PAGE_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <article className="widget-card h-full">
      <CardHeader number="03" title="SALES PAGE" status="Live" collapsed={collapsed} onToggle={onToggle} />

      {collapsed ? (
        <div className="flex flex-1 items-center justify-between gap-3 p-4">
          <span className="min-w-0 truncate font-mono text-[11px] text-[var(--text-4)]">
            /production-ready
          </span>
          <a href={SALES_PAGE_URL} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button variant="secondary" size="sm">View ↗</Button>
          </a>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <p className="text-[12px] leading-snug text-[var(--text-4)]">
            A public page selling the free check, for gitwork.co.uk to link to — the second
            door to the same scanner the embed serves. Paste a URL, get the score, every
            triaged finding with its evidence, and what could not be established. No signup,
            no email. The in-depth review is the ask.
          </p>

          <div className="mt-3">
            <p className="text-xs text-[var(--text-3)]">Link to it from gitwork.co.uk</p>
            <div className="mt-1 flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2">
              <code title={SALES_PAGE_URL} className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-3)]">{SALES_PAGE_URL}</code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 text-[11px] font-medium text-[var(--brand-700)] hover:underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[var(--border-2)] pt-3">
            <dt className="widget-data-label">Scanner</dt>
            <dd className="text-right text-[11px] text-[var(--text-3)]">Same as the embed</dd>
            <dt className="widget-data-label">Email</dt>
            <dd className="text-right text-[11px] text-[var(--text-3)]">Not required</dd>
            <dt className="widget-data-label">Attribution</dt>
            <dd className="text-right font-mono text-[11px] text-[var(--text-3)]">production-ready</dd>
          </dl>

          {/* One button, because there is only one real destination. A second
              "Leads" button pointed at /app/pulse/leads, which does not exist —
              the leads panel is further down THIS page. */}
          <a href={SALES_PAGE_URL} target="_blank" rel="noopener noreferrer" className="mt-auto block pt-3">
            <Button variant="secondary" size="sm" className="w-full">Open page ↗</Button>
          </a>
        </div>
      )}
    </article>
  );
}
