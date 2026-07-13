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
    <div className="app-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-1)]">Pulse leads</p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            Captured from the public scanner — import to run a full AI scan + proposal.
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-3)]">
          {leads.length}
        </span>
      </div>

      <div className="divide-y divide-[var(--border-2)]">
        {leads.map((lead) => (
          <div key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-1)]">{lead.email}</p>
              <p className="truncate text-xs text-[var(--text-4)]">
                {lead.targetUrl}
                <span className="ml-2 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-4)]">
                  {lead.source}
                </span>
              </p>
            </div>
            {lead.criticalCount != null && lead.criticalCount > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                {lead.criticalCount} critical
              </span>
            )}
            <span className={cn("text-sm font-bold tabular-nums", scoreTone(lead.healthScore))}>
              {lead.healthScore ?? "—"}
            </span>
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
        ))}
      </div>
    </div>
  );
}
