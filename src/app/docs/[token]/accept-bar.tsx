/**
 * In-page accept / decline control for the public /docs/[token] view (Phase 1).
 *
 * The conversion event. Posts to /api/docs/[token]/accept, which flips the document status to
 * ACCEPTED / DECLINED and fires the Slack alert that win-rate is computed from. Renders a
 * confirmation state once the client has responded (including on revisits, from the server-passed
 * initialStatus) so they can't double-submit.
 */

"use client";

import { useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

type Decision = "ACCEPTED" | "DECLINED" | "PENDING";

export function DocsAcceptBar({
  token,
  initialStatus,
}: {
  token: string;
  initialStatus: Decision;
}) {
  const [status, setStatus] = useState<Decision>(initialStatus);
  const [mode, setMode] = useState<"idle" | "accept" | "decline">("idle");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "accept" | "decline") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: name.trim() || undefined, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      setStatus(action === "accept" ? "ACCEPTED" : "DECLINED");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "ACCEPTED") {
    return (
      <div className="border-t border-[var(--border-2)] bg-[var(--success-50)]">
        <div className="mx-auto flex max-w-[880px] items-center gap-3 px-4 py-8 sm:px-6">
          <CheckCircleIcon className="h-7 w-7 shrink-0 text-[var(--success-500)]" />
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--success-600,#15803d)]">
              ACCEPTED
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-2)]">
              Thank you — your acceptance has been sent to the Gitwork team. We&rsquo;ll be in touch
              to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "DECLINED") {
    return (
      <div className="border-t border-[var(--border-2)] bg-[var(--surface-1)]">
        <div className="mx-auto max-w-[880px] px-4 py-8 sm:px-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-3)]">
            RESPONSE RECORDED
          </p>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            Thanks for letting us know. Your Gitwork contact will follow up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--border-2)] bg-white">
      <div className="mx-auto max-w-[880px] px-4 py-10 sm:px-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
          YOUR DECISION
        </p>
        <h3 className="mt-2 font-[family-name:var(--font-display)] text-[24px] font-normal leading-[1.2] tracking-[-0.3px] text-[var(--text-1)]">
          Ready to move forward?
        </h3>

        {mode === "idle" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("accept")}
              className="app-button app-button-primary app-button-md"
            >
              Accept proposal
            </button>
            <button
              type="button"
              onClick={() => setMode("decline")}
              className="app-button app-button-secondary app-button-md"
            >
              Not right now
            </button>
          </div>
        ) : (
          <div className="mt-4 max-w-md space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className="app-input w-full"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "accept" ? "Anything to add? (optional)" : "Reason (optional)"}
              rows={2}
              className="app-textarea w-full"
            />
            {error ? <p className="text-sm text-[var(--danger-500)]">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(mode === "accept" ? "accept" : "decline")}
                className={`app-button app-button-md ${
                  mode === "accept" ? "app-button-primary" : "app-button-secondary"
                }`}
              >
                {submitting
                  ? "Sending…"
                  : mode === "accept"
                    ? "Confirm acceptance"
                    : "Send response"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setMode("idle");
                  setError(null);
                }}
                className="app-button app-button-secondary app-button-md"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
