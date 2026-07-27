"use client";

import {
  ListBulletIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
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
import { cn } from "@/lib/format";
import { rosterIndexFor } from "@/lib/gitwork-roster";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import { formatMoney, useUsdToGbpRate } from "@/hooks/use-fx";
import {
  CodeClearTabs,
  EmptyState,
} from "@/components/codeclear/codeclear-shared";
import {
  CandidateProfileForm,
  emptyCandidateProfile,
  type CandidateProfileValue,
} from "@/components/codeclear/candidate-profile-form";
import { ClientAvatar } from "@/components/codeclear/client-avatar";

/** Card grid (default) vs the dense table. Persisted in the URL as ?view=. */
type DevViewMode = "cards" | "table";

type DevSortMode =
  | "roster"
  | "name"
  | "name-desc"
  | "rate-desc"
  | "rate-asc"
  | "stack"
  | "clients"
  | "updated";

/** Sort options shown in the toolbar. `ratesOnly` entries are hidden from
 *  viewers without `code.viewRates` (they can't see the figure being sorted on). */
const DEV_SORTS: Array<{ value: DevSortMode; label: string; ratesOnly?: boolean }> = [
  { value: "roster", label: "Roster order" },
  { value: "name", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "stack", label: "Stack" },
  { value: "clients", label: "Most clients" },
  { value: "updated", label: "Recently updated" },
  { value: "rate-desc", label: "Monthly: high → low", ratesOnly: true },
  { value: "rate-asc", label: "Monthly: low → high", ratesOnly: true },
];

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
  // Cards stay the default; table is the opt-in dense view. Both persist in the
  // URL so a view (and its filters/sort) can be shared or restored on refresh.
  const [viewMode, setViewMode] = useState<DevViewMode>(
    searchParams.get("view") === "table" ? "table" : "cards",
  );
  const [sortMode, setSortMode] = useState<DevSortMode>(
    (DEV_SORTS.find((s) => s.value === searchParams.get("sort"))?.value as DevSortMode) ?? "roster",
  );
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

  // Default ("roster") is the same canonical order as the overview: roster
  // order first, then any new devs by createdAt — keeps groups visually stable
  // across filter changes. The other modes sort client-side over the same set,
  // so they compose with the Bench / Off Bench grouping below.
  const orderedCandidates = useMemo(() => {
    const byRoster = (a: CodeClearCandidateListItem, b: CodeClearCandidateListItem) => {
      const ai = rosterIndexFor(a.name);
      const bi = rosterIndexFor(b.name);
      if (ai !== bi) return ai - bi;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    };
    // Unrated devs sink to the bottom of a rate sort rather than reading as £0.
    const byRate = (a: CodeClearCandidateListItem, b: CodeClearCandidateListItem, dir: 1 | -1) => {
      const av = a.monthlyRate;
      const bv = b.monthlyRate;
      if (av == null && bv == null) return byRoster(a, b);
      if (av == null) return 1;
      if (bv == null) return -1;
      return av === bv ? byRoster(a, b) : (av - bv) * dir;
    };
    const rows = [...candidates];
    switch (sortMode) {
      case "name":
        return rows.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return rows.sort((a, b) => b.name.localeCompare(a.name));
      case "rate-desc":
        return rows.sort((a, b) => byRate(a, b, -1));
      case "rate-asc":
        return rows.sort((a, b) => byRate(a, b, 1));
      case "stack":
        return rows.sort(
          (a, b) => a.primaryStack.localeCompare(b.primaryStack) || byRoster(a, b),
        );
      case "clients":
        return rows.sort(
          (a, b) => b.currentClients.length - a.currentClients.length || byRoster(a, b),
        );
      case "updated":
        return rows.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      default:
        return rows.sort(byRoster);
    }
  }, [candidates, sortMode]);

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
        {/* One toolbar row: search grows, the four filters sit inline beside it,
            and Add candidate anchors the right. Wraps to further rows on narrow
            viewports rather than stacking a separate filter block. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
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

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as PipelineStatus | "");
              updateQuery({ status: event.target.value || null });
            }}
            className="app-select-compact w-auto"
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
            className="app-select-compact w-auto"
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
            className="app-select-compact w-auto"
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
            className="app-select-compact w-auto"
          >
            <option value="">All confidence</option>
            {IDENTITY_CONFIDENCE_LEVELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

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

        {/* Sort + view controls — right-aligned, subordinate to the filters. */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5">
            <span className="widget-data-label">Sort</span>
            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as DevSortMode);
                updateQuery({ sort: event.target.value === "roster" ? null : event.target.value });
              }}
              className="app-select-compact w-auto"
            >
              {DEV_SORTS.filter((option) => !option.ratesOnly || canViewRates).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border-2)]">
            {(["cards", "table"] as DevViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setViewMode(mode);
                  updateQuery({ view: mode === "cards" ? null : mode });
                }}
                aria-pressed={viewMode === mode}
                title={mode === "cards" ? "Card view" : "Table view"}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition",
                  viewMode === mode
                    ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                    : "text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
                )}
              >
                {mode === "cards" ? (
                  <Squares2X2Icon className="h-4 w-4" />
                ) : (
                  <ListBulletIcon className="h-4 w-4" />
                )}
                {mode === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
        </div>

        {selectedIds.length ? (
          // Compact bulk-action bar: everything on a single row, with a
          // divider before the admin-only actions so the destructive
          // group reads visually distinct. The stage select sits inline
          // with the Move stage button (auto-width so it sizes to its
          // current value), and a clear-selection × on the right.
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-3 py-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-2)]">
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--brand-600)] px-1.5 text-[11px] font-bold text-white">
                {selectedIds.length}
              </span>
              selected
            </p>

            {/* Move stage — inline select + button so the dropdown is
                only as wide as its label, not a fixed 160px chunk. */}
            <div className="flex items-center gap-1.5">
              <select
                value={moveToStatus}
                onChange={(event) => setMoveToStatus(event.target.value as PipelineStatus)}
                className="app-select h-8 w-auto pr-9 text-xs"
                aria-label="Move to stage"
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
                size="xs"
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
            </div>

            <Button
              type="button"
              variant="secondary"
              size="xs"
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
                reshapes the bench definition itself, so it's stricter
                than the other bulk actions (server enforces the same
                in /api/codeclear/candidates PATCH). Divider sets the
                group apart visually. */}
            {isAdminOrAbove ? (
              <div className="flex items-center gap-1.5 border-l border-[var(--brand-300)] pl-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
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
                  size="xs"
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
              </div>
            ) : null}

            {/* Clear selection — text button on the far right so the
                action group ends with a visible exit. */}
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="ml-auto text-[11px] font-medium text-[var(--text-4)] transition hover:text-[var(--text-2)]"
            >
              Clear selection
            </button>
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
                  viewMode={viewMode}
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
                      wikiBio: createForm.wikiBio || null,
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
 * Section-grouped card grid for the Developers list. Renders one card per
 * dev, grouped by section (Bench / Off Bench). Cards click through to the
 * profile; the bulk-select checkbox sits top-right and stops propagation
 * so ticking it doesn't navigate. Mirrors the Portal client-card look
 * (widget-card + widget-header) so the two surfaces feel related.
 *
 * Rate block only renders when the viewer has `code.viewRates` — same
 * gate as the previous table column. Section headers are skipped when
 * only one group has rows.
 */
