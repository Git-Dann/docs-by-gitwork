"use client";

import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  DocumentMagnifyingGlassIcon,
  SparklesIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAnalyseBrief } from "@/hooks/use-proof-brief";
import { cn } from "@/lib/format";
import type { BriefConfidence } from "@/types/proof-brief";

const MIN_BRIEF_LENGTH = 50;
const MAX_BRIEF_LENGTH = 20000;

export function ProofWorkspace() {
  const [brief, setBrief] = useState("");
  const [copied, setCopied] = useState(false);
  const mutation = useAnalyseBrief();

  const analysis = mutation.data?.analysis ?? null;
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : null;
  const charCount = brief.length;
  const briefTooShort = charCount > 0 && charCount < MIN_BRIEF_LENGTH;
  const briefTooLong = charCount > MAX_BRIEF_LENGTH;
  const canSubmit = charCount >= MIN_BRIEF_LENGTH && !briefTooLong && !mutation.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    mutation.mutate(brief);
  }

  function handleClear() {
    setBrief("");
    mutation.reset();
  }

  function handleCopySummary() {
    if (!analysis) return;
    const parts: string[] = [];
    if (analysis.projectTitle) parts.push(`Project: ${analysis.projectTitle}`);
    if (analysis.clientName) parts.push(`Client: ${analysis.clientName}`);
    if (analysis.overview) parts.push(`\nOverview\n${analysis.overview}`);
    if (analysis.goals.length) parts.push(`\nGoals\n${analysis.goals.map((g) => `• ${g}`).join("\n")}`);
    if (analysis.deliverables.length) parts.push(`\nDeliverables\n${analysis.deliverables.map((d) => `• ${d}`).join("\n")}`);
    void navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="grid min-h-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Left panel — input */}
      <aside className="space-y-4">
        <section className="app-card p-5">
          <p className="app-eyebrow">Proof</p>
          <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            Brief analysis
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
            {"Paste any client brief — an email, document, or message — and we'll extract the key information your team needs."}
          </p>

          <div className="mt-5 space-y-3">
            <label htmlFor="brief-input" className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
              Client brief
            </label>
            <textarea
              id="brief-input"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={12}
              className="app-input w-full resize-none leading-6"
              placeholder="Paste your client brief here…"
            />
            <div className="flex items-center justify-between text-xs text-[var(--text-4)]">
              <span className={cn(briefTooShort && "text-amber-600", briefTooLong && "text-rose-600")}>
                {charCount.toLocaleString()} / {MAX_BRIEF_LENGTH.toLocaleString()} characters
              </span>
              {briefTooShort && (
                <span className="text-amber-600">Minimum {MIN_BRIEF_LENGTH} characters</span>
              )}
              {briefTooLong && (
                <span className="text-rose-600">Brief too long</span>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full justify-center"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={mutation.isPending}
              leadingIcon={<SparklesIcon className="h-4 w-4" />}
            >
              {mutation.isPending ? "Analysing…" : "Analyse Brief"}
            </Button>

            {errorMessage ? (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {analysis ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={handleClear}
                leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
              >
                Analyse a new brief
              </Button>
            ) : null}
          </div>
        </section>

        <section className="app-muted-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">Tips</p>
          <ul className="mt-3 space-y-2.5">
            {[
              "Works best with full briefs, RFPs, or detailed email threads.",
              "Include any budget, timeline, or technical mentions for richer extraction.",
              "The more context, the higher the confidence score.",
              "Copy the summary to share a clean snapshot with your team.",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2.5 text-sm leading-5 text-[var(--text-3)]">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--brand-500)]/10 text-center text-[10px] font-bold leading-4 text-[var(--brand-700)]">
                  ✓
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {/* Right panel — results */}
      <section className="app-card flex min-h-[600px] flex-col p-5">
        {!analysis ? (
          /* Empty state */
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-2)] bg-white">
                <DocumentMagnifyingGlassIcon className="h-7 w-7 text-[var(--brand-700)]" />
              </div>
              <h4 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                {mutation.isPending ? "Analysing your brief…" : "Paste a brief to get started"}
              </h4>
              <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                {mutation.isPending
                  ? "Claude is reading the brief and extracting key information. This usually takes a few seconds."
                  : "We'll extract goals, deliverables, timeline, budget, and more — laid out clearly for your team."}
              </p>
              {mutation.isPending ? (
                <div className="mx-auto mt-5 flex items-center justify-center gap-2 text-sm text-[var(--brand-600)]">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>Running analysis…</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* Results */
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Results header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-1)] pb-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {analysis.clientName ? (
                    <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                      {analysis.clientName}
                    </span>
                  ) : null}
                  <ConfidenceBadge confidence={analysis.confidence} />
                </div>
                <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  {analysis.projectTitle ?? "Brief Analysis"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<ClipboardDocumentIcon className="h-4 w-4" />}
                  onClick={handleCopySummary}
                >
                  {copied ? "Copied!" : "Copy summary"}
                </Button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--border-2)] bg-white text-[var(--text-4)] transition hover:border-[var(--border-1)] hover:text-[var(--text-2)]"
                  title="Clear results"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Results grid */}
            <div className="mt-4 flex-1 space-y-4 overflow-auto">
              {/* Overview */}
              {analysis.overview ? (
                <ResultCard label="Overview">
                  <p className="italic leading-6 text-[var(--text-2)]">{analysis.overview}</p>
                </ResultCard>
              ) : null}

              {/* Goals + Deliverables */}
              <div className="grid gap-4 sm:grid-cols-2">
                <ResultCard label="Goals" empty={!analysis.goals.length} emptyText="No goals identified">
                  <BulletList items={analysis.goals} />
                </ResultCard>
                <ResultCard label="Deliverables" empty={!analysis.deliverables.length} emptyText="No deliverables identified">
                  <BulletList items={analysis.deliverables} />
                </ResultCard>
              </div>

              {/* Timeline + Budget */}
              {(analysis.timeline ?? analysis.budget) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {analysis.timeline ? (
                    <StatCard label="Timeline" value={analysis.timeline} />
                  ) : null}
                  {analysis.budget ? (
                    <StatCard label="Budget" value={analysis.budget} />
                  ) : null}
                </div>
              ) : null}

              {/* Target audience */}
              {analysis.targetAudience ? (
                <ResultCard label="Target Audience">
                  <p className="leading-6 text-[var(--text-2)]">{analysis.targetAudience}</p>
                </ResultCard>
              ) : null}

              {/* Technical requirements + Success criteria */}
              {(analysis.technicalRequirements.length || analysis.successCriteria.length) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {analysis.technicalRequirements.length ? (
                    <ResultCard label="Technical Requirements">
                      <BulletList items={analysis.technicalRequirements} />
                    </ResultCard>
                  ) : null}
                  {analysis.successCriteria.length ? (
                    <ResultCard label="Success Criteria">
                      <BulletList items={analysis.successCriteria} />
                    </ResultCard>
                  ) : null}
                </div>
              ) : null}

              {/* Key contacts */}
              {analysis.keyContacts.length ? (
                <ResultCard label="Key Contacts">
                  <div className="divide-y divide-[var(--border-2)]">
                    {analysis.keyContacts.map((contact, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-4)]">
                            <UserCircleIcon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-medium text-[var(--text-1)]">{contact.name}</span>
                        </div>
                        <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-3)]">
                          {contact.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </ResultCard>
              ) : null}

              {/* Constraints */}
              {analysis.constraints.length ? (
                <ResultCard label="Constraints">
                  <BulletList items={analysis.constraints} />
                </ResultCard>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: BriefConfidence }) {
  const map: Record<BriefConfidence, { label: string; className: string }> = {
    HIGH: {
      label: "High confidence",
      className: "border-emerald-200 bg-[var(--success-50)] text-emerald-700",
    },
    MEDIUM: {
      label: "Medium confidence",
      className: "border-amber-200 bg-[var(--warning-50)] text-amber-700",
    },
    LOW: {
      label: "Low confidence",
      className: "border-rose-200 bg-[var(--danger-50)] text-rose-700",
    },
  };
  const { label, className } = map[confidence];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

function ResultCard({
  label,
  children,
  empty,
  emptyText,
}: {
  label: string;
  children?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">{label}</p>
      <div className="mt-2.5">
        {empty ? (
          <p className="text-sm text-[var(--text-4)]">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-[var(--text-2)]">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
          {item}
        </li>
      ))}
    </ul>
  );
}
