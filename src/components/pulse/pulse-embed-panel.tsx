"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePulseEmbedConfig, useSetPulseEmbedConfig } from "@/hooks/use-pulse";
import { DEFAULT_EMBED_CHECK_KEYS } from "@/server/pulse-embed-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { CardHeader } from "@/components/pulse/pulse-overview";

const EMBED_SNIPPET = '<script async src="https://foundry.gitwork.co.uk/embed/pulse/embed.js"></script>';

/** Toggle switch — mirrors the pattern used elsewhere (e.g. settings-panel.tsx's dev-rates toggle). */
export function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-700)] disabled:opacity-50",
        checked ? "bg-[var(--brand-700)]" : "bg-[var(--border-1)]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

/**
 * `04 // PUBLIC EMBED` — summary + link to the full settings page for the /embed/pulse
 * widget used on gitwork.co.uk. Collapsed: one line + "Manage" button. Expanded: adds
 * a short blurb. The full check-picker, setup status, and live preview live on their
 * own page (/app/pulse/embed) — too much surface for a corner card.
 */
export function PulseEmbedTopCard({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { data, isLoading } = usePulseEmbedConfig();
  const { mutate: save, isPending } = useSetPulseEmbedConfig();
  const [copied, setCopied] = useState(false);

  const checkCount = useMemo(() => (data?.checkKeys ?? DEFAULT_EMBED_CHECK_KEYS).length, [data?.checkKeys]);

  function copySnippet() {
    navigator.clipboard.writeText(EMBED_SNIPPET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <article className="widget-card h-full">
      <CardHeader
        number="04"
        title="PUBLIC EMBED"
        status={data ? (data.enabled ? "Enabled" : "Disabled") : undefined}
        collapsed={collapsed}
        onToggle={onToggle}
      />

      {isLoading || !data ? (
        <div className="flex flex-1 items-center p-4">
          <span className="text-xs text-[var(--text-4)]">Loading…</span>
        </div>
      ) : collapsed ? (
        <div className="flex flex-1 items-center justify-between gap-3 p-4">
          <span className="min-w-0 truncate text-xs text-[var(--text-4)]">
            {checkCount} check{checkCount === 1 ? "" : "s"} shown on gitwork.co.uk
          </span>
          <Link href="/app/pulse/embed" className="shrink-0">
            <Button variant="secondary" size="sm">Manage</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <p className="text-[12px] leading-snug text-[var(--text-4)]">
            The free site-health teaser embedded on gitwork.co.uk — {checkCount} check{checkCount === 1 ? "" : "s"} shown, email-gated findings.
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-3)]">Enabled</span>
            <ToggleSwitch checked={data.enabled} disabled={isPending} onChange={(v) => save({ enabled: v })} />
          </div>

          <div className="mt-3">
            <p className="text-xs text-[var(--text-3)]">Embed snippet</p>
            <div className="mt-1 flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2">
              <code className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-3)]">{EMBED_SNIPPET}</code>
              <button
                type="button"
                onClick={copySnippet}
                className="shrink-0 text-[11px] font-medium text-[var(--brand-700)] hover:underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <Link href="/app/pulse/embed" className="mt-auto block pt-3">
            <Button variant="secondary" size="sm" className="w-full">Manage settings →</Button>
          </Link>
        </div>
      )}
    </article>
  );
}
