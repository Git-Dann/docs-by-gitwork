"use client";

/**
 * A developer's Code side, on their Staff page (docs/hr-platform.md, "One page per developer"):
 * GitHub, stack and links, Bench or Off Bench, their monthly rate (rate-gated), the clients
 * they're on, the CV and the edit-dev dialog. Plus their notes. What used to be a second page
 * at /app/codeclear/candidates/[id], which now sends team members here.
 *
 * The pieces are the Hiring review's own (candidate-parts.tsx), so the two can't drift.
 */

import { useState } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { CvModal } from "@/components/codeclear/cv-modal";
import { CurrentClientPicker } from "@/components/codeclear/current-client-picker";
import { AvailabilityBadge, CandidateNotes, EditDevModal, ExternalLinks } from "@/components/codeclear/candidate-parts";
import { HeaderAction } from "@/components/staff/profile-parts";
import { useBulkUpdateCodeClearCandidates, useCodeClearCandidate } from "@/hooks/use-codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney, useUsdToGbpRate } from "@/hooks/use-fx";

function Readout({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="widget-data-label text-[var(--text-4)]">{label}</p>
      <p className="mt-1 text-[15px] text-[var(--text-1)]">
        {value}
        {sub ? <span className="ml-1.5 font-mono text-[11px] text-[var(--text-4)]">{sub}</span> : null}
      </p>
    </div>
  );
}

export function DeveloperCard({ recordId, number }: { recordId: string; number: string }) {
  const query = useCodeClearCandidate(recordId);
  const clients = useClientList();
  const bulk = useBulkUpdateCodeClearCandidates();
  const { canViewRates, canManageCode, isAdminOrAbove } = usePermissions();
  const fx = useUsdToGbpRate();
  const fxRate = canViewRates ? fx.data?.rate ?? null : null;
  const [editing, setEditing] = useState(false);
  const [cv, setCv] = useState(false);
  const c = query.data?.candidate ?? null;

  const actions = c && canManageCode ? (
    <span className="flex items-center gap-3">
      <HeaderAction onClick={() => setCv(true)} label="Open their CV">
        CV
      </HeaderAction>
      <HeaderAction onClick={() => setEditing(true)} label="Edit developer details">
        Edit
      </HeaderAction>
    </span>
  ) : undefined;

  return (
    <WidgetCard number={number} name="Developer" action={actions}>
      {query.isPending ? (
        <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
      ) : !c ? (
        <p role="alert" className="text-[13px] text-[var(--danger-500)]">
          {query.error instanceof Error ? query.error.message : "Could not load their developer details"}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--text-3)]">
            <AvailabilityBadge availability={c.availability} />
            <a
              href={`https://github.com/${c.githubHandle}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-mono text-[var(--brand-700)] hover:underline"
            >
              @{c.githubHandle}
              <ArrowTopRightOnSquareIcon aria-hidden className="h-3 w-3" />
            </a>
            <span>{[c.primaryStack, ...c.techStacks.filter((t) => t !== c.primaryStack)].filter(Boolean).slice(0, 4).join(", ")}</span>
            {c.location ? <span className="whitespace-nowrap">· {c.location}</span> : null}
            {c.timezone ? <span className="whitespace-nowrap">· {c.timezone}</span> : null}
          </div>
          <ExternalLinks linkedinUrl={c.linkedinUrl} cvUrl={c.cvUrl} portfolioUrl={c.portfolioUrl} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-end justify-between gap-3">
              <Readout
                label="Group"
                value={c.devGroup === "PRO_BONO" ? "Off Bench" : "Bench"}
                sub={c.devGroup === "PRO_BONO" ? "Free to the business" : undefined}
              />
              {isAdminOrAbove ? (
                <button
                  type="button"
                  className="shrink-0 text-[12px] text-[var(--brand-600)] hover:underline disabled:opacity-50"
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({ action: "SET_DEV_GROUP", ids: [c.id], devGroup: c.devGroup === "PRO_BONO" ? "BENCH" : "PRO_BONO" })
                  }
                >
                  Move to {c.devGroup === "PRO_BONO" ? "Bench" : "Off Bench"}
                </button>
              ) : null}
            </div>
            {canViewRates ? (
              <Readout
                label="Monthly"
                value={c.monthlyRate != null && c.monthlyRateCurrency ? formatMoney(c.monthlyRate, c.monthlyRateCurrency) : "—"}
                sub={
                  c.monthlyRate != null && c.monthlyRateCurrency?.toUpperCase() === "USD" && fxRate != null
                    ? `≈ ${formatMoney(c.monthlyRate * fxRate, "GBP")}`
                    : undefined
                }
              />
            ) : null}
          </div>

          {canManageCode ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Current clients</p>
              <div className="mt-2">
                <CurrentClientPicker
                  candidateId={c.id}
                  candidateName={c.name}
                  currentClients={c.currentClients}
                  clients={clients.data?.clients ?? []}
                  clientsLoading={clients.isLoading}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
      {c && editing ? <EditDevModal candidate={c} onClose={() => setEditing(false)} /> : null}
      {c ? <CvModal open={cv} onClose={() => setCv(false)} candidateId={c.id} candidateName={c.name} /> : null}
    </WidgetCard>
  );
}

/** Notes about a developer, on their Staff page. */
export function DeveloperNotesCard({ recordId, number }: { recordId: string; number: string }) {
  const query = useCodeClearCandidate(recordId);
  const c = query.data?.candidate ?? null;
  return (
    <WidgetCard number={number} name="Notes" status={c ? (c.notes.length ? String(c.notes.length) : "Empty") : undefined} statusTone="muted">
      {c ? <CandidateNotes candidate={c} /> : <p className="text-[13px] text-[var(--text-3)]">Loading…</p>}
    </WidgetCard>
  );
}
