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
  type CodeClearTier,
  type IdentityConfidence,
  type PipelineStatus,
} from "@/types/codeclear";
import { cn, formatDate } from "@/lib/format";
import { rosterIndexFor } from "@/lib/gitwork-roster";
import { useClientList } from "@/hooks/use-proposals";
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
          <Button
            type="button"
            variant="primary"
            size="md"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Add candidate
          </Button>
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
          </div>
        ) : null}

        {candidates.length ? (
          <div className="mt-5 overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="w-10 text-left" />
                  <th className="text-left">Dev</th>
                  <th className="text-left">Stack</th>
                  <th className="text-left">Current client</th>
                  <th className="text-right">Calibre</th>
                  <th className="text-left">Tier</th>
                  <th className="text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {orderedCandidates.map((candidate) => {
                  const checked = selectedIdSet.has(candidate.id);
                  const score =
                    candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore ?? null;
                  return (
                    <tr
                      key={candidate.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/app/codeclear/candidates/${candidate.id}`)}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? current.includes(candidate.id)
                                  ? current
                                  : [...current, candidate.id]
                                : current.filter((entry) => entry !== candidate.id),
                            )
                          }
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
                        <span className="text-sm text-[var(--text-2)]">
                          {candidate.primaryStack}
                        </span>
                      </td>
                      <td>
                        {candidate.currentClients.length === 0 ? (
                          <span className="text-xs italic text-[var(--text-4)]">Unassigned</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {candidate.currentClients.map((entry) => {
                              const logoUrl = entry.id
                                ? clientOptions.find((c) => c.id === entry.id)?.logoUrl ?? null
                                : null;
                              return (
                                <ClientAvatar
                                  key={entry.id ?? entry.name}
                                  name={entry.name}
                                  logoUrl={logoUrl}
                                  size="md"
                                />
                              );
                            })}
                          </div>
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
                      <td className="text-right">
                        <span className="font-mono text-[11px] text-[var(--text-4)]">
                          {formatDate(candidate.updatedAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

