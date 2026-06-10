"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { CourseRequestRecord } from "@/lib/api";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";
const STATUSES = ["NEW", "SENT", "ADDED", "REJECTED"] as const;
const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  SENT: "Sent",
  ADDED: "Added",
  REJECTED: "Rejected",
};

const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]";
const fieldInput =
  "w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20";

export interface CourseRequestPayload {
  courseName: string;
  country?: string | null;
  notes?: string | null;
  status: string;
}

interface Props {
  initial?: CourseRequestRecord;
  onSave: (payload: CourseRequestPayload) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

export function CourseRequestForm({ initial, onSave, onClose, isSaving }: Props) {
  const isEditing = !!initial;
  const [courseName, setCourseName] = useState(initial?.courseName ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "NEW");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseName.trim()) {
      setError("Course name is required");
      return;
    }
    setError(null);
    await onSave({
      courseName: courseName.trim(),
      country: country.trim() || null,
      notes: notes.trim() || null,
      status,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-[12px] bg-white shadow-xl">
        <div className="widget-header shrink-0 rounded-t-[12px]">
          <span className="widget-header__label">{isEditing ? "Edit Request" : "Add Request"}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Course name
                </label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. St Andrews Old Course"
                  className={fieldInput}
                  autoFocus
                />
              </div>
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Country{" "}
                  <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Scotland"
                  className={fieldInput}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={fieldLabel} style={{ fontFamily: MONO }}>
                Status
              </label>
              <div className="flex flex-wrap overflow-hidden rounded-[6px] border border-[var(--border-2)]">
                {STATUSES.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={[
                      "flex-1 px-3 py-2 text-[13px] font-medium transition",
                      i > 0 ? "border-l border-[var(--border-2)]" : "",
                      status === s
                        ? "bg-[var(--text-1)] text-white"
                        : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                    ].join(" ")}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className={fieldLabel} style={{ fontFamily: MONO }}>
                Notes{" "}
                <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                placeholder="Original feedback, provider response, why rejected…"
                className={`${fieldInput} resize-y`}
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
            {error && (
              <p className="mb-3 rounded-[6px] bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
              >
                {isSaving ? "Saving…" : isEditing ? "Save changes" : "Add request"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
