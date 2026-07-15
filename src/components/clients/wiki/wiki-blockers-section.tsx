"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { respondToWikiBlocker } from "@/lib/api";
import type { WikiBlockerRecord } from "@/lib/api";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/**
 * "Action needed" — blockers the dev team raised that are waiting on the client. Rendered at the
 * top of the wiki Requests section. In `public` mode the client can reply/provide what's needed;
 * in `internal` mode it's read-only (devs manage the block on the task board itself).
 */
export function WikiBlockersSection({
  blockers,
  mode,
  token,
}: {
  blockers: WikiBlockerRecord[];
  mode: "internal" | "public";
  token?: string;
}) {
  if (blockers.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
        <h3 className="text-sm font-semibold text-[var(--text-1)]">Action needed from you</h3>
        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
          {blockers.length}
        </span>
      </div>
      <p className="mb-3 text-[13px] text-[var(--text-3)]">
        {mode === "public"
          ? "We're waiting on these to move forward. Reply below and we'll pick the work back up."
          : "Blocked tasks waiting on the client. Manage the block on the task itself; the client replies here."}
      </p>
      <div className="flex flex-col gap-2.5">
        {blockers.map((b) => (
          <BlockerCard key={b.taskId} blocker={b} mode={mode} token={token} />
        ))}
      </div>
    </section>
  );
}

function BlockerCard({
  blocker,
  mode,
  token,
}: {
  blocker: WikiBlockerRecord;
  mode: "internal" | "public";
  token?: string;
}) {
  const [response, setResponse] = useState(blocker.blockedResponse ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(blocker.blockedResponseAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replied = Boolean(savedAt);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await respondToWikiBlocker(token, blocker.taskId, response.trim() || null);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-[10px] border border-[var(--border-2)] bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {blocker.category ? (
            <span className="text-[10px] uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {blocker.category}
            </span>
          ) : null}
          <p className="text-sm font-semibold text-[var(--text-1)]">{blocker.title}</p>
        </div>
        <span
          className={
            replied
              ? "shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700"
              : "shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"
          }
        >
          {replied ? "Replied" : "Awaiting you"}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-2)]">
        {blocker.blockedReason}
      </p>

      {mode === "public" ? (
        <div className="mt-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={2}
            className="app-input w-full resize-y text-sm"
            placeholder="Add a note, link, or let us know it's sorted…"
          />
          {error ? <p className="mt-1 text-[12px] text-rose-700">{error}</p> : null}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Sending…" : replied ? "Update reply" : "Mark provided"}
            </button>
            {replied && savedAt ? (
              <span className="text-[12px] text-teal-700">Sent {formatDate(savedAt)} — thanks!</span>
            ) : null}
          </div>
        </div>
      ) : replied ? (
        <div className="mt-2 rounded-[8px] border border-teal-200 bg-teal-50/60 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[1px] text-teal-700" style={{ fontFamily: MONO }}>
            Client replied{savedAt ? ` · ${formatDate(savedAt)}` : ""}
          </p>
          {blocker.blockedResponse ? (
            <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--text-2)]">{blocker.blockedResponse}</p>
          ) : (
            <p className="mt-1 text-[13px] italic text-[var(--text-3)]">Marked provided (no note).</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
