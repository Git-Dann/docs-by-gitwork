"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { usePulseEmbedConfig, useSetPulseEmbedConfig } from "@/hooks/use-pulse";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { DEFAULT_EMBED_CHECK_KEYS } from "@/server/pulse-embed-config";
import { cn } from "@/lib/format";
import { CardHeader } from "@/components/pulse/pulse-overview";

/** Toggle switch — mirrors the pattern used elsewhere (e.g. settings-panel.tsx's dev-rates toggle). */
function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
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
 * `04 // PUBLIC EMBED` — controls for the /embed/pulse widget used on gitwork.co.uk.
 * Collapsed (default): the enabled toggle + a one-line "N checks shown" summary.
 * Expanded: adds a searchable, category-grouped picker for which checks are in the
 * free public teaser (backed by Workspace.pulseEmbedCheckKeys).
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
  const [search, setSearch] = useState("");

  const checkKeys = useMemo(() => new Set(data?.checkKeys ?? DEFAULT_EMBED_CHECK_KEYS), [data?.checkKeys]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, typeof CHECKS_REGISTRY>();
    for (const c of CHECKS_REGISTRY) {
      if (q && !c.key.toLowerCase().includes(q) && !c.label.toLowerCase().includes(q)) continue;
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return map;
  }, [search]);

  function toggleCheck(key: string) {
    const next = new Set(checkKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    save({ checkKeys: [...next] });
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
            {checkKeys.size} check{checkKeys.size === 1 ? "" : "s"} shown on gitwork.co.uk
          </span>
          <ToggleSwitch checked={data.enabled} disabled={isPending} onChange={(v) => save({ enabled: v })} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] leading-snug text-[var(--text-4)]">
              Which checks show in the free /embed/pulse teaser on gitwork.co.uk.
            </p>
            <ToggleSwitch checked={data.enabled} disabled={isPending} onChange={(v) => save({ enabled: v })} />
          </div>

          <div className="relative mt-3">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search checks…"
              className="app-input w-full pl-8 text-xs"
            />
          </div>

          <div className="mt-2 max-h-64 flex-1 overflow-y-auto rounded-[6px] border border-[var(--border-2)]">
            {[...grouped.entries()].map(([category, checks]) => (
              <div key={category} className="border-b border-[var(--border-2)] last:border-b-0">
                <div className="bg-[var(--surface-1)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
                  {category}
                </div>
                {checks.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                  >
                    <input
                      type="checkbox"
                      className="app-checkbox shrink-0"
                      checked={checkKeys.has(c.key)}
                      onChange={() => toggleCheck(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            ))}
            {grouped.size === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[var(--text-4)]">No checks match &quot;{search}&quot;.</p>
            )}
          </div>

          <p className="mt-2 text-[11px] text-[var(--text-4)]">{checkKeys.size} selected</p>
        </div>
      )}
    </article>
  );
}
