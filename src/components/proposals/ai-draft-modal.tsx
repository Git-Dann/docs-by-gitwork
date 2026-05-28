/**
 * "Draft with AI" modal (Sprint 5+6).
 *
 * Operator types a brief — what the engagement is, the client, key constraints — and the
 * server fans it out to Anthropic. The model rewrites every section's data; this modal then
 * applies the patch to the local draft so the next autosave persists it.
 *
 * Optional Pulse scan picker: if the workspace has Pulse scans for the linked client, the
 * model uses the scan's critical gaps + build opportunities to tailor scope and deliverables.
 */

"use client";

import { useState } from "react";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { ProposalDocument } from "@/types/proposal";

interface AiDraftModalProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  onApply: (proposal: ProposalDocument) => void;
}

interface PulseScanListItem {
  id: string;
  projectName: string;
  inputUrl: string | null;
  inputGithubRepo: string | null;
  completedAt: string | null;
}

export function AiDraftModal({ open, onClose, documentId, onApply }: AiDraftModalProps) {
  const [brief, setBrief] = useState("");
  const [pulseScanId, setPulseScanId] = useState<string>("");
  const [scans, setScans] = useState<PulseScanListItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    updated: string[];
    skipped: string[];
  } | null>(null);

  // Lazy-load Pulse scans when the modal opens. Keep this cheap — just the top 25 recent.
  if (open && scans.length === 0 && !error) {
    void apiFetch<{ scans: PulseScanListItem[] }>("/api/pulse/scans?limit=25")
      .then((res) => setScans(res.scans ?? []))
      .catch(() => {
        // Non-fatal — operator just won't see the Pulse picker. Silent fail keeps the modal
        // usable when Pulse isn't set up.
      });
  }

  if (!open) return null;

  async function handleSubmit() {
    if (brief.trim().length < 8) {
      setError("Add a few more sentences to the brief — the model needs context.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        sectionsUpdated: string[];
        sectionsSkipped: string[];
        proposal: ProposalDocument;
      }>(`/api/documents/${documentId}/ai/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          pulseScanId: pulseScanId || undefined,
        }),
      });
      onApply(res.proposal);
      setResult({ updated: res.sectionsUpdated, skipped: res.sectionsSkipped });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setBrief("");
    setPulseScanId("");
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close AI draft modal"
        className="app-dialog-backdrop absolute inset-0"
        onClick={handleClose}
      />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:items-center">
        <div className="app-dialog-panel relative mt-10 w-full max-w-xl overflow-hidden sm:mt-0">
          {/* Header */}
          <div className="widget-header">
            <span className="widget-header-label">DRAFT WITH AI</span>
            <button
              type="button"
              onClick={handleClose}
              className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          {result ? (
            <div className="space-y-4 p-6">
              <div className="rounded-[10px] border border-[var(--success-500)]/30 bg-[var(--success-50)] px-4 py-3">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--success-500)]">
                  DRAFT APPLIED
                </p>
                <p className="mt-1 text-sm text-[var(--text-2)]">
                  {result.updated.length} section{result.updated.length === 1 ? "" : "s"} rewritten.
                  {result.skipped.length > 0
                    ? ` ${result.skipped.length} skipped (the model left them as-is or the shape didn't match).`
                    : ""}
                </p>
              </div>
              <p className="text-sm text-[var(--text-3)]">
                Review the changes in the Builder. AI is a starting point — every section still needs
                your eyes, and any <code>[REVIEW]</code> placeholders are flagged for human attention.
              </p>
              <div className="flex justify-end">
                <Button type="button" variant="primary" size="md" onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-[var(--brand-700)]" />
                <p className="text-sm leading-6 text-[var(--text-2)]">
                  Describe the engagement and the model will fill in a first-pass draft for every section.
                  Existing values are preserved where you don&rsquo;t need a change.
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Brief</span>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="app-textarea"
                  rows={6}
                  placeholder="e.g. We're proposing a 12-week build for Acme — a customer-facing portal in Next.js + Postgres, integrated with their existing Salesforce. Discovery, design, build, launch. Budget around £85k. Two-person Gitwork team."
                  maxLength={5000}
                />
                <span className="text-[11px] text-[var(--text-4)]">
                  {brief.length}/5000
                </span>
              </label>

              {scans.length > 0 ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-2)]">
                    Link a Pulse scan (optional)
                  </span>
                  <select
                    value={pulseScanId}
                    onChange={(e) => setPulseScanId(e.target.value)}
                    className="app-select"
                  >
                    <option value="">No linked scan</option>
                    {scans.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.projectName}{s.inputUrl ? ` · ${s.inputUrl}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[var(--text-4)]">
                    When linked, the model uses the scan&rsquo;s critical gaps + build opportunities
                    to tailor scope and deliverables.
                  </span>
                </label>
              ) : null}

              {error ? (
                <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="md" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleSubmit}
                  loading={submitting}
                  leadingIcon={<SparklesIcon className="h-4 w-4" />}
                >
                  Generate draft
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
