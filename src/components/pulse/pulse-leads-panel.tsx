"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { usePulseLeads, useImportPulseLead, usePulseLeadPreview } from "@/hooks/use-pulse";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PulseCheckStatusIcon, ScoreRing } from "@/components/pulse/pulse-shared";
import { cn, formatRelative } from "@/lib/format";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { PulseLeadView } from "@/server/pulse-lite/leads-admin";

function scoreTone(score: number | null): string {
  if (score == null) return "text-[var(--text-4)]";
  if (score >= 75) return "text-[var(--success-500)]";
  if (score >= 50) return "text-[var(--warning-500)]";
  return "text-[var(--danger-500)]";
}

// Where a scan was started, in words.
const SOURCE_LABELS: Record<string, string> = {
  "gitwork.co.uk": "gitwork.co.uk",
  "production-ready": "Sales page",
  "foundry-demo": "Demo",
  embed: "Embedded scanner",
};

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/** The visitor's report, said in one line: what a teammate needs before replying to them. */
function ReportStatus({ report }: { report: PulseLeadView["report"] }) {
  if (report.state === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-3)]" title={report.sentAt ? new Date(report.sentAt).toLocaleString("en-GB") : undefined}>
        <span className="size-1.5 rounded-full bg-[var(--success-500)]" aria-hidden="true" />
        Report sent{report.sentAt ? ` ${formatRelative(report.sentAt)}` : ""}
      </span>
    );
  }
  if (report.state === "preparing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-3)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--brand-500)]" aria-hidden="true" />
        Report being prepared
      </span>
    );
  }
  if (report.state === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--danger-500)]" title={report.error ?? undefined}>
        <span className="size-1.5 rounded-full bg-[var(--danger-500)]" aria-hidden="true" />
        Report not sent
      </span>
    );
  }
  return <span className="text-xs text-[var(--text-4)]">No report requested</span>;
}

const GROUPS: { key: string; title: string; statuses: string[] }[] = [
  { key: "fail", title: "Failing", statuses: ["FAIL"] },
  { key: "warn", title: "Warnings", statuses: ["WARN"] },
  { key: "unknown", title: "Couldn't be assessed", statuses: ["INCONCLUSIVE", "ERROR", "NOT_TESTED", "EVIDENCE_REQUIRED"] },
  { key: "pass", title: "Passed", statuses: ["PASS"] },
];