function DevsTable({
  sections,
  selectedIdSet,
  onToggleSelect,
  onRowClick,
  clientOptions,
  canViewRates,
  viewMode,
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
  viewMode: DevViewMode;
}) {
  // Skip empty sections so an empty Off Bench doesn't render a header.
  const nonEmpty = sections.filter((s) => s.rows.length > 0);
  const showSectionHeaders = nonEmpty.length > 1;
  // Pull the live USD→GBP rate once for the whole list. Cached 12 h
  // client-side; serves USD-only when the FX endpoint is unreachable.
  const fx = useUsdToGbpRate();
  const usdToGbp = fx.data?.rate ?? null;

  return (
    <div className="space-y-6">
      {nonEmpty.map((section) =>
        viewMode === "table" ? (
          <DevsRowSection
            key={section.key}
            section={section}
            showHeader={showSectionHeaders}
            selectedIdSet={selectedIdSet}
            onToggleSelect={onToggleSelect}
            onRowClick={onRowClick}
            clientOptions={clientOptions}
            canViewRates={canViewRates}
            usdToGbp={usdToGbp}
          />
        ) : (
          <DevsCardSection
            key={section.key}
            section={section}
            showHeader={showSectionHeaders}
            selectedIdSet={selectedIdSet}
            onToggleSelect={onToggleSelect}
            onRowClick={onRowClick}
            clientOptions={clientOptions}
            canViewRates={canViewRates}
            usdToGbp={usdToGbp}
          />
        ),
      )}
    </div>
  );
}

