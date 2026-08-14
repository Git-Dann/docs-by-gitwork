"use client";

import { useState } from "react";
import Link from "next/link";
import { usePulseLeads, useImportPulseLead, usePulseLeadPreview } from "@/hooks/use-pulse";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PulseCheckStatusIcon, ScoreRing } from "@/components/pulse/pulse-shared";
import { cn } from "@/lib/format";
import type { PulseCheckStatus, PulseScanCheckInput } from "@/types/pulse";

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-4)]";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

const STATUS_ORDER: PulseCheckStatus[] = ["FAIL", "WARN", "INCONCLUSIVE", "PASS", "SKIPPED", "NOT_APPLICABLE"];

function sortChecks(checks: PulseScanCheckInput[]): PulseScanCheckInput[] {
  return [...checks].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
}

/** Read-only look at a lead's own scan checks — never imports or mutates anything,
 * unlike "Import to Foundry" which kicks off a real, billable full AI scan. */
function PulseLeadPreviewModal({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data, isLoading } = usePulseLeadPreview(leadId);
  const checks = data ? sortChecks(data.checks) : [];

  return (
    <Modal open={leadId != null} onClose={onClose} title="Scan preview" panelClassName="max-w-2xl">
      {isLoading || !data ? (
        <p className="p-6 text-sm text-[var(--text-4)]">Loading…</p>
      ) : (
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex items-center gap-4 border-b border-[var(--border-2)] px-5 py-4">
            {data.healthScore != null && <ScoreRing score={data.healthScore} size={64} />}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text-1)]">{data.email}</p>
              <p className="truncate text-xs text-[var(--text-4)]">{data.targetUrl}</p>
            </div>
          </div>
          <div className="flex-1 divide-y divide-[var(--border-2)] overflow-y-auto">
            {checks.length === 0 ? (
              <p className="p-5 text-sm text-[var(--text-4)]">No check data was captured for this scan.</p>
            ) : (
              checks.map((check) => (
                <div key={check.checkKey} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 shrink-0"><PulseCheckStatusIcon status={check.status} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
                    {check.detail && <p className="mt-0.5 text-xs text-[var(--text-4)]">{check.detail}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PulseLeadsPanel() {
  const { data, isLoading } = usePulseLeads();
  const { mutate: importLead, isPending, variables } = useImportPulseLead();
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);

  const leads = data?.leads ?? [];
  if (isLoading || leads.length === 0) return null; // quietly absent until leads exist

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-1)]">Pulse leads</p>
        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-3)]">
          {leads.length} captured from the public scanner
        </span>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
        {/* Table header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2.5">
          <span className="flex-1 text-xs font-medium text-[var(--text-4)]">Lead</span>
          <span className="hidden w-20 shrink-0 text-xs font-medium text-[var(--text-4)] sm:block">Critical</span>
          <span className="hidden w-10 shrink-0 text-xs font-medium text-[var(--text-4)] sm:block">Score</span>
          <span className="w-[200px] shrink-0" />
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--border-2)]">
          {leads.map((lead) => (
            <div key={lead.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--surface-1)]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-1)]">{lead.email}</p>
                <p className="truncate text-xs text-[var(--text-4)]">
                  {lead.targetUrl}
                  <span className="ml-2 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-4)]">
                    {lead.source}
                  </span>
                </p>
              </div>
              <div className="hidden w-20 shrink-0 sm:block">
                {lead.criticalCount != null && lead.criticalCount > 0 && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                    {lead.criticalCount} critical
                  </span>
                )}
              </div>
              <span className={cn("hidden w-10 shrink-0 text-sm font-bold tabular-nums sm:block", scoreTone(lead.healthScore))}>
                {lead.healthScore ?? "—"}
              </span>
              <div className="flex w-[200px] shrink-0 items-center justify-end gap-2">
                <Button variant="tertiary" size="sm" onClick={() => setPreviewLeadId(lead.id)}>
                  Preview
                </Button>
                {lead.importedScanId ? (
                  <Link href={`/app/pulse/${lead.importedScanId}`}>
                    <Button variant="tertiary" size="sm">View scan →</Button>
                  </Link>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => importLead(lead.id)}
                    loading={isPending && variables === lead.id}
                  >
                    Import
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PulseLeadPreviewModal leadId={previewLeadId} onClose={() => setPreviewLeadId(null)} />
    </div>
  );
}
