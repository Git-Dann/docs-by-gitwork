"use client";

import { useState } from "react";
import { XMarkIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useCourseFeedbackCandidates, useImportCourseFeedback } from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

interface Props {
  slug: string;
  onClose: () => void;
}

interface ImportSummary {
  created: number;
  skipped: number;
  scanned: number;
  aiUsed: boolean;
}

export function CourseFeedbackImportModal({ slug, onClose }: Props) {
  const { data, isPending } = useCourseFeedbackCandidates(slug, true);
  const importFeedback = useImportCourseFeedback(slug);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const candidates = data?.candidates ?? [];
  const importable = candidates.filter((c) => !c.alreadyImported);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImportAll() {
    const r = await importFeedback.mutateAsync({ aiExtract: true, onlyCourseRequests: true });
    setSummary({ created: r.count, skipped: r.skipped, scanned: r.scanned, aiUsed: r.aiUsed });
  }

  async function handleImportSelected() {
    if (selected.size === 0) return;
    const r = await importFeedback.mutateAsync({ conversationIds: [...selected], aiExtract: true });
    setSummary({ created: r.count, skipped: r.skipped, scanned: r.scanned, aiUsed: r.aiUsed });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[80vh] max-h-[680px] w-full max-w-2xl flex-col rounded-[12px] bg-white shadow-xl">
        <div className="widget-header shrink-0 rounded-t-[12px]">
          <span className="widget-header__label">Import from feedback</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {summary ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <SparklesIcon className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-[15px] font-semibold text-[var(--text-1)]">
                Imported {summary.created} course request{summary.created === 1 ? "" : "s"}
              </p>
              <p className="mt-1 max-w-sm text-[13px] text-[var(--text-3)]">
                Scanned {summary.scanned} feedback item{summary.scanned === 1 ? "" : "s"}
                {summary.skipped > 0 && <> · skipped {summary.skipped} that weren&apos;t course requests</>}.
                {summary.aiUsed
                  ? " Course name & country were auto-filled where detected — review and tidy any blanks."
                  : " AI extraction was unavailable, so these came in unfilled — add course name & country manually."}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-[10px] border border-[var(--brand-500)]/30 bg-[var(--brand-500)]/[0.04] p-3.5">
                <div className="flex items-start gap-2.5">
                  <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                  <p className="text-[12px] leading-5 text-[var(--text-2)]">
                    <span className="font-semibold">Auto-detect &amp; import</span> scans every
                    unimported <span className="font-medium">“New Feedback from …”</span> email, uses AI
                    to keep only genuine course requests, and pre-fills the course name &amp; country —
                    built for batches of dozens at a time. Or tick specific ones below to import just those.
                  </p>
                </div>
              </div>

              {isPending ? (
                <p className="py-16 text-center text-sm text-[var(--text-4)]">Loading feedback…</p>
              ) : candidates.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-14 text-center">
                  <p className="text-[13px] text-[var(--text-4)]">
                    No feedback found. Make sure this client&apos;s support inbox is connected in Care and
                    feedback emails have synced.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {candidates.map((c) => {
                    const isSelected = selected.has(c.conversationId);
                    const date = new Date(c.receivedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    });
                    return (
                      <label
                        key={c.conversationId}
                        className={[
                          "flex cursor-pointer items-start gap-3 rounded-[10px] border bg-white px-4 py-3 transition",
                          c.alreadyImported
                            ? "cursor-default border-[rgba(0,0,0,0.06)] opacity-55"
                            : isSelected
                            ? "border-[var(--brand-500)] ring-1 ring-[var(--brand-500)]/20"
                            : "border-[rgba(0,0,0,0.08)] hover:bg-[var(--surface-1)]",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          disabled={c.alreadyImported}
                          checked={isSelected}
                          onChange={() => toggle(c.conversationId)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-2)] accent-[var(--brand-700)]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--text-1)]">
                              {c.username || "Unknown"}
                            </span>
                            <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                              {date}
                            </span>
                            {c.alreadyImported && (
                              <span className="rounded-[4px] bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
                                Imported
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-[var(--text-3)]">
                            {c.preview || c.subject}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
          {summary ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)]"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[var(--text-4)]">
                {importable.length} importable · {selected.size} selected
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportSelected()}
                  disabled={selected.size === 0 || importFeedback.isPending}
                  className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                >
                  {`Import selected ${selected.size || ""}`.trim()}
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportAll()}
                  disabled={importable.length === 0 || importFeedback.isPending}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  {importFeedback.isPending ? "Importing…" : "Auto-detect & import all"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
