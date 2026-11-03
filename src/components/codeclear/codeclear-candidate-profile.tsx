"use client";

import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CvModal } from "./cv-modal";
import { Avatar } from "@/components/ui/avatar";
import {
  useBulkUpdateCodeClearCandidates,
  useCodeClearCandidate,
  useDeleteCodeClearCandidate,
} from "@/hooks/use-codeclear";
import { CurrentClientPicker } from "@/components/codeclear/current-client-picker";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney, useUsdToGbpRate } from "@/hooks/use-fx";
import { cn, formatDate } from "@/lib/format";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { AvailabilityBadge, CandidateNotes, EditDevModal, ExternalLinks, HeroStat } from "@/components/codeclear/candidate-parts";
import { Skeleton, SkeletonBlock } from "@/components/ui/motion/skeleton";

/**
 * Full-page dev profile. Replaces the old drawer with a calmer, dedicated
 * surface for everything we know about a single dev — identity, current
 * engagement, calibre breakdown, validation checks, history, notes.
 *
 * Edit is a modal-ish overlay using the shared CandidateProfileForm so the
 * profile page stays read-mode by default.
 *
 * ⚠️ This is now the page for EXTERNAL (Hiring) candidates only. Anyone on the team is sent to
 * their Staff page, which carries the same developer parts (candidate-parts.tsx) beside their
 * HR record: one page per developer. Staff deliberately leaves Hiring's candidates out.
 */