function DevsCardSection({
  section,
  showHeader,
  selectedIdSet,
  onToggleSelect,
  onRowClick,
  clientOptions,
  canViewRates,
  usdToGbp,
}: {
  section: { key: string; title: string; subtitle: string; rows: CodeClearCandidateListItem[] };
  showHeader: boolean;
  selectedIdSet: Set<string>;
  onToggleSelect: (id: string, next: boolean) => void;
  onRowClick: (id: string) => void;
  clientOptions: ClientListItem[];
  canViewRates: boolean;
  usdToGbp: number | null;
}) {
  return (
    <section>
      {showHeader ? (
        <header className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <div className="flex items-baseline gap-3">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-2)]">
              {section.title}
            </h3>
            {section.subtitle ? (
              <p className="text-[11px] text-[var(--text-4)]">{section.subtitle}</p>
            ) : null}
          </div>
          <span className="font-mono text-[11px] text-[var(--text-4)]">
            {section.rows.length} DEV{section.rows.length === 1 ? "" : "S"}
          </span>
        </header>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {section.rows.map((candidate, idx) => (
          <DevCard
            key={candidate.id}
            // Header counter is 1-indexed within the section so each
            // group reads "01 // @first-dev" through "NN // @last-dev".
            // Globally numbering across sections would mean Off Bench
            // starts at e.g. 19 — less useful at-a-glance.
            number={String(idx + 1).padStart(2, "0")}
            candidate={candidate}
            checked={selectedIdSet.has(candidate.id)}
            onToggle={(next) => onToggleSelect(candidate.id, next)}
            onClick={() => onRowClick(candidate.id)}
            clientOptions={clientOptions}
            canViewRates={canViewRates}
            usdToGbp={usdToGbp}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Dense table view — same rows, same selection/navigation behaviour as the
 * cards, just compact. Scrolls horizontally on narrow viewports rather than
 * squashing columns. The rate column is omitted entirely (not blanked) for
 * viewers without `code.viewRates`.
 */
function DevsRowSection({
  section,
  showHeader,
  selectedIdSet,
  onToggleSelect,
  onRowClick,
  clientOptions,
  canViewRates,
  usdToGbp,
}: {
  section: { key: string; title: string; subtitle: string; rows: CodeClearCandidateListItem[] };
  showHeader: boolean;
  selectedIdSet: Set<string>;
  onToggleSelect: (id: string, next: boolean) => void;
  onRowClick: (id: string) => void;
  clientOptions: ClientListItem[];
  canViewRates: boolean;
  usdToGbp: number | null;
}) {
  const headCell =
    "px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]";
  return (
    <section>
      {showHeader ? (
        <header className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-2)]">
            {section.title}
          </h3>
          <span className="font-mono text-[11px] text-[var(--text-4)]">
            {section.rows.length} DEV{section.rows.length === 1 ? "" : "S"}
          </span>
        </header>
      ) : null}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--border-1)]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="border-b border-[var(--border-1)] bg-[var(--surface-1)]">
            <tr>
              <th className={cn(headCell, "w-9")} aria-label="Select" />
              <th className={headCell}>Developer</th>
              <th className={headCell}>Stack</th>
              {canViewRates ? <th className={cn(headCell, "text-right")}>Monthly</th> : null}
              <th className={headCell}>Current clients</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((candidate) => (
              <tr
                key={candidate.id}
                onClick={() => onRowClick(candidate.id)}
                className="cursor-pointer border-b border-[var(--border-1)] transition-colors last:border-0 hover:bg-[var(--surface-1)]"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIdSet.has(candidate.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      onToggleSelect(candidate.id, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="h-3.5 w-3.5 rounded border-[var(--border-1)]"
                    aria-label={`Select ${candidate.name}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={candidate.avatarUrl} name={candidate.name} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight text-[var(--text-1)]">
                        {candidate.name}
                      </p>
                      <p className="truncate font-mono text-[11px] text-[var(--text-4)]">
                        @{candidate.githubHandle}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-[var(--text-2)]">{candidate.primaryStack}</td>
                {canViewRates ? (
                  <td className="px-3 py-2 text-right">
                    {candidate.monthlyRate != null && candidate.monthlyRateCurrency ? (
                      <MonthlyRateCell
                        amount={candidate.monthlyRate}
                        currency={candidate.monthlyRateCurrency}
                        usdToGbp={usdToGbp}
                      />
                    ) : (
                      <span className="text-xs text-[var(--text-4)]">—</span>
                    )}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  {candidate.currentClients.length === 0 ? (
                    <span className="text-xs italic text-[var(--text-4)]">Unassigned</span>
                  ) : (
                    <ClientAvatarStack
                      clients={candidate.currentClients}
                      clientOptions={clientOptions}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Single dev card — Portal-style. Header carries the position counter +
 * @handle (replaces the generic "DEV" label) and the bulk-select
 * checkbox. Body mirrors the Portal client card: avatar + name row,
 * big calibre stat, three-slot metrics strip (stack / monthly / tier),
 * current clients block, updated timestamp.
 */
function DevCard({
  number,
  candidate,
  checked,
  onToggle,
  onClick,
  clientOptions,
  canViewRates,
  usdToGbp,
}: {
  number: string;
  candidate: CodeClearCandidateListItem;
  checked: boolean;
  onToggle: (next: boolean) => void;
  onClick: () => void;
  clientOptions: ClientListItem[];
  canViewRates: boolean;
  usdToGbp: number | null;
}) {
  return (
    <article
      className="widget-card group cursor-pointer transition-shadow hover:shadow-[rgba(0,0,0,0.06)_0px_4px_16px]"
      onClick={onClick}
    >
      {/* Header: NN // @handle (mirrors the Foundry numbered widget
          style — "01 // ROSTER" etc.). Tag lives here so the body
          isn't duplicating it. Checkbox top-right; click + change
          both stopPropagation so toggling doesn't navigate. */}
      <div className="widget-header">
        <span className="widget-header__label flex items-center gap-1.5">
          <span className="text-[var(--text-3)]">{number}</span>
          <span className="text-[var(--text-4)]">{"//"}</span>
          <span className="text-[var(--text-2)] normal-case tracking-normal">
            @{candidate.githubHandle}
          </span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            event.stopPropagation();
            onToggle(event.target.checked);
          }}
          onClick={(event) => event.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-[var(--border-1)]"
          aria-label={`Select ${candidate.name}`}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Identity row — avatar + name + stack badge. Stack sits under
            the name as a small label rather than in a separate strip so
            the card stays compact now that calibre/tier are gone. */}
        <div className="flex items-center gap-3">
          {/* Avatar falls back to initials when the stored URL is dead — never
              the browser's broken-image glyph. */}
          <Avatar src={candidate.avatarUrl} name={candidate.name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-snug text-[var(--text-1)]">
              {candidate.name}
            </p>
            <p className="mt-0.5 widget-data-label">{candidate.primaryStack}</p>
          </div>
        </div>

        {/* Monthly rate — the only stat we actually track. Sits big
            and bottom-left so it's the dominant signal. */}
        {canViewRates && candidate.monthlyRate != null && candidate.monthlyRateCurrency ? (
          <div className="flex items-start justify-between gap-3 border-t border-[rgba(0,0,0,0.06)] pt-3">
            <p className="widget-data-label">Monthly</p>
            <div className="text-right">
              <MonthlyRateCell
                amount={candidate.monthlyRate}
                currency={candidate.monthlyRateCurrency}
                usdToGbp={usdToGbp}
              />
            </div>
          </div>
        ) : null}

        {/* Current clients */}
        <div className={canViewRates ? "" : "border-t border-[rgba(0,0,0,0.06)] pt-3"}>
          <p className="widget-data-label mb-1.5">Current clients</p>
          {candidate.currentClients.length === 0 ? (
            <span className="text-xs italic text-[var(--text-4)]">Unassigned</span>
          ) : (
            <ClientAvatarStack
              clients={candidate.currentClients}
              clientOptions={clientOptions}
            />
          )}
        </div>
      </div>
    </article>
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
    <span className="inline-flex flex-col items-start leading-tight">
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

