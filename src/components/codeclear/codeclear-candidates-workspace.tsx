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
  CANDIDATE_SIGNAL_SOURCES,
  CODECLEAR_TIERS,
  IDENTITY_CONFIDENCE_LEVELS,
  PIPELINE_STATUSES,
  TECH_STACK_OPTIONS,
  type CodeClearTier,
  type IdentityConfidence,
  type PipelineStatus,
} from "@/types/codeclear";
import {
  CandidateMeta,
  CodeClearAnalysisBadge,
  CodeClearScoreBadge,
  CodeClearStatusBadge,
  CodeClearTabs,
  CodeClearTierBadge,
  EmptyState,
  SignalSourcePill,
  StackPill,
} from "@/components/codeclear/codeclear-shared";
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
  const [createForm, setCreateForm] = useState({
    name: "",
    githubHandle: "",
    primaryStack: "",
    techStacks: [] as string[],
    signalSources: ["GITHUB"] as Array<(typeof CANDIDATE_SIGNAL_SOURCES)[number]["value"]>,
    email: "",
    location: "",
    bio: "",
    tier: "TIER_1",
  });

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
  const candidates = useMemo(() => candidatesQuery.data?.items ?? [], [candidatesQuery.data]);

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
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[16px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
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
          <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--border-2)]">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="w-12 text-left" />
                  <th className="text-left">Candidate</th>
                  <th className="text-left">Stack</th>
                  <th className="text-left">Signals</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Analysis</th>
                  <th className="text-left">Score</th>
                  <th className="text-left">Timeline</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => {
                  const checked = selectedIds.includes(candidate.id);

                  return (
                    <tr
                      key={candidate.id}
                      className="cursor-pointer"
                      onClick={() => updateQuery({ candidate: candidate.id })}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, candidate.id]
                                : current.filter((item) => item !== candidate.id),
                            )
                          }
                          className="h-4 w-4 rounded border-[var(--border-1)]"
                        />
                      </td>
                      <td>
                        <div>
                          <p className="font-semibold text-[var(--text-1)]">{candidate.name}</p>
                          <p className="mt-1 text-sm text-[var(--text-4)]">@{candidate.githubHandle}</p>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.techStacks.slice(0, 3).map((stack) => (
                            <StackPill key={stack} label={stack} tone="stack" />
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.signalSources.slice(0, 2).map((source) => (
                            <SignalSourcePill key={source} source={source} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <CodeClearStatusBadge status={candidate.status} />
                          <CodeClearTierBadge tier={candidate.tier} />
                        </div>
                      </td>
                      <td>
                        <CodeClearAnalysisBadge state={candidate.analysisState} />
                      </td>
                      <td>
                        <CodeClearScoreBadge
                          value={candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore}
                        />
                      </td>
                      <td>
                        <CandidateMeta
                          updatedAt={candidate.updatedAt}
                          recheckDueAt={candidate.recheckDueAt}
                        />
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
              title="No candidates match these filters"
              body="Try widening the search or add a new CodeClear profile."
            />
          </div>
        )}
      </section>

      {showCreateModal ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center px-4">
          <button
            type="button"
            className="app-dialog-backdrop absolute inset-0"
            aria-label="Close add candidate modal"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="app-dialog-panel relative z-10 w-full max-w-2xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Add candidate
                </h3>
                <p className="mt-2 text-sm text-[var(--text-4)]">
                  Create a CodeClear profile in the shared Gitwork workspace.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ModalField
                label="Name"
                value={createForm.name}
                onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))}
              />
              <ModalField
                label="GitHub"
                value={createForm.githubHandle}
                onChange={(value) =>
                  setCreateForm((current) => ({ ...current, githubHandle: value }))
                }
              />
              <ModalField
                label="Primary stack"
                value={createForm.primaryStack}
                onChange={(value) =>
                  setCreateForm((current) => ({ ...current, primaryStack: value }))
                }
              />
              <ModalField
                label="Email"
                value={createForm.email}
                onChange={(value) => setCreateForm((current) => ({ ...current, email: value }))}
              />
              <ModalField
                label="Location"
                value={createForm.location}
                onChange={(value) =>
                  setCreateForm((current) => ({ ...current, location: value }))
                }
              />
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Tier</span>
                <select
                  value={createForm.tier}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, tier: event.target.value }))
                  }
                  className="app-input"
                >
                  {CODECLEAR_TIERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--text-2)]">Tech stacks</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TECH_STACK_OPTIONS.map((stack) => {
                  const active = createForm.techStacks.includes(stack);
                  return (
                    <button
                      key={stack}
                      type="button"
                      onClick={() =>
                        setCreateForm((current) => ({
                          ...current,
                          techStacks: active
                            ? current.techStacks.filter((entry) => entry !== stack)
                            : [...current.techStacks, stack],
                          primaryStack: current.primaryStack || stack,
                        }))
                      }
                    >
                      <StackPill label={stack} tone="stack" selected={active} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--text-2)]">Signal sources</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CANDIDATE_SIGNAL_SOURCES.map((source) => {
                  const active = createForm.signalSources.includes(source.value);
                  return (
                    <button
                      key={source.value}
                      type="button"
                      onClick={() =>
                        setCreateForm((current) => ({
                          ...current,
                          signalSources: active
                            ? current.signalSources.filter((entry) => entry !== source.value)
                            : [...current.signalSources, source.value],
                        }))
                      }
                    >
                      <SignalSourcePill source={source.value} active={active} />
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">Bio</span>
              <textarea
                value={createForm.bio}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, bio: event.target.value }))
                }
                className="app-textarea min-h-[96px]"
              />
            </label>

            <div className="mt-6 flex justify-end gap-2">
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
                      signalSources: createForm.signalSources,
                      email: createForm.email || null,
                      location: createForm.location || null,
                      bio: createForm.bio || null,
                      tier: createForm.tier as CodeClearTier,
                    },
                    {
                      onSuccess: (result) => {
                        setShowCreateModal(false);
                        setCreateForm({
                          name: "",
                          githubHandle: "",
                          primaryStack: "",
                          techStacks: [],
                          signalSources: ["GITHUB"],
                          email: "",
                          location: "",
                          bio: "",
                          tier: "TIER_1",
                        });
                        updateQuery({ candidate: result.candidate.id });
                      },
                    },
                  )
                }
                loading={createCandidate.isPending}
              >
                Create candidate
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

function ModalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="app-input"
      />
    </label>
  );
}
