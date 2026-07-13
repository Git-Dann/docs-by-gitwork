"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { usePulseEmbedConfig, useSetPulseEmbedConfig } from "@/hooks/use-pulse";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { DEFAULT_EMBED_CHECK_KEYS } from "@/server/pulse-embed-config";
import { cn } from "@/lib/format";
import { ToggleSwitch } from "@/components/pulse/pulse-embed-panel";

const CALENDLY_URL = "https://calendly.com/gitworkgroup/30min";

function StatusPill({ ok, okLabel, offLabel }: { ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />
      {ok ? okLabel : offLabel}
    </span>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="app-card p-5">
      <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-[var(--text-4)]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PulseEmbedSettings() {
  const { data, isLoading } = usePulseEmbedConfig();
  const { mutate: save, isPending } = useSetPulseEmbedConfig();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seededExpanded = useRef(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewRootRef = useRef<HTMLDivElement>(null);

  const checkKeys = useMemo(() => new Set(data?.checkKeys ?? DEFAULT_EMBED_CHECK_KEYS), [data?.checkKeys]);

  useEffect(() => {
    if (seededExpanded.current || !data) return;
    seededExpanded.current = true;
    setExpanded(new Set(CHECKS_REGISTRY.filter((c) => checkKeys.has(c.key)).map((c) => c.category)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Auto-resize the preview iframe to its content height (same protocol embed.js uses).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as { type?: string; height?: number };
      if (d?.type === "pulse-embed-height" && typeof d.height === "number" && previewRootRef.current) {
        const iframe = previewRootRef.current.querySelector("iframe");
        if (iframe) iframe.style.height = `${d.height}px`;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, typeof CHECKS_REGISTRY>();
    for (const c of CHECKS_REGISTRY) {
      if (q && !c.key.toLowerCase().includes(q) && !c.label.toLowerCase().includes(q)) continue;
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    const selectedCountFor = (checks: typeof CHECKS_REGISTRY) => checks.filter((c) => checkKeys.has(c.key)).length;
    return new Map([...map.entries()].sort((a, b) => selectedCountFor(b[1]) - selectedCountFor(a[1])));
  }, [search, checkKeys]);

  const isExpanded = (category: string) => search.trim().length > 0 || expanded.has(category);

  function toggleCategory(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleCheck(key: string) {
    const next = new Set(checkKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    save({ checkKeys: [...next] });
  }

  function selectAll(checks: typeof CHECKS_REGISTRY) {
    const next = new Set(checkKeys);
    for (const c of checks) next.add(c.key);
    save({ checkKeys: [...next] });
  }

  function clearAll(checks: typeof CHECKS_REGISTRY) {
    const next = new Set(checkKeys);
    for (const c of checks) next.delete(c.key);
    save({ checkKeys: [...next] });
  }

  if (isLoading || !data) {
    return <p className="text-sm text-[var(--text-4)]">Loading…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
      <div className="space-y-6">
        <SectionCard title="Status" subtitle="Master switch + setup for the public /embed/pulse widget.">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-2)] pb-4">
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Public embed enabled</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">Off rejects all scan/unlock requests with a friendly &quot;unavailable&quot; message.</p>
            </div>
            <ToggleSwitch checked={data.enabled} disabled={isPending} onChange={(v) => save({ enabled: v })} />
          </div>

          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Bot protection (Cloudflare Turnstile)</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">
                {data.turnstileConfigured
                  ? "Verifying real visitors on both the scan and unlock forms."
                  : "Not set up — verification fails open until NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are added to the environment."}
              </p>
            </div>
            <StatusPill ok={data.turnstileConfigured} okLabel="Configured" offLabel="Not configured" />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-2)] pt-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Free-scan limit</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">One lifetime unlock per email — fixed, not editable here.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-2)] pt-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">&quot;Book a call&quot; CTA</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">{CALENDLY_URL} — fixed, not editable here.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Checks shown in the free teaser" subtitle={`${checkKeys.size} of ${CHECKS_REGISTRY.length} selected`}>
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search checks…"
              className="app-input w-full pl-8 text-sm"
            />
          </div>

          <div className="max-h-[32rem] overflow-y-auto rounded-[8px] border border-[var(--border-2)]">
            {[...grouped.entries()].map(([category, checks]) => {
              const selectedInCategory = checks.filter((c) => checkKeys.has(c.key)).length;
              const open = isExpanded(category);
              return (
                <div key={category} className="border-b border-[var(--border-2)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between gap-2 bg-[var(--surface-1)] px-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">
                      {open ? <ChevronDownIcon className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
                      {category}
                      {selectedInCategory > 0 && (
                        <span className="rounded-full bg-[var(--brand-100)] px-1.5 text-[10px] font-bold text-[var(--brand-700)]">
                          {selectedInCategory}/{checks.length}
                        </span>
                      )}
                    </span>
                    {open && (
                      <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium normal-case tracking-normal">
                        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); selectAll(checks); }} className="text-[var(--brand-700)] hover:underline">
                          All
                        </span>
                        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); clearAll(checks); }} className="text-[var(--text-4)] hover:underline">
                          None
                        </span>
                      </span>
                    )}
                  </button>
                  {open && checks.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-1)]">
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
              );
            })}
            {grouped.size === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[var(--text-4)]">No checks match &quot;{search}&quot;.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="xl:sticky xl:top-4">
        <SectionCard title="Live preview" subtitle="The real widget — try a scan against your current settings.">
          <button
            type="button"
            onClick={() => setPreviewKey((k) => k + 1)}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-700)] hover:underline"
          >
            <ArrowPathIcon className="size-3.5" />
            Reload preview
          </button>
          <div ref={previewRootRef} className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            <iframe
              key={previewKey}
              src="/embed/pulse"
              title="Gitwork Pulse — public embed preview"
              style={{ width: "100%", minHeight: 480, border: 0, display: "block" }}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