/** One status group, closed by default: the list is long and the counts are the summary. */
function CheckGroup({ title, checks }: { title: string; checks: PulseScanCheckInput[] }) {
  const [open, setOpen] = useState(false);
  if (checks.length === 0) return null;
  return (
    <div className="border-b border-[var(--border-2)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--surface-1)]"
      >
        <span className="flex-1 text-sm font-medium text-[var(--text-1)]">{title}</span>
        <span className="font-mono text-xs tabular-nums text-[var(--text-3)]">{checks.length}</span>
        <ChevronDownIcon className={cn("size-4 text-[var(--text-4)] transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul className="pb-2">
          {checks.map((check) => (
            <li key={check.checkKey} className="flex items-start gap-3 px-5 py-2">
              <span className="mt-0.5 w-4 shrink-0 text-center text-sm"><PulseCheckStatusIcon status={check.status} /></span>
              <div className="min-w-0">
                <p className="text-sm text-[var(--text-1)]">{check.label}</p>
                {check.detail && <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-3)]">{check.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-only look at a lead and their free scan. Never imports or runs anything. */
function PulseLeadPreviewModal({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data, isLoading } = usePulseLeadPreview(leadId);
  const counts = (statuses: string[]) => (data?.checks ?? []).filter((c) => statuses.includes(c.status));

  return (
    <Modal open={leadId != null} onClose={onClose} title="Pulse lead" panelClassName="max-w-2xl">
      {isLoading || !data ? (
        <div className="app-dialog-fixed flex items-center justify-center">
          <p className="text-sm text-[var(--text-4)]">Loading…</p>
        </div>
      ) : (
        <div className="app-dialog-fixed flex flex-col">
          <div className="flex items-start gap-4 border-b border-[var(--border-2)] px-5 py-4">
            {data.healthScore != null && <ScoreRing score={data.healthScore} size={64} />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl text-[var(--text-1)]" title={data.name ?? data.email}>
                {data.name ?? data.email}
                {data.business && <span className="text-[var(--text-3)]"> · {data.business}</span>}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-3)]">
                <a href={`mailto:${data.email}`} className="inline-flex items-center gap-1 text-[var(--brand-600)] hover:underline">
                  <EnvelopeIcon className="size-3.5" aria-hidden="true" />
                  {data.email}
                </a>
                <a href={data.targetUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{host(data.targetUrl)}</a>
                <span>{SOURCE_LABELS[data.source] ?? data.source}</span>
                <span>{formatRelative(data.createdAt)}</span>
              </p>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-4 border-b border-[var(--border-2)] text-center">
            {[
              { label: "Failing", n: counts(["FAIL"]).length, tone: "text-[var(--danger-500)]" },
              { label: "Warnings", n: counts(["WARN"]).length, tone: "text-[var(--warning-500)]" },
              { label: "Passed", n: counts(["PASS"]).length, tone: "text-[var(--success-500)]" },
              { label: "Not assessed", n: counts(["INCONCLUSIVE", "ERROR", "NOT_TESTED", "EVIDENCE_REQUIRED"]).length, tone: "text-[var(--text-3)]" },
            ].map((s) => (
              <div key={s.label} className="border-r border-[var(--border-2)] px-2 py-3 last:border-r-0">
                <p className={cn("font-display text-2xl tabular-nums", s.tone)}>{s.n}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {data.checks.length === 0 ? (
              <p className="p-5 text-sm text-[var(--text-4)]">No check data was captured for this scan.</p>
            ) : (
              GROUPS.map((g) => <CheckGroup key={g.key} title={g.title} checks={counts(g.statuses)} />)
            )}
          </div>
          <p className="shrink-0 border-t border-[var(--border-2)] px-5 py-2.5 text-xs text-[var(--text-4)]">
            The free scan they ran. The report they were emailed comes from a full scan, so its numbers can differ.
          </p>
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
          {leads.length} from the public scanner
        </span>
      </div>

      <ul className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[10px] border border-[var(--border-2)]">
        {leads.map((lead) => {
          const running = lead.importedScanStatus === "RUNNING";
          return (
            <li key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-[var(--surface-1)]">
              <span className={cn("w-9 shrink-0 font-display text-xl tabular-nums", scoreTone(lead.healthScore))} title="Free scan score">
                {lead.healthScore ?? "–"}
              </span>
              <div className="min-w-[200px] flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-1)]" title={lead.email}>
                  {lead.name ?? lead.email}
                  {lead.business && <span className="font-normal text-[var(--text-3)]"> · {lead.business}</span>}
                </p>
                <p className="truncate text-xs text-[var(--text-4)]" title={lead.targetUrl}>
                  {host(lead.targetUrl)} · {SOURCE_LABELS[lead.source] ?? lead.source} · {formatRelative(lead.createdAt)}
                  {lead.criticalCount != null && lead.criticalCount > 0 && (
                    <span className="text-[var(--danger-500)]"> · {lead.criticalCount} failing</span>
                  )}
                </p>
              </div>
              <div className="w-[150px] shrink-0">
                <ReportStatus report={lead.report} />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button variant="tertiary" size="sm" onClick={() => setPreviewLeadId(lead.id)}>
                  Preview
                </Button>
                {lead.importedScanId ? (
                  running ? (
                    // The full scan behind their report is still running. Opening it now shows
                    // it mid-run, which reads as "it's scanning again", so say so instead.
                    <Button variant="tertiary" size="sm" disabled title="The full scan for their report is still running">
                      Scan running…
                    </Button>
                  ) : (
                    <Link href={`/app/pulse/${lead.importedScanId}`}>
                      <Button variant="tertiary" size="sm">Open full scan →</Button>
                    </Link>
                  )
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => importLead(lead.id)}
                    loading={isPending && variables === lead.id}
                    title="Runs the full scan (with the AI pass) on their site"
                  >
                    Run full scan
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <PulseLeadPreviewModal leadId={previewLeadId} onClose={() => setPreviewLeadId(null)} />
    </div>
  );
}
