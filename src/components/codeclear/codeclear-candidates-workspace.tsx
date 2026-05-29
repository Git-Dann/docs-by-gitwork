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
import {
  CODECLEAR_TIERS,
  IDENTITY_CONFIDENCE_LEVELS,
  PIPELINE_STATUSES,
  type CodeClearTier,
  type IdentityConfidence,
  type PipelineStatus,
} from "@/types/codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { rosterIndexFor } from "@/lib/gitwork-roster";
import {
  CodeClearTabs,
  EmptyState,
  RosterGroups,
} from "@/components/codeclear/codeclear-shared";
import {
  CandidateProfileForm,
  emptyCandidateProfile,
  type CandidateProfileValue,
} from "@/components/codeclear/candidate-profile-form";
import { CodeClearCandidateDrawer } from "@/components/codeclear/codeclear-candidate-drawer";

export function CodeClearCandidatesWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCandidateId = searchParams.get("candidate");
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
  const bulkUpdate = useBulkUpdateCodeClearCandidates();
  const clientsQuery = useClientList();
  const clients = clientsQuery.data?.clients ?? [];
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
              placeholder="Search candidates"
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
          <div className="mt-5">
            <RosterGroups
              candidates={orderedCandidates}
              clients={clients}
              clientsLoading={clientsQuery.isLoading}
              selectable
              selectedIds={selectedIdSet}
              onSelectChange={(id, checked) => {
                setSelectedIds((current) =>
                  checked
                    ? current.includes(id) ? current : [...current, id]
                    : current.filter((entry) => entry !== id),
                );
              }}
            />
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No candidates match these filters"
              body="Try widening the search or add a new CodeClear profile."
            />
          </div>
        )}
      </section>

      {showCreateModal ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center px-4 py-8">
          <button
            type="button"
            className="app-dialog-backdrop absolute inset-0"
            aria-label="Close add candidate modal"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="app-dialog-panel relative z-10 flex max-h-full w-full max-w-2xl flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Add dev
                </h3>
                <p className="mt-1 text-sm text-[var(--text-4)]">
                  Create a CodeClear profile. Run validation later to score
                  this dev from real signals.
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <CandidateProfileForm value={createForm} onChange={setCreateForm} />
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
                      onSuccess: (result) => {
                        setShowCreateModal(false);
                        setCreateForm(emptyCandidateProfile);
                        updateQuery({ candidate: result.candidate.id });
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

      <CodeClearCandidateDrawer
        candidateId={selectedCandidateId}
        onClose={() => updateQuery({ candidate: null })}
        onDeleted={() => setSelectedIds((current) => current.filter((id) => id !== selectedCandidateId))}
      />
    </div>
  );
}

