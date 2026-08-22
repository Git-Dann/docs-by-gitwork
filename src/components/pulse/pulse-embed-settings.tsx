"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { usePulseEmbedConfig, useSetPulseEmbedConfig } from "@/hooks/use-pulse";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { DEFAULT_EMBED_CHECK_KEYS } from "@/server/pulse-embed-config";
import { cn } from "@/lib/format";
import { ToggleSwitch } from "@/components/pulse/pulse-embed-panel";

function StatusPill({ ok, okLabel, offLabel }: { ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <span className="widget-header__status">
      <span className={cn("widget-status-dot", ok ? "widget-status-dot--success" : "widget-status-dot--warning")} />
      {ok ? okLabel : offLabel}
    </span>
  );
}

/** `NN // SECTION NAME` widget shell — the Foundry widget-header signature (DESIGN.md). */
function Widget({ number, title, status, children }: { number: string; title: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${title}`}
        </span>
        {status}
      </div>
      <div className="p-4">{children}</div>
    </article>
  );
}

export function PulseEmbedSettings() {
  const { data, isLoading, isError, error, refetch, isFetching } = usePulseEmbedConfig();
  const { mutate: save, isPending } = useSetPulseEmbedConfig();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seededExpanded = useRef(false);
  const [previewKey, setPreviewKey] = useState(0);
  const previewRootRef = useRef<HTMLDivElement>(null);

  const [bookingUrlDraft, setBookingUrlDraft] = useState("");
  const [siteKeyDraft, setSiteKeyDraft] = useState("");
  const [secretKeyDraft, setSecretKeyDraft] = useState("");
  const seededDrafts = useRef(false);
  const [checkKeysError, setCheckKeysError] = useState<string | null>(null);

  const checkKeys = useMemo(() => new Set(data?.checkKeys ?? DEFAULT_EMBED_CHECK_KEYS), [data?.checkKeys]);

  useEffect(() => {
    if (seededExpanded.current || !data) return;
    seededExpanded.current = true;
    setExpanded(new Set(CHECKS_REGISTRY.filter((c) => checkKeys.has(c.key)).map((c) => c.category)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (seededDrafts.current || !data) return;
    seededDrafts.current = true;
    setBookingUrlDraft(data.bookingUrl);
    setSiteKeyDraft(data.turnstileSiteKey ?? "");
  }, [data]);

  function saveBookingUrl() {
    const next = bookingUrlDraft.trim();
    if (next && next !== data?.bookingUrl) save({ bookingUrl: next });
  }

  function saveSiteKey() {
    const next = siteKeyDraft.trim();
    if (next !== (data?.turnstileSiteKey ?? "")) save({ turnstileSiteKey: next });
  }

  function saveSecretKey() {
    const next = secretKeyDraft.trim();
    if (!next) return; // blank means "leave the stored key untouched"
    save({ turnstileSecretKey: next });
    setSecretKeyDraft(""); // never redisplay it, even the value just typed
  }

  // Auto-resize the preview iframe to its content height (same protocol embed.js
  // uses) — same-origin self-embed (src="/embed/pulse"), so both the message
  // origin and its source window are checked against this specific iframe before
  // trusting the payload.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || !previewRootRef.current) return;
      const iframe = previewRootRef.current.querySelector("iframe");
      if (!iframe || e.source !== iframe.contentWindow) return;
      const d = e.data as { type?: string; height?: number };
      if (d?.type === "pulse-embed-height" && typeof d.height === "number") {
        iframe.style.height = `${d.height}px`;
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

  // Saving checkKeys can be rejected server-side (at least one check must stay
  // selected) — surface that instead of letting the checkbox silently "fail to
  // uncheck" with no explanation.
  function saveCheckKeys(next: Set<string>) {
    setCheckKeysError(null);
    save(
      { checkKeys: [...next] },
      {
        onError: (err) => {
          setCheckKeysError(err instanceof Error ? err.message : "Couldn't save — please try again.");
        },
      },
    );
  }

  function toggleCheck(key: string) {
    const next = new Set(checkKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    saveCheckKeys(next);
  }

  function selectAll(checks: typeof CHECKS_REGISTRY) {
    const next = new Set(checkKeys);
    for (const c of checks) next.add(c.key);
    saveCheckKeys(next);
  }

  function clearAll(checks: typeof CHECKS_REGISTRY) {
    const next = new Set(checkKeys);
    for (const c of checks) next.delete(c.key);
    saveCheckKeys(next);
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Couldn&apos;t load the embed config — {error instanceof Error ? error.message : "please try again."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-sm font-medium text-[var(--brand-700)] hover:underline disabled:opacity-50"
        >
          {isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return <p className="text-sm text-[var(--text-4)]">Loading…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
      <div className="space-y-4">
        <Widget number="01" title="STATUS">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-2)] pb-4">
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Public embed enabled</p>
              <p className="mt-0.5 text-xs text-[var(--text-4)]">Off rejects new scans and in-depth-review requests with a friendly &quot;unavailable&quot; message.</p>
            </div>
            <ToggleSwitch checked={data.enabled} disabled={isPending} onChange={(v) => save({ enabled: v })} />
          </div>

          <div className="border-b border-[var(--border-2)] py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--text-1)]">Bot protection (Cloudflare Turnstile)</p>
              <StatusPill ok={data.turnstileConfigured} okLabel="Configured" offLabel="Not configured" />
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-4)]">
              Cloudflare dashboard → Turnstile → Add widget (Managed mode), allow-listing gitwork.co.uk /
              www.gitwork.co.uk / foundry.gitwork.co.uk — then paste both keys here.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--text-3)]">Site key</span>
                <input
                  value={siteKeyDraft}
                  onChange={(e) => setSiteKeyDraft(e.target.value)}
                  onBlur={saveSiteKey}
                  placeholder="0x4AAA..."
                  className="app-input mt-1 w-full text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--text-3)]">Secret key</span>
                <input
                  type="password"
                  value={secretKeyDraft}
                  onChange={(e) => setSecretKeyDraft(e.target.value)}
                  onBlur={saveSecretKey}
                  placeholder={data.turnstileConfigured ? "•••••••• (leave blank to keep)" : "0x4AAA..."}
                  autoComplete="off"
                  className="app-input mt-1 w-full text-sm"
                />
              </label>
            </div>
          </div>

          <div className="border-b border-[var(--border-2)] py-3">
            <p className="text-sm font-medium text-[var(--text-1)]">Free scans</p>
            <p className="widget-timestamp mt-0.5">
              Unlimited to view — no email needed to see a result. One in-depth-review request per
              email address. Abuse is bounded by Turnstile plus per-IP, per-host and total
              concurrency caps (rate-limit.ts), not by withholding results.
            </p>
          </div>

          <div className="pt-3">
            <label className="block">
              <span className="text-sm font-medium text-[var(--text-1)]">&quot;Book a call&quot; CTA link</span>
              <input
                value={bookingUrlDraft}
                onChange={(e) => setBookingUrlDraft(e.target.value)}
                onBlur={saveBookingUrl}
                className="app-input mt-1 w-full text-sm"
              />
            </label>
          </div>
        </Widget>

        <Widget
          number="02"
          title="CHECKS IN THE EMAIL"
          status={<span className="widget-header__status">{checkKeys.size} / {CHECKS_REGISTRY.length}</span>}
        >
          {/* ⚠️ This no longer controls the public scan. It once filtered — and
              RESCORED — what a visitor saw, which made the teaser score a different
              quantity from the paid one. The on-screen report now shows every
              triaged P1/P2 finding and scores the full set like every other surface.
              What this set still drives is the results EMAIL's highlighted findings
              (notifyLeadOfScanResult), so the label says that rather than implying a
              control that no longer exists. */}
          <p className="mb-3 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2 text-xs text-[var(--text-4)]">
            These pick which checks the <strong className="text-[var(--text-3)]">results email</strong> highlights.
            They no longer limit the on-screen report — that shows every triaged finding and scores
            the full check set, so the free number matches the paid one.
          </p>
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search checks…"
              className="app-input w-full pl-8 text-sm"
            />
          </div>

          {checkKeysError && (
            <p role="alert" className="mb-3 text-xs text-red-600">{checkKeysError}</p>
          )}

          <div className="max-h-[32rem] overflow-y-auto rounded-[6px] border border-[var(--border-2)]">
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
                    <span className="widget-data-label flex items-center gap-1.5">
                      {open ? <ChevronDownIcon className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
                      {category}
                      {selectedInCategory > 0 && (
                        <span className="rounded-[4px] bg-[var(--brand-100)] px-1.5 py-px text-[10px] font-bold text-[var(--brand-700)]">
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
        </Widget>
      </div>

      <div className="xl:sticky xl:top-4">
        <Widget
          number="03"
          title="LIVE PREVIEW"
          status={
            <div className="flex items-center gap-3">
              <a
                href="/demo/pulse-embed"
                target="_blank"
                rel="noopener noreferrer"
                className="widget-header__status inline-flex items-center gap-1.5 hover:text-[var(--brand-700)]"
              >
                <ArrowTopRightOnSquareIcon className="size-3.5" />
                View example
              </a>
              <button
                type="button"
                onClick={() => setPreviewKey((k) => k + 1)}
                className="widget-header__status inline-flex items-center gap-1.5 hover:text-[var(--brand-700)]"
              >
                <ArrowPathIcon className="size-3.5" />
                Reload
              </button>
            </div>
          }
        >
          <p className="mb-3 text-xs text-[var(--text-4)]">The real widget — run a scan against your current settings.</p>
          <div ref={previewRootRef} className="overflow-hidden rounded-[8px] border border-[var(--border-2)]">
            <iframe
              key={previewKey}
              src="/embed/pulse"
              title="Gitwork Pulse — public embed preview"
              style={{ width: "100%", minHeight: 620, border: 0, display: "block" }}
            />
          </div>
        </Widget>
      </div>
    </div>
  );
}
