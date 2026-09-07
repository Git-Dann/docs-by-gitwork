"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { usePulseEmbedConfig, useSetPulseEmbedConfig } from "@/hooks/use-pulse";
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
  const [previewKey, setPreviewKey] = useState(0);
  const previewRootRef = useRef<HTMLDivElement>(null);

  const [bookingUrlDraft, setBookingUrlDraft] = useState("");
  const [siteKeyDraft, setSiteKeyDraft] = useState("");
  const [secretKeyDraft, setSecretKeyDraft] = useState("");
  const seededDrafts = useRef(false);

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
