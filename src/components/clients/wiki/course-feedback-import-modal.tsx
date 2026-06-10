"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useCourseFeedbackCandidates, useImportCourseFeedback } from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

interface Props {
  slug: string;
  onClose: () => void;
}

export function CourseFeedbackImportModal({ slug, onClose }: Props) {
  const { data, isPending } = useCourseFeedbackCandidates(slug, true);
  const importFeedback = useImportCourseFeedback(slug);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  async function handleImport() {
    if (selected.size === 0) return;
    await importFeedback.mutateAsync([...selected]);
    onClose();
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
          <p className="mb-4 text-[13px] text-[var(--text-3)]">
            Support emails titled <span className="font-medium text-[var(--text-2)]">“New Feedback from …”</span>.
            Tick the ones that are course requests — each becomes a draft request with the sender &amp;
            message folded into Notes for you to extract the course name &amp; country.
          </p>

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
        </div>

        <div className="shrink-0 border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--text-4)]">
              {importable.length} importable · {selected.size} selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={selected.size === 0 || importFeedback.isPending}
                className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
              >
                {importFeedback.isPending ? "Importing…" : `Import ${selected.size || ""}`.trim()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