export function CodeClearCandidateProfile({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const candidateQuery = useCodeClearCandidate(candidateId);
  const clientsQuery = useClientList();
  const deleteCandidate = useDeleteCodeClearCandidate();
  const bulkUpdate = useBulkUpdateCodeClearCandidates();

  const candidate = candidateQuery.data?.candidate ?? null;
  const clients = clientsQuery.data?.clients ?? [];

  const { canViewRates, canManageCode, isAdminOrAbove } = usePermissions();
  // Live USD→GBP rate so the Monthly hero stat can show the GBP
  // conversion underneath. Only fetched when the viewer can see rates.
  const fxQuery = useUsdToGbpRate();
  const fxRate = canViewRates ? fxQuery.data?.rate ?? null : null;
  const [showEdit, setShowEdit] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // One page per developer: someone on the team has their Staff page, with these same parts.
  const teamMember = candidate !== null && candidate.origin !== "EXTERNAL";
  useEffect(() => {
    if (teamMember) router.replace(`/app/staff/${encodeURIComponent(candidateId)}`);
  }, [teamMember, router, candidateId]);

  if (candidateQuery.isLoading || teamMember) {
    return <ProfileSkeleton />;
  }

  if (!candidate) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-[var(--text-1)]">Dev not found</p>
        <p className="mt-2 text-sm text-[var(--text-4)]">
          They may have been deleted, or you may not have access.
        </p>
        <div className="mt-4">
          <Link href="/app/codeclear/candidates">
            <Button type="button" variant="secondary" size="sm">
              Back to candidates
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  async function confirmDelete() {
    await deleteCandidate.mutateAsync(candidateId);
    router.push("/app/codeclear/candidates");
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/app/codeclear/candidates"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-3)] hover:text-[var(--text-1)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to candidates
      </Link>

      {/* Hero */}
      <section className="app-card overflow-hidden">
        <div className="border-b border-[var(--border-2)] bg-[linear-gradient(180deg,var(--surface-brand-soft)_0%,var(--surface-0)_100%)] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {/* Falls back to initials if the stored avatar URL is dead. */}
              <Avatar src={candidate.avatarUrl} name={candidate.name} size={64} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-1)]">
                    {candidate.name}
                  </h1>
                  <AvailabilityBadge availability={candidate.availability} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-4)]">
                  <a
                    href={`https://github.com/${candidate.githubHandle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[var(--brand-700)] hover:underline"
                  >
                    @{candidate.githubHandle}
                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                  </a>
                  <span>{candidate.primaryStack}</span>
                  {candidate.location ? <span>· {candidate.location}</span> : null}
                  {candidate.timezone ? <span>· {candidate.timezone}</span> : null}
                </div>
                <ExternalLinks
                  linkedinUrl={candidate.linkedinUrl}
                  cvUrl={candidate.cvUrl}
                  portfolioUrl={candidate.portfolioUrl}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Admin-only: move this dev between Bench and Off Bench
                  in one click. Same SET_DEV_GROUP server action the
                  list-page bulk bar uses. */}
              {isAdminOrAbove ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    bulkUpdate.mutate({
                      action: "SET_DEV_GROUP",
                      ids: [candidate.id],
                      devGroup: candidate.devGroup === "PRO_BONO" ? "BENCH" : "PRO_BONO",
                    })
                  }
                  loading={bulkUpdate.isPending}
                >
                  Move to {candidate.devGroup === "PRO_BONO" ? "Bench" : "Off Bench"}
                </Button>
              ) : null}
              {canManageCode ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leadingIcon={<DocumentTextIcon className="h-3.5 w-3.5" />}
                    onClick={() => setShowCv(true)}
                  >
                    CV
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    leadingIcon={<PencilIcon className="h-3.5 w-3.5" />}
                    onClick={() => setShowEdit(true)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    leadingIcon={<TrashIcon className="h-3.5 w-3.5" />}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats strip + current client. Hourly rate is hidden for users without
            `code.viewRates` — the grid column count follows the visible count so the
            row always fills evenly (no empty cell). */}
        <div
          className={cn(
            "grid gap-0",
            canViewRates ? "sm:grid-cols-2" : "sm:grid-cols-1",
          )}
        >
          {/* Hero stats — Tier dropped (CodeClear concept, not used).
              Group + Monthly are the two signals that actually matter
              for team mgmt today. */}
          <HeroStat
            label="Group"
            value={candidate.devGroup === "PRO_BONO" ? "Off Bench" : "Bench"}
            sub={candidate.devGroup === "PRO_BONO" ? "Free to Gitwork" : undefined}
          />
          {canViewRates ? (
            <HeroStat
              label="Monthly"
              value={
                candidate.monthlyRate != null && candidate.monthlyRateCurrency
                  ? formatMoney(candidate.monthlyRate, candidate.monthlyRateCurrency)
                  : "—"
              }
              sub={
                candidate.monthlyRate != null &&
                candidate.monthlyRateCurrency?.toUpperCase() === "USD" &&
                fxRate != null
                  ? `≈ ${formatMoney(candidate.monthlyRate * fxRate, "GBP")}`
                  : undefined
              }
            />
          ) : null}
        </div>

        {/* Current clients (multi-select) */}
        <div className="border-t border-[var(--border-2)] px-6 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="widget-data-label mt-1.5">Current clients</span>
            <CurrentClientPicker
              candidateId={candidate.id}
              candidateName={candidate.name}
              currentClients={candidate.currentClients}
              clients={clients}
              clientsLoading={clientsQuery.isLoading}
            />
          </div>
        </div>
      </section>

      {/* CALIBRE BREAKDOWN + VALIDATION CHECKS sections removed in
          June 2026 — CodeClear scoring isn't running, so the sub-score
          breakdown and the "No data" checks block were dead weight.
          Profile now flows hero → engagements → notes. */}

      {/* Engagement history — placements past, present, and future.
          Active engagements get an emerald dot; upcoming amber;
          past grey. Allocation % is shown when set so admins can see
          if a dev is split across multiple clients. */}
      <WidgetCard
        number="02"
        name="ENGAGEMENTS"
        status={
          candidate.placements.length > 0
            ? `${candidate.placements.length} ${
                candidate.placements.length === 1 ? "PLACEMENT" : "PLACEMENTS"
              }`
            : "NONE YET"
        }
        statusTone="muted"
      >
        {candidate.placements.length ? (
          <ol className="space-y-2">
            {candidate.placements.map((placement) => {
              const nowMs = Date.now();
              const startMs = new Date(placement.startDate).getTime();
              const endMs = placement.endDate
                ? new Date(placement.endDate).getTime()
                : null;
              const isPast = endMs !== null && endMs < nowMs;
              const isUpcoming = !isPast && startMs > nowMs;
              const isActive = !isPast && !isUpcoming;
              return (
                <li
                  key={placement.id}
                  className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3"
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      isPast
                        ? "bg-[var(--text-4)]"
                        : isUpcoming
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                    aria-hidden
                    title={isPast ? "Past" : isUpcoming ? "Upcoming" : "Active"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {placement.clientName}
                      </p>
                      <span className="text-xs text-[var(--text-4)]">·</span>
                      <p className="truncate text-xs text-[var(--text-3)]">
                        {placement.projectName}
                      </p>
                      <span className="ml-auto inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
                        {placement.allocationPercent}%
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-[var(--text-4)]">
                      {formatDate(placement.startDate)}
                      {placement.endDate
                        ? ` → ${formatDate(placement.endDate)}`
                        : " → present"}
                      {isActive ? (
                        <span className="ml-2 text-emerald-700">Active</span>
                      ) : isUpcoming ? (
                        <span className="ml-2 text-amber-700">Upcoming</span>
                      ) : null}
                    </p>
                    {placement.notes ? (
                      <p className="mt-1 text-xs italic text-[var(--text-4)]">
                        {placement.notes}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-4 text-center text-sm text-[var(--text-4)]">
            No placements yet. Assign a client above to open one.
          </p>
        )}
      </WidgetCard>

      {/* Contact — email (mailto) link. Surfaces the dev's @gitwork.co.uk
          (or external) email front-and-centre so admins can reach them
          without digging through Slack. */}
      {candidate.email ? (
        <WidgetCard number="03" name="CONTACT" status="" statusTone="muted">
          <a
            href={`mailto:${candidate.email}`}
            className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-2)] transition hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]"
          >
            <EnvelopeIcon className="h-4 w-4" />
            {candidate.email}
          </a>
        </WidgetCard>
      ) : null}

      {/* Notes */}
      <WidgetCard
        number={candidate.email ? "04" : "03"}
        name="NOTES"
        status={candidate.notes.length > 0 ? `${candidate.notes.length}` : "EMPTY"}
        statusTone="muted"
      >
        <CandidateNotes candidate={candidate} />
      </WidgetCard>

      {/* Edit modal */}
      <CvModal
        open={showCv}
        onClose={() => setShowCv(false)}
        candidateId={candidate.id}
        candidateName={candidate.name}
      />

      {showEdit ? <EditDevModal candidate={candidate} onClose={() => setShowEdit(false)} /> : null}

      {showDeleteConfirm ? (
        <DeleteCandidateConfirmModal
          candidateName={candidate.name}
          candidateEmail={candidate.email}
          deleting={deleteCandidate.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}

function DeleteCandidateConfirmModal({
  candidateName,
  candidateEmail,
  deleting,
  onCancel,
  onConfirm,
}: {
  candidateName: string;
  candidateEmail: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const removesFoundryAccess = Boolean(candidateEmail?.toLowerCase().endsWith("@gitwork.co.uk"));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="app-dialog-backdrop absolute inset-0"
        aria-label="Cancel delete"
        onClick={onCancel}
        disabled={deleting}
      />
      <div className="app-dialog-panel relative z-10 w-full max-w-md">
        <div className="border-b border-[var(--border-2)] px-6 py-4">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            Delete {candidateName}?
          </h3>
          <p className="mt-1 text-sm text-[var(--text-4)]">
            This removes the developer from Code and cannot be undone.
          </p>
        </div>
        <div className="space-y-3 px-6 py-5">
          {removesFoundryAccess ? (
            // Only --danger-50 and --danger-500 are defined in globals.css —
            // 200/700 don't exist, so we use rose-* utilities for the border
            // and text to keep this looking like a proper warning.
            <p className="rounded-[10px] border border-rose-200 bg-[var(--danger-50)] px-4 py-3 text-sm leading-6 text-rose-700">
              <strong className="font-semibold">{candidateEmail}</strong> is a Gitwork
              email address. Deleting this developer will also remove their Foundry
              workspace access — they&apos;ll be signed out and lose access immediately.
            </p>
          ) : null}
          <p className="text-sm leading-6 text-[var(--text-3)]">
            Are you sure you want to continue?
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-6 py-4">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            leadingIcon={<TrashIcon className="h-3.5 w-3.5" />}
            onClick={onConfirm}
            loading={deleting}
          >
            Delete developer
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32 rounded" />
      <Skeleton className="h-48 rounded-[10px]" />
      <div className="grid gap-6 xl:grid-cols-2">
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
    </div>
  );
}
