"use client";

import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useAddCodeClearCandidateNote,
  useBulkUpdateCodeClearCandidates,
  useCodeClearCandidate,
  useDeleteCodeClearCandidate,
  useUpdateCodeClearCandidate,
} from "@/hooks/use-codeclear";
import { CurrentClientPicker } from "@/components/codeclear/current-client-picker";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney, useUsdToGbpRate } from "@/hooks/use-fx";
import { cn, formatDate } from "@/lib/format";
import { type CandidateAvailability } from "@/types/codeclear";
import {
  CandidateProfileForm,
  emptyCandidateProfile,
  type CandidateProfileValue,
} from "@/components/codeclear/candidate-profile-form";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";

/**
 * Full-page dev profile. Replaces the old drawer with a calmer, dedicated
 * surface for everything we know about a single dev — identity, current
 * engagement, calibre breakdown, validation checks, history, notes.
 *
 * Edit is a modal-ish overlay using the shared CandidateProfileForm so the
 * profile page stays read-mode by default.
 */
export function CodeClearCandidateProfile({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const candidateQuery = useCodeClearCandidate(candidateId);
  const clientsQuery = useClientList();
  const updateCandidate = useUpdateCodeClearCandidate(candidateId);
  const deleteCandidate = useDeleteCodeClearCandidate();
  const addNote = useAddCodeClearCandidateNote(candidateId);
  const bulkUpdate = useBulkUpdateCodeClearCandidates();

  const candidate = candidateQuery.data?.candidate ?? null;
  const clients = clientsQuery.data?.clients ?? [];

  const { canViewRates, canManageCode, isAdminOrAbove } = usePermissions();
  // Live USD→GBP rate so the Monthly hero stat can show the GBP
  // conversion underneath. Only fetched when the viewer can see rates.
  const fxQuery = useUsdToGbpRate();
  const fxRate = canViewRates ? fxQuery.data?.rate ?? null : null;
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editForm, setEditForm] = useState<CandidateProfileValue>(emptyCandidateProfile);
  const [noteBody, setNoteBody] = useState("");

  // Hydrate the edit form whenever the modal opens or the candidate changes.
  useEffect(() => {
    if (!candidate || !showEdit) return;
    setEditForm({
      name: candidate.name,
      githubHandle: candidate.githubHandle,
      email: candidate.email ?? "",
      primaryStack: candidate.primaryStack,
      techStacks: candidate.techStacks.length ? candidate.techStacks : [candidate.primaryStack],
      location: candidate.location ?? "",
      bio: candidate.bio ?? "",
      linkedinUrl: candidate.linkedinUrl ?? "",
      cvUrl: candidate.cvUrl ?? "",
      portfolioUrl: candidate.portfolioUrl ?? "",
      yearsExperience:
        candidate.yearsExperience != null ? String(candidate.yearsExperience) : "",
      // Pre-fill from the candidate's stored hourlyRate first; fall back
      // to the linked rate-card monthly figure so devs paid on a monthly
      // retainer (like Jamal) see their actual rate on first open. The
      // form's "Monthly rate" label is fixed — PATCH writes through to
      // RateCardPerson with billingPeriod=MONTH.
      hourlyRate:
        candidate.hourlyRate != null
          ? String(candidate.hourlyRate)
          : candidate.monthlyRate != null
            ? String(candidate.monthlyRate)
            : "",
      currency:
        candidate.currency ?? candidate.monthlyRateCurrency ?? "USD",
      timezone: candidate.timezone ?? "",
      availability: candidate.availability ?? "",
      origin: candidate.origin,
      // Profile edit doesn't manage clients here — the hero already has the
      // live current-client picker. Kept empty to satisfy the type.
      clientIds: [],
    });
  }, [candidate, showEdit]);

  if (candidateQuery.isLoading) {
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

  async function handleSaveEdit() {
    await updateCandidate.mutateAsync({
      name: editForm.name,
      githubHandle: editForm.githubHandle,
      email: editForm.email || null,
      primaryStack: editForm.primaryStack,
      techStacks: editForm.techStacks.length ? editForm.techStacks : [editForm.primaryStack],
      location: editForm.location || null,
      bio: editForm.bio || null,
      linkedinUrl: editForm.linkedinUrl || null,
      cvUrl: editForm.cvUrl || null,
      portfolioUrl: editForm.portfolioUrl || null,
      yearsExperience:
        editForm.yearsExperience !== "" ? Number(editForm.yearsExperience) : null,
      hourlyRate: editForm.hourlyRate !== "" ? Number(editForm.hourlyRate) : null,
      currency: editForm.currency || null,
      timezone: editForm.timezone || null,
      availability: editForm.availability || null,
    });
    setShowEdit(false);
  }

  async function confirmDelete() {
    await deleteCandidate.mutateAsync(candidateId);
    router.push("/app/codeclear/candidates");
  }

  async function handleAddNote() {
    if (!noteBody.trim()) return;
    await addNote.mutateAsync({ body: noteBody.trim() });
    setNoteBody("");
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
              {candidate.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={candidate.avatarUrl}
                  alt={candidate.name}
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] text-xl font-semibold text-[var(--brand-700)]">
                  {candidate.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
              )}
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
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <textarea
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Add a note about this dev — strengths, gaps, anything worth remembering."
              className="app-input min-h-[64px] flex-1 resize-y text-sm"
              rows={2}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAddNote}
              disabled={!noteBody.trim() || addNote.isPending}
            >
              Add
            </Button>
          </div>

          {candidate.notes.length ? (
            <ul className="space-y-2">
              {candidate.notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3"
                >
                  <p className="text-sm leading-6 text-[var(--text-2)]">{note.body}</p>
                  <p className="mt-2 font-mono text-[11px] text-[var(--text-4)]">
                    {note.createdBy} · {formatDate(note.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-center text-sm text-[var(--text-4)]">No notes yet.</p>
          )}
        </div>
      </WidgetCard>

      {/* Edit modal */}
      {showEdit ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center px-4 py-8">
          <button
            type="button"
            className="app-dialog-backdrop absolute inset-0"
            aria-label="Close edit"
            onClick={() => setShowEdit(false)}
          />
          <div className="app-dialog-panel relative z-10 flex max-h-full w-full max-w-2xl flex-col">
            <div className="border-b border-[var(--border-2)] px-6 py-4">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Edit {candidate.name}
              </h3>
              <p className="mt-1 text-sm text-[var(--text-4)]">
                Changes apply immediately on Save.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <CandidateProfileForm value={editForm} onChange={setEditForm} />
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-6 py-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowEdit(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                loading={updateCandidate.isPending}
                disabled={
                  !editForm.name.trim() ||
                  !editForm.githubHandle.trim() ||
                  !editForm.primaryStack.trim()
                }
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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

function HeroStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-r border-[var(--border-2)] px-6 py-4 last:border-r-0">
      <p className="widget-data-label">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 font-display text-[28px] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-1)]">
        {value}
        {sub ? <span className="widget-data-label text-[var(--text-4)]">{sub}</span> : null}
      </p>
    </div>
  );
}

function AvailabilityBadge({ availability }: { availability: CandidateAvailability | null }) {
  if (!availability) return null;
  const label =
    availability === "AVAILABLE"
      ? "Available"
      : availability === "ENGAGED"
        ? "Engaged"
        : "Unavailable";
  const tone =
    availability === "AVAILABLE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : availability === "ENGAGED"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function ExternalLinks({
  linkedinUrl,
  cvUrl,
  portfolioUrl,
}: {
  linkedinUrl: string | null;
  cvUrl: string | null;
  portfolioUrl: string | null;
}) {
  const links = [
    linkedinUrl ? { href: linkedinUrl, label: "LinkedIn" } : null,
    cvUrl ? { href: cvUrl, label: "CV" } : null,
    portfolioUrl ? { href: portfolioUrl, label: "Portfolio" } : null,
  ].filter((entry): entry is { href: string; label: string } => entry !== null);
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-3)] transition hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]"
        >
          {link.label}
          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-1)]" />
      <div className="h-48 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
        <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
      </div>
    </div>
  );
}
