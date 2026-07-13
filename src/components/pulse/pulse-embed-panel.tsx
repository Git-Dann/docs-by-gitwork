"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { usePulseEmbedConfig, useSetPulseEmbedConfig } from "@/hooks/use-pulse";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { DEFAULT_EMBED_CHECK_KEYS } from "@/server/pulse-embed-config";
import { cn } from "@/lib/format";

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
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-700)] disabled:opacity-50",
        checked ? "bg-[var(--brand-700)]" : "bg-[var(--border-1)]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function PulseEmbedPanel() {
  const { data, isLoading } = usePulseEmbedConfig();
  const { mutate: save, isPending } = useSetPulseEmbedConfig();
  const [pickerOpen, setPickerOpen] = useState(false);
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

  if (isLoading || !data) return null;

  return (
    <div className="app-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-1)]">Public embed</p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            Controls the /embed/pulse widget used on gitwork.co.uk.
          </p>
        </div>
        <ToggleSwitch checked={data.enabled} disabled={isPending} onChange={(v) => save({ enabled: v })} />
      </div>

      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-[8px] border border-[var(--border-2)] px-3 py-2 text-left text-xs font-medium text-[var(--text-3)] hover:bg-[var(--surface-1)]"
      >
        <span>
          Checks shown in the free teaser — <span className="font-semibold text-[var(--text-1)]">{checkKeys.size} selected</span>
        </span>
        {pickerOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
      </button>

      {pickerOpen && (
        <div className="mt-3">
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search checks…"
              className="app-input w-full pl-8 text-xs"
            />
          </div>
          <div className="max-h-80 overflow-y-auto rounded-[8px] border border-[var(--border-2)]">
            {[...grouped.entries()].map(([category, checks]) => (
              <div key={category} className="border-b border-[var(--border-2)] last:border-b-0">
                <div className="bg-[var(--surface-1)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
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
        </div>
      )}
    </div>
  );
}
