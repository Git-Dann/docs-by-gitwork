"use client";

import Link from "next/link";
import { usePulseLeads, useImportPulseLead } from "@/hooks/use-pulse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-4)]";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

export function PulseLeadsPanel() {
  const { data, isLoading } = usePulseLeads();
  const { mutate: importLead, isPending, variables } = useImportPulseLead();

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
          <span className="w-[136px] shrink-0" />
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
              <div className="flex w-[136px] shrink-0 justify-end">
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
                    Import to Foundry
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
