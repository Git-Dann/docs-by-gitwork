"use client";

import {
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useBulkUpdateCodeClearCandidates,
  useCodeClearCandidates,
  useCreateCodeClearCandidate,
} from "@/hooks/use-codeclear";
import { setCandidateCurrentClients } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import {
  CODECLEAR_TIERS,
  IDENTITY_CONFIDENCE_LEVELS,
  PIPELINE_STATUSES,
  type CodeClearCandidateCurrentClient,
  type CodeClearCandidateListItem,
  type CodeClearTier,
  type IdentityConfidence,
  type PipelineStatus,
} from "@/types/codeclear";
import type { ClientListItem } from "@/types/client";
import { cn, formatDate } from "@/lib/format";
import { rosterIndexFor } from "@/lib/gitwork-roster";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney, useUsdToGbpRate } from "@/hooks/use-fx";
import {
  CodeClearTabs,
  EmptyState,
  RosterTierBadge,
} from "@/components/codeclear/codeclear-shared";
import {
  CandidateProfileForm,
  emptyCandidateProfile,
  type CandidateProfileValue,
} from "@/components/codeclear/candidate-profile-form";
import { ClientAvatar } from "@/components/codeclear/client-avatar";

export function CodeClearCandidatesWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { canManageCode, canViewRates, isAdminOrAbove } = usePermissions();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | "">(
    (searchParams.get("status") as PipelineStatus | null) ?? "",
  );
  const [tierFilter, setTierFilter] = useState<CodeClearTier | "">(
    (searchParams.get("tier") as CodeClearTier | null) ?? "",
  );
  const [stackFilter, setStackFilter] = useState(searchParams.get("stack") ?? "");
  const [confidenceFilter, setConfidenceFilter] = useState<IdentityConfidence | "">(
    (searchParams.get("identityConfidence") as IdentityConfidence | null) ?? "",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveToStatus, setMoveToStatus] = useState<PipelineStatus>("CODECLEAR_COMPLETE");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CandidateProfileValue>(emptyCandidateProfile);

  const candidatesQuery = useCodeClearCandidates({
    q: deferredSearch,
    page: 1,
    pageSize: 50,
    sortBy: "updatedAt",
    sortDir: "desc",
    status: statusFilter || undefined,
    tier: tierFilter || undefined,
    stack: stackFilter,
    identityConfidence: confidenceFilter || undefined,
  });
  const createCandidate = useCreateCodeClearCandidate();
  const queryClient = useQueryClient();
  const bulkUpdate = useBulkUpdateCodeClearCandidates();
  const clientsQuery = useClientList();
  const clientOptions = clientsQuery.data?.clients ?? [];
  const candidates = useMemo(() => candidatesQuery.data?.items ?? [], [candidatesQuery.data]);

  // Same canonical sort as the overview: roster order first, then any new
  // devs by createdAt. Keeps groups visually stable across filter changes.
  const orderedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => {
      const ai = rosterIndexFor(a.name);
      const bi = rosterIndexFor(b.name);
      if (ai !== bi) return ai - bi;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [candidates]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => candidates.some((item) => item.id === id)));
  }, [candidates]);

  const stackOptions = useMemo(() => candidatesQuery.data?.facets.stacks ?? [], [candidatesQuery.data]);

  function updateQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <CodeClearTabs />

      <section className="app-card p-6">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
            <input
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                updateQuery({ q: value || null });
              }}
              placeholder="Search developers"
              className="app-input pl-9"
            />
          </label>
          {canManageCode ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              leadingIcon={<PlusIcon className="h-4 w-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Add candidate
            </Button>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as PipelineStatus | "");
              updateQuery({ status: event.target.value || null });
            }}
            className="app-select"
          >
            <option value="">All stages</option>
            {PIPELINE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={tierFilter}
            onChange={(event) => {
              setTierFilter(event.target.value as CodeClearTier | "");
              updateQuery({ tier: event.target.value || null });
            }}
            className="app-select"
          >
            <option value="">All tiers</option>
            {CODECLEAR_TIERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={stackFilter}
            onChange={(event) => {
              setStackFilter(event.target.value);
              updateQuery({ stack: event.target.value || null });
            }}
            className="app-select"
          >
            <option value="">All stacks</option>
            {stackOptions.map((stack) => (
              <option key={stack} value={stack}>
                {stack}
              </option>
            ))}
          </select>

          <select
            value={confidenceFilter}
            onChange={(event) => {
              setConfidenceFilter(event.target.value as IdentityConfidence | "");
              updateQuery({ identityConfidence: event.target.value || null });
            }}
            className="app-select"
          >
            <option value="">All confidence</option>
            {IDENTITY_CONFIDENCE_LEVELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--text-2)]">
              {selectedIds.length} selected
            </p>
            <select
              value={moveToStatus}
              onChange={(event) => setMoveToStatus(event.target.value as PipelineStatus)}
              className="app-input h-10 min-w-[160px]"
            >
              {PIPELINE_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                bulkUpdate.mutate({
                  action: "MOVE_STAGE",
                  ids: selectedIds,
                  status: moveToStatus,
                })
              }
              loading={bulkUpdate.isPending}
            >
              Move stage
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                bulkUpdate.mutate({
                  action: "FLAG_RECHECK",
                  ids: selectedIds,
                })
              }
              loading={bulkUpdate.isPending}
            >
              Flag re-check
            </Button>
            {/* Admin+ only — moving devs between Bench / Off Bench
                reshapes the bench definition itself, so it's a stricter
                gate than the other bulk actions. Server enforces the
                same in /api/codeclear/candidates PATCH. */}
            {isAdminOrAbove ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    bulkUpdate.mutate({
                      action: "SET_DEV_GROUP",
                      ids: selectedIds,
                      devGroup: "PRO_BONO",
                    })
                  }
                  loading={bulkUpdate.isPending}
                >
                  Move to Off Bench
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    bulkUpdate.mutate({
                      action: "SET_DEV_GROUP",
                      ids: selectedIds,
                      devGroup: "BENCH",
                    })
                  }
                  loading={bulkUpdate.isPending}
                >
                  Move to Bench
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {candidates.length ? (
          (() => {
            // Group by devGroup. Bench is the commercial roster (default).
            // Pro bono is rendered in the SAME table but with an inline
            // divider row between groups — one set of column headers, no
            // stacked tables. Falls back to treating missing devGroup as
            // BENCH for legacy rows (bootstrap self-heals these).
            const benchRows = orderedCandidates.filter(
              (c) => c.devGroup !== "PRO_BONO",
            );
            const proBonoRows = orderedCandidates.filter(
              (c) => c.devGroup === "PRO_BONO",
            );
            return (
              <div
                className={cn(
                  "mt-5 transition-opacity",
                  candidatesQuery.isPlaceholderData ? "opacity-60" : "opacity-100",
                )}
              >
                <DevsTable
                  sections={[
                    {
                      key: "bench",
                      title: "Bench",
                      subtitle: "",
                      rows: benchRows,
                    },
                    {
                      key: "off-bench",
                      title: "Off Bench",
                      subtitle: "",
                      rows: proBonoRows,
                    },
                  ]}
                  selectedIdSet={selectedIdSet}
                  onToggleSelect={(id, next) =>
                    setSelectedIds((current) =>
                      next
                        ? current.includes(id)
                          ? current
                          : [...current, id]
                        : current.filter((entry) => entry !== id),
                    )
                  }
                  onRowClick={(id) => router.push(`/app/codeclear/candidates/${id}`)}
                  clientOptions={clientOptions}
                  canViewRates={canViewRates}
                />
              </div>
            );
          })()
        ) : candidatesQuery.isLoading ? (
          // Initial load only — once we have *any* result, placeholderData
          // keeps the previous rows on subsequent filter changes so this
          // branch isn't hit again.
          <div className="mt-5 space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="h-12 animate-pulse rounded-[8px] bg-[var(--surface-1)]"
              />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No devs match these filters"
              body="Try widening the search or add a new dev to the registry."
            />
          </div>
        )}
      </section>

      {showCreateModal ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center px-4 py-8">
          <button
            type="button"
            className="app-dialog-backdrop absolute inset-0"
            aria-label="Close add developer modal"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="app-dialog-panel relative z-10 flex max-h-full w-full max-w-4xl flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Add dev
                </h3>
                <p className="mt-1 text-sm text-[var(--text-4)]">
                  Create a developer profile. Run validation later to score
                  this dev from real signals.
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <CandidateProfileForm
                value={createForm}
                onChange={setCreateForm}
                showClientsPicker
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-6 py-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  createCandidate.mutate(
                    {
                      name: createForm.name,
                      githubHandle: createForm.githubHandle,
                      primaryStack: createForm.primaryStack,
                      techStacks: createForm.techStacks.length
                        ? createForm.techStacks
                        : [createForm.primaryStack],
                      email: createForm.email || null,
                      location: createForm.location || null,
                      bio: createForm.bio || null,
                      linkedinUrl: createForm.linkedinUrl || null,
                      cvUrl: createForm.cvUrl || null,
                      portfolioUrl: createForm.portfolioUrl || null,
                      yearsExperience:
                        createForm.yearsExperience !== ""
                          ? Number(createForm.yearsExperience)
                          : null,
                      hourlyRate:
                        createForm.hourlyRate !== "" ? Number(createForm.hourlyRate) : null,
                      currency: createForm.currency || null,
                      timezone: createForm.timezone || null,
                      availability: createForm.availability || null,
                    },
                    {
                      onSuccess: async (result) => {
                        // If the user picked any clients in the form, attach
                        // them now as open-ended placements. Mirrors what the
                        // CurrentClientPicker does after the dev exists.
                        if (createForm.clientIds.length > 0) {
                          try {
                            await setCandidateCurrentClients(
                              result.candidate.id,
                              createForm.clientIds,
                            );
                            queryClient.invalidateQueries({
                              queryKey: ["codeclear", "candidates"],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["codeclear", "candidate", result.candidate.id],
                            });
                          } catch (error) {
                            console.error("Failed to attach clients on create", error);
                          }
                        }
                        setShowCreateModal(false);
                        setCreateForm(emptyCandidateProfile);
                        router.push(`/app/codeclear/candidates/${result.candidate.id}`);
                      },
                    },
                  )
                }
                loading={createCandidate.isPending}
                disabled={
                  !createForm.name.trim() ||
                  !createForm.githubHandle.trim() ||
                  !createForm.primaryStack.trim()
                }
              >
                Create dev
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

