"use client";

import { useState } from "react";
import { XMarkIcon, ClipboardIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useCourseIngest, useSetCourseIngest } from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

interface Props {
  slug: string;
  onClose: () => void;
}

export function CourseApiIntakeModal({ slug, onClose }: Props) {
  const { data, isPending } = useCourseIngest(slug, true);
  const setIngest = useSetCourseIngest(slug);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const token = data?.token ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = token ? `${origin}/api/public/course-requests/${token}` : "";

  const curl = token
    ? `curl -X POST ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{"courseName":"Pebble Beach Golf Links","country":"United States","requestedBy":"app","externalRef":"req_123"}'`
    : "";

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const busy = setIngest.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[12px] bg-white shadow-xl">
        <div className="widget-header shrink-0 rounded-t-[12px]">
          <span className="widget-header__label">Course requests · API intake</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="mb-5 text-[13px] leading-6 text-[var(--text-3)]">
            Let an external system push course requests straight into this tracker. POST to the
            tokenised endpoint below — each request lands as <span className="font-medium text-[var(--text-2)]">New</span>,
            ready to batch out to your provider. Requests are de-duped by{" "}
            <span style={{ fontFamily: MONO }}>externalRef</span>, then by course name.
          </p>

          {isPending ? (
            <p className="py-12 text-center text-sm text-[var(--text-4)]">Loading…</p>
          ) : !token ? (
            <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.14)] py-12 text-center">
              <p className="mb-4 text-[13px] text-[var(--text-4)]">API intake is off.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setIngest.mutate({ enabled: true })}
                className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
              >
                {busy ? "Enabling…" : "Enable API intake"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Endpoint */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    Endpoint
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy(endpoint, "endpoint")}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]"
                  >
                    {copied === "endpoint" ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardIcon className="h-3.5 w-3.5" />}
                    {copied === "endpoint" ? "Copied" : "Copy"}
                  </button>
                </div>
                <div
                  className="break-all rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-2)]"
                  style={{ fontFamily: MONO }}
                >
                  <span className="text-[var(--text-4)]">POST </span>
                  {endpoint}
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
                  The token in the URL is the auth — treat it like a secret. Anyone with it can add
                  course requests for this client.
                </p>
              </div>

              {/* curl example */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    Example
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy(curl, "curl")}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]"
                  >
                    {copied === "curl" ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardIcon className="h-3.5 w-3.5" />}
                    {copied === "curl" ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre
                  className="overflow-x-auto rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[#0f1115] px-3 py-2.5 text-[11.5px] leading-5 text-[#d6deeb]"
                  style={{ fontFamily: MONO }}
                >
                  {curl}
                </pre>
                <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-4)]">
                  Fields: <span style={{ fontFamily: MONO }}>courseName</span> (required),{" "}
                  <span style={{ fontFamily: MONO }}>country</span>,{" "}
                  <span style={{ fontFamily: MONO }}>notes</span>,{" "}
                  <span style={{ fontFamily: MONO }}>requestedBy</span>,{" "}
                  <span style={{ fontFamily: MONO }}>externalRef</span>. Send one object, or{" "}
                  <span style={{ fontFamily: MONO }}>{`{"requests":[…]}`}</span> for a batch (up to 200).
                </p>
              </div>
            </div>
          )}
        </div>

        {token && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
            {confirmDisable ? (
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-[12px] text-[var(--text-3)]">
                  Disable intake? The current token stops working immediately.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDisable(false)}
                    className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setIngest.mutate({ enabled: false });
                      setConfirmDisable(false);
                    }}
                    className="rounded-[6px] bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Disable
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDisable(true)}
                  className="text-[12px] font-medium text-red-600 hover:text-red-700"
                >
                  Disable intake
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setIngest.mutate({ enabled: true, rotate: true })}
                    className="rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
                  >
                    {busy ? "Working…" : "Rotate token"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)]"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