/**
 * Section-grouped table for the Developers list. Renders ONE table with
 * a single set of column headers; each section gets a labeled divider
 * row inserted ahead of its rows. Sections with zero rows are skipped
 * entirely so we never show an empty Pro bono divider.
 *
 * Rate column only renders when the viewer has `code.viewRates`; the
 * column is dropped (not blanked) so the table stays aligned.
 */
function DevsTable({
  sections,
  selectedIdSet,
  onToggleSelect,
  onRowClick,
  clientOptions,
  canViewRates,
}: {
  sections: Array<{
    key: string;
    title: string;
    subtitle: string;
    rows: CodeClearCandidateListItem[];
  }>;
  selectedIdSet: Set<string>;
  onToggleSelect: (id: string, next: boolean) => void;
  onRowClick: (id: string) => void;
  clientOptions: ClientListItem[];
  canViewRates: boolean;
}) {
  // Skip empty sections so we don't render a "Pro bono — 0 devs" header
  // when there's nothing to show. Column count is used for the divider
  // row's colSpan so the highlight stretches the full table width.
  const nonEmpty = sections.filter((s) => s.rows.length > 0);
  const colCount = canViewRates ? 8 : 7;
  const showDividers = nonEmpty.length > 1;
  // Pull the live USD→GBP rate once for the whole table. Cached for 12 h
  // client-side; serves USD-only when the FX endpoint is unreachable.
  const fx = useUsdToGbpRate();
  const usdToGbp = fx.data?.rate ?? null;

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
      <table className="app-table">
        <thead>
          <tr>
            <th className="w-10 text-left" />
            <th className="text-left">Dev</th>
            <th className="text-left">Stack</th>
            <th className="text-left">Current client</th>
            <th className="text-right">Calibre</th>
            <th className="text-left">Tier</th>
            {canViewRates ? <th className="text-right">Monthly</th> : null}
            <th className="text-right">Updated</th>
          </tr>
        </thead>
        <tbody>
          {nonEmpty.map((section, sectionIdx) => (
            <DevsTableSection
              key={section.key}
              section={section}
              isFirst={sectionIdx === 0}
              showDivider={showDividers}
              colCount={colCount}
              selectedIdSet={selectedIdSet}
              onToggleSelect={onToggleSelect}
              onRowClick={onRowClick}
              clientOptions={clientOptions}
              canViewRates={canViewRates}
              usdToGbp={usdToGbp}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DevsTableSection({
  section,
  isFirst,
  showDivider,
  colCount,
  selectedIdSet,
  onToggleSelect,
  onRowClick,
  clientOptions,
  canViewRates,
  usdToGbp,
}: {
  section: { key: string; title: string; subtitle: string; rows: CodeClearCandidateListItem[] };
  isFirst: boolean;
  showDivider: boolean;
  colCount: number;
  selectedIdSet: Set<string>;
  onToggleSelect: (id: string, next: boolean) => void;
  onRowClick: (id: string) => void;
  clientOptions: ClientListItem[];
  canViewRates: boolean;
  /** Live USD→GBP rate (null while loading or if FX is unreachable —
   *  the cell falls back to USD only in that case). */
  usdToGbp: number | null;
}) {
  return (
    <>
      {showDivider ? (
        // Divider row: title + subtitle + count, full-width inside the
        // tbody. First section gets a subtle bg, subsequent sections add a
        // top border so the break between groups reads clearly.
        <tr
          className={cn(
            "bg-[var(--surface-1)]",
            !isFirst && "border-t-2 border-[var(--border-2)]",
          )}
        >
          <td
            colSpan={colCount}
            className="px-4 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-2)]">
                  {section.title}
                </span>
                {section.subtitle ? (
                  <span className="text-[11px] text-[var(--text-4)]">{section.subtitle}</span>
                ) : null}
              </div>
              <span className="font-mono text-[11px] text-[var(--text-4)]">
                {section.rows.length} DEV{section.rows.length === 1 ? "" : "S"}
              </span>
            </div>
          </td>
        </tr>
      ) : null}
      {section.rows.map((candidate) => {
              const checked = selectedIdSet.has(candidate.id);
              const score =
                candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore ?? null;
              return (
                <tr
                  key={candidate.id}
                  className="cursor-pointer"
                  onClick={() => onRowClick(candidate.id)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onToggleSelect(candidate.id, event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-[var(--border-1)]"
                      aria-label={`Select ${candidate.name}`}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      {candidate.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.avatarUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] text-xs font-semibold text-[var(--brand-700)]">
                          {candidate.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                          {candidate.name}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-4)]">
                          @{candidate.githubHandle}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm text-[var(--text-2)]">{candidate.primaryStack}</span>
                  </td>
                  <td>
                    {candidate.currentClients.length === 0 ? (
                      <span className="text-xs italic text-[var(--text-4)]">Unassigned</span>
                    ) : (
                      <ClientAvatarStack
                        clients={candidate.currentClients}
                        clientOptions={clientOptions}
                      />
                    )}
                  </td>
                  <td className="text-right">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-[6px] border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
                        score == null
                          ? "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-4)]"
                          : score >= 80
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : score >= 65
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]",
                      )}
                    >
                      {score ?? "—"}
                    </span>
                  </td>
                  <td>
                    <RosterTierBadge
                      effectiveTier={candidate.effectiveTier}
                      isOverridden={
                        candidate.tierManualOverride !== null &&
                        candidate.tierManualOverride !== candidate.tier
                      }
                    />
                  </td>
                  {canViewRates ? (
                    <td className="text-right">
                      <MonthlyRateCell
                        amount={candidate.monthlyRate}
                        currency={candidate.monthlyRateCurrency}
                        usdToGbp={usdToGbp}
                      />
                    </td>
                  ) : null}
                  <td className="text-right">
                    <span className="font-mono text-[11px] text-[var(--text-4)]">
                      {formatDate(candidate.updatedAt)}
                    </span>
                  </td>
                </tr>
              );
            })}
    </>
  );
}

/**
 * Overlapping client logos for the "Current client" column. Shows up to
 * MAX_VISIBLE avatars with negative-margin overlap, then a "+N" chip when
 * there are more. Keeps the cell width predictable when a dev is on 5-6
 * clients — vs. the old wrap-flex layout that pushed rows tall.
 */
function ClientAvatarStack({
  clients,
  clientOptions,
}: {
  clients: CodeClearCandidateCurrentClient[];
  clientOptions: ClientListItem[];
}) {
  const MAX_VISIBLE = 4;
  const shown = clients.slice(0, MAX_VISIBLE);
  const extra = clients.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((entry, i) => {
        const logoUrl = entry.id
          ? clientOptions.find((c) => c.id === entry.id)?.logoUrl ?? null
          : null;
        return (
          <span
            key={entry.id ?? entry.name}
            // White ring keeps each avatar visually separated from its
            // neighbour; negative margin produces the overlap (the first
            // avatar stays flush left). zIndex descends so earlier
            // avatars sit on top — natural reading order left-to-right.
            className="rounded-full ring-2 ring-white"
            style={{ marginLeft: i === 0 ? 0 : -10, zIndex: MAX_VISIBLE - i }}
            title={entry.name}
          >
            <ClientAvatar name={entry.name} logoUrl={logoUrl} size="md" />
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="ml-2 font-mono text-[11px] text-[var(--text-4)]">+{extra}</span>
      ) : null}
    </span>
  );
}

/**
 * Monthly rate cell. Renders the source currency on top (the figure Syed
 * actually enters in the Rate Card) and the live GBP equivalent below.
 * When `amount` is null (no rate-card link, archived, or pro bono dev)
 * we show an em-dash. When `usdToGbp` is null (FX endpoint unreachable
 * or still loading), we hide the conversion line so the table never
 * shows a wrong number.
 */
function MonthlyRateCell({
  amount,
  currency,
  usdToGbp,
}: {
  amount: number | null;
  currency: string | null;
  usdToGbp: number | null;
}) {
  if (amount == null || !currency) {
    return <span className="font-mono text-[11px] text-[var(--text-4)]">—</span>;
  }
  // Convert to GBP only when the source is USD. For other currencies we
  // skip the second line (defensive — today all seeded rates are USD).
  const gbp =
    usdToGbp != null && currency.toUpperCase() === "USD" ? amount * usdToGbp : null;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-mono text-[11px] tabular-nums text-[var(--text-1)]">
        {formatMoney(amount, currency)}
      </span>
      {gbp != null ? (
        <span className="font-mono text-[10px] tabular-nums text-[var(--text-4)]">
          ≈ {formatMoney(gbp, "GBP")}
        </span>
      ) : null}
    </span>
  );
}

