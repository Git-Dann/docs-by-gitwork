"use client";

import {
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CloudArrowDownIcon,
  DocumentArrowDownIcon,
  IdentificationIcon,
  LinkIcon,
  MapPinIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useAddCodeClearCandidateNote,
  useApplyCodeClearGitHubRun,
  useCodeClearCandidate,
  useCreatePlacement,
  useDeleteCodeClearCandidate,
  useFinalizeCodeClearCandidateScore,
  useRunCodeClearGitHubAnalysis,
  useUpdateCodeClearCandidate,
} from "@/hooks/use-codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { getCodeClearScorecardUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  CANDIDATE_SIGNAL_SOURCES,
  CODECLEAR_TIERS,
  IDENTITY_CONFIDENCE_LEVELS,
  PIPELINE_STATUSES,
  type CandidateSignalSource,
  type CodeClearTier,
  type IdentityConfidence,
  type PipelineStatus,
} from "@/types/codeclear";
import {
  CodeClearActionButton,
  CodeClearAnalysisBadge,
  CodeClearScoreBadge,
  CodeClearStatusBadge,
  CodeClearTierPanel,
  CandidateMeta,
  SignalSourceIcons,
  StackPill,
} from "@/components/codeclear/codeclear-shared";
import {
  CalibreBreakdown,
  ValidationCheckList,
} from "@/components/codeclear/calibre-breakdown";
import {
  CandidateProfileForm,
  emptyCandidateProfile,
  type CandidateProfileValue,
} from "@/components/codeclear/candidate-profile-form";

// Sources that support automated scraping
const SCRAPABLE_SOURCES: CandidateSignalSource[] = ["GITHUB", "LINKEDIN", "PORTFOLIO"];

function toTitleCase(str: string) {
  return str.charAt(0) + str.slice(1).toLowerCase();
}

export function CodeClearCandidateDrawer({
  candidateId,
  onClose,
  onDeleted,
}: {
  candidateId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const candidateQuery = useCodeClearCandidate(candidateId);
  const updateCandidate = useUpdateCodeClearCandidate(candidateId);
  const addNote = useAddCodeClearCandidateNote(candidateId);
  const finalizeScore = useFinalizeCodeClearCandidateScore(candidateId);
  const runAnalysis = useRunCodeClearGitHubAnalysis(candidateId);
  const applyRun = useApplyCodeClearGitHubRun(candidateId);
  const deleteCandidate = useDeleteCodeClearCandidate();
  const createPlacementMutation = useCreatePlacement(candidateId);
  const clientsQuery = useClientList();
  const portalClients = clientsQuery.data?.clients.filter(c => c.source === "MANUAL") ?? [];
  const candidate = candidateQuery.data?.candidate ?? null;
  const latestRun = candidate?.latestGitHubAnalysis ?? null;

  const [showPlacementForm, setShowPlacementForm] = useState(false);
  const [placementForm, setPlacementForm] = useState({
    clientId: "",
    clientName: "",
    projectName: "",
    startDate: "",
    endDate: "",
  });
  const [placementError, setPlacementError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<CandidateProfileValue>(emptyCandidateProfile);
  // Workflow controls live outside the shared profile form.
  const [drawerStatus, setDrawerStatus] = useState<PipelineStatus>("SOURCED");
  const [drawerTierOverride, setDrawerTierOverride] = useState<string>("");
  const [scoreForm, setScoreForm] = useState({
    technicalDepth: "0",
    codeQuality: "0",
    aiFluency: "0",
    deliveryReadiness: "0",
    identityConfidence: "PENDING" as IdentityConfidence,
    taskScore: "",
    taskTimeSeconds: "",
    taskAiReview: "",
  });
  const [noteBody, setNoteBody] = useState("");

  useEffect(() => {
    if (!candidate) {
      return;
    }

    setProfileForm({
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
      yearsExperience: candidate.yearsExperience != null ? String(candidate.yearsExperience) : "",
      hourlyRate: candidate.hourlyRate != null ? String(candidate.hourlyRate) : "",
      currency: candidate.currency ?? "",
      timezone: candidate.timezone ?? "",
      availability: candidate.availability ?? "",
      origin: candidate.origin,
    });
    setDrawerStatus(candidate.status);
    setDrawerTierOverride(candidate.tierManualOverride ?? "");

    const sourceScore = candidate.scoreDraft ?? candidate.score;

    setScoreForm({
      technicalDepth: String(sourceScore?.technicalDepth ?? 0),
      codeQuality: String(sourceScore?.codeQuality ?? 0),
      aiFluency: String(sourceScore?.aiFluency ?? 0),
      deliveryReadiness: String(sourceScore?.deliveryReadiness ?? 0),
      identityConfidence: sourceScore?.identityConfidence ?? "PENDING",
      taskScore: sourceScore?.taskScore != null ? String(sourceScore.taskScore) : "",
      taskTimeSeconds:
        sourceScore?.taskTimeSeconds != null ? String(sourceScore.taskTimeSeconds) : "",
      taskAiReview: sourceScore?.taskAiReview ?? "",
    });
  }, [candidate]);

  async function handleAddPlacement() {
    if (!placementForm.clientName.trim() || !placementForm.projectName.trim() || !placementForm.startDate) return;
    setPlacementError(null);
    try {
      await createPlacementMutation.mutateAsync({
        clientId: placementForm.clientId || undefined,
        clientName: placementForm.clientName.trim(),
        projectName: placementForm.projectName.trim(),
        startDate: new Date(placementForm.startDate),
        endDate: placementForm.endDate ? new Date(placementForm.endDate) : null,
      });
      setShowPlacementForm(false);
      setPlacementForm({ clientId: "", clientName: "", projectName: "", startDate: "", endDate: "" });
    } catch (err) {
      setPlacementError((err as Error).message);
    }
  }

  if (!candidateId) {
    return null;
  }

  const previewScore =
    scoreForm.technicalDepth || scoreForm.codeQuality || scoreForm.aiFluency || scoreForm.deliveryReadiness
      ? Math.round(
          (Number(scoreForm.technicalDepth || 0) +
            Number(scoreForm.codeQuality || 0) +
            Number(scoreForm.aiFluency || 0) +
            Number(scoreForm.deliveryReadiness || 0)) /
            4,
        )
      : null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        className="app-dialog-backdrop absolute inset-0"
        aria-label="Close candidate drawer"
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-[760px] flex-col border-l border-[var(--border-2)] bg-white shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between border-b border-[var(--border-2)] px-6 pb-5 pt-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              Candidate
            </p>
            <h2 className="mt-2 truncate text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-1)]">
              {candidate?.name ?? "Loading"}
            </h2>
            {candidate ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CodeClearStatusBadge status={candidate.status} />
                <CodeClearAnalysisBadge state={candidate.analysisState} />
                <CodeClearScoreBadge
                  value={candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore}
                />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-2)] bg-white text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {candidateQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
              <div className="h-48 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
            </div>
          ) : candidate ? (
            <div className="space-y-6">
              {/* Profile header */}
              <section className="app-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-4">
                      {candidate.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.avatarUrl}
                          alt={candidate.name}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-brand)] text-lg font-semibold text-[var(--brand-700)]">
                          {candidate.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-lg font-semibold text-[var(--text-1)]">
                            {candidate.name}
                          </p>
                          <AvailabilityBadge availability={candidate.availability} />
                        </div>
                        <a
                          href={`https://github.com/${candidate.githubHandle}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)]"
                        >
                          @{candidate.githubHandle}
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </a>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {candidate.primaryStack ? (
                            <StackPill label={candidate.primaryStack} tone="stack" />
                          ) : null}
                          {candidate.location ? <StackPill label={candidate.location} /> : null}
                        </div>
                        <ExternalLinkStrip
                          linkedinUrl={candidate.linkedinUrl}
                          cvUrl={candidate.cvUrl}
                          portfolioUrl={candidate.portfolioUrl}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                      <div className="space-y-3">
                        <SignalSourceIcons sources={candidate.signalSources} />
                        <CandidateMeta
                          updatedAt={candidate.updatedAt}
                          recheckDueAt={
                            candidate.analysisState === "NEVER_RUN" ? null : candidate.recheckDueAt
                          }
                          prefix={candidate.analysisState === "NEVER_RUN" ? "Never run" : "Updated"}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <CodeClearActionButton
                            type="button"
                            trailingIcon={<SparklesIcon className="h-4 w-4" />}
                            onClick={() => runAnalysis.mutate()}
                            loading={runAnalysis.isPending}
                            className="min-w-[146px]"
                          >
                            {candidate.analysisState === "NEVER_RUN" ? "Run validation" : "Re-run validation"}
                          </CodeClearActionButton>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            leadingIcon={<DocumentArrowDownIcon className="h-4 w-4" />}
                            onClick={() => {
                              window.open(
                                getCodeClearScorecardUrl(candidate.id),
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                          >
                            Scorecard
                          </Button>
                        </div>
                      </div>

                      <CodeClearTierPanel tier={candidate.tier} className="shrink-0" />
                    </div>
                  </div>
                </div>

                {candidate.bio ? (
                  <p className="mt-4 text-sm leading-6 text-[var(--text-3)]">{candidate.bio}</p>
                ) : null}

                <CommercialsStrip
                  yearsExperience={candidate.yearsExperience}
                  hourlyRate={candidate.hourlyRate}
                  currency={candidate.currency}
                  timezone={candidate.timezone}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SignalCard
                    icon={<IdentificationIcon className="h-4 w-4" />}
                    label="Identity confidence"
                    value={
                      candidate.score?.identityConfidence
                        ? toTitleCase(candidate.score.identityConfidence)
                        : toTitleCase(scoreForm.identityConfidence)
                    }
                  />
                  <SignalCard
                    icon={<BoltIcon className="h-4 w-4" />}
                    label="Verification score"
                    value={
                      candidate.score?.overallScore != null
                        ? `${candidate.score.overallScore}/100`
                        : candidate.scoreDraft?.overallScore != null
                          ? `${candidate.scoreDraft.overallScore}/100 draft`
                          : "Pending"
                    }
                  />
                  <SignalCard
                    icon={<LinkIcon className="h-4 w-4" />}
                    label="Signal sources"
                    value={candidate.signalSources.length ? `${candidate.signalSources.length} connected` : "Not set"}
                  />
                  <SignalCard
                    icon={<MapPinIcon className="h-4 w-4" />}
                    label="Delivery fit"
                    value={candidate.status === "CODECLEAR_COMPLETE" ? "Ready to place" : "In review"}
                  />
                </div>
              </section>

              {/* Calibre breakdown — sub-scores, identity caps, red-flag penalty */}
              <CalibreBreakdown
                score={candidate.score}
                scoreDraft={candidate.scoreDraft}
                effectiveTier={candidate.effectiveTier}
                redFlagsCount={
                  Array.isArray(candidate.latestGitHubAnalysis?.redFlags)
                    ? (candidate.latestGitHubAnalysis!.redFlags as string[]).length
                    : 0
                }
              />

              {/* Validation checks — receipts behind the calibre score */}
              <section className="app-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-1)]">Validation checks</p>
                    <p className="mt-1 text-sm text-[var(--text-4)]">
                      Signals from the latest validation run. Each line feeds the calibre score.
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <ValidationCheckList checks={candidate.checks ?? []} />
                </div>
              </section>

              {/* Profile edit */}
              <section className="app-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-1)]">Profile</p>
                    <p className="mt-1 text-sm text-[var(--text-4)]">
                      Identity, tech stack, validation links, and commercials.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <CandidateProfileForm value={profileForm} onChange={setProfileForm} />
                </div>

                {/* Workflow controls (status + tier override) — admin operating
                    knobs, not profile content. Kept separate from the shared form. */}
                <div className="mt-5 grid gap-3 border-t border-[var(--border-2)] pt-4 sm:grid-cols-2">
                  <DrawerSelect
                    label="Status"
                    value={drawerStatus}
                    onChange={(value) => setDrawerStatus(value as PipelineStatus)}
                    options={PIPELINE_STATUSES.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                  />
                  <DrawerSelect
                    label={`Tier override (derived: ${candidate.tier})`}
                    value={drawerTierOverride}
                    onChange={(value) => setDrawerTierOverride(value)}
                    options={[
                      { value: "", label: "Auto (from score)" },
                      ...CODECLEAR_TIERS.map((item) => ({
                        value: item.value,
                        label: item.label,
                      })),
                    ]}
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      updateCandidate.mutate({
                        name: profileForm.name,
                        githubHandle: profileForm.githubHandle,
                        email: profileForm.email || null,
                        primaryStack: profileForm.primaryStack,
                        techStacks: profileForm.techStacks.length
                          ? profileForm.techStacks
                          : [profileForm.primaryStack],
                        location: profileForm.location || null,
                        bio: profileForm.bio || null,
                        linkedinUrl: profileForm.linkedinUrl || null,
                        cvUrl: profileForm.cvUrl || null,
                        portfolioUrl: profileForm.portfolioUrl || null,
                        yearsExperience:
                          profileForm.yearsExperience !== ""
                            ? Number(profileForm.yearsExperience)
                            : null,
                        hourlyRate:
                          profileForm.hourlyRate !== "" ? Number(profileForm.hourlyRate) : null,
                        currency: profileForm.currency || null,
                        timezone: profileForm.timezone || null,
                        availability: profileForm.availability || null,
                        status: drawerStatus,
                        tierManualOverride: (drawerTierOverride || null) as
                          | CodeClearTier
                          | null,
                      })
                    }
                    loading={updateCandidate.isPending}
                  >
                    Save changes
                  </Button>
                </div>
              </section>

              {/* Verification */}
              <section className="app-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-1)]">Verification</p>
                    <p className="mt-1 text-sm text-[var(--text-4)]">
                      Score the candidate across key dimensions, then finalize as a CodeClear record.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {previewScore !== null ? (
                      <span className="text-xs text-[var(--text-4)]">Preview: {previewScore}/100</span>
                    ) : null}
                    <CodeClearScoreBadge
                      value={candidate.score?.overallScore ?? candidate.scoreDraft?.overallScore}
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <ScoreSlider
                    label="Technical depth"
                    value={Number(scoreForm.technicalDepth || 0)}
                    onChange={(value) =>
                      setScoreForm((current) => ({ ...current, technicalDepth: String(value) }))
                    }
                  />
                  <ScoreSlider
                    label="Code quality"
                    value={Number(scoreForm.codeQuality || 0)}
                    onChange={(value) =>
                      setScoreForm((current) => ({ ...current, codeQuality: String(value) }))
                    }
                  />
                  <ScoreSlider
                    label="AI fluency"
                    value={Number(scoreForm.aiFluency || 0)}
                    onChange={(value) =>
                      setScoreForm((current) => ({ ...current, aiFluency: String(value) }))
                    }
                  />
                  <ScoreSlider
                    label="Delivery readiness"
                    value={Number(scoreForm.deliveryReadiness || 0)}
                    onChange={(value) =>
                      setScoreForm((current) => ({ ...current, deliveryReadiness: String(value) }))
                    }
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DrawerSelect
                    label="Identity confidence"
                    value={scoreForm.identityConfidence}
                    onChange={(value) =>
                      setScoreForm((current) => ({
                        ...current,
                        identityConfidence: value as IdentityConfidence,
                      }))
                    }
                    options={IDENTITY_CONFIDENCE_LEVELS.map((value) => ({
                      value,
                      label: toTitleCase(value),
                    }))}
                  />
                  <DrawerField
                    label="Task score (0–100)"
                    type="number"
                    value={scoreForm.taskScore}
                    onChange={(value) =>
                      setScoreForm((current) => ({ ...current, taskScore: value }))
                    }
                  />
                  <DrawerField
                    label="Task time (seconds)"
                    type="number"
                    value={scoreForm.taskTimeSeconds}
                    onChange={(value) =>
                      setScoreForm((current) => ({ ...current, taskTimeSeconds: value }))
                    }
                  />
                </div>

                <label className="mt-3 block space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-2)]">Review note</span>
                  <textarea
                    value={scoreForm.taskAiReview}
                    onChange={(event) =>
                      setScoreForm((current) => ({ ...current, taskAiReview: event.target.value }))
                    }
                    className="app-textarea min-h-[88px]"
                  />
                </label>

                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      finalizeScore.mutate({
                        technicalDepth: Number(scoreForm.technicalDepth || 0),
                        codeQuality: Number(scoreForm.codeQuality || 0),
                        aiFluency: Number(scoreForm.aiFluency || 0),
                        deliveryReadiness: Number(scoreForm.deliveryReadiness || 0),
                        identityConfidence: scoreForm.identityConfidence as IdentityConfidence,
                        taskScore: scoreForm.taskScore ? Number(scoreForm.taskScore) : null,
                        taskTimeSeconds: scoreForm.taskTimeSeconds
                          ? Number(scoreForm.taskTimeSeconds)
                          : null,
                        taskAiReview: scoreForm.taskAiReview || null,
                      })
                    }
                    loading={finalizeScore.isPending}
                  >
                    Finalize score
                  </Button>
                </div>
              </section>

              {/* Signals & Evidence */}
              <section className="app-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-1)]">Signals & evidence</p>
                    <p className="mt-1 text-sm text-[var(--text-4)]">
                      Request or scrape evidence from multiple sources, then finalize the candidate score.
                    </p>
                  </div>
                  {latestRun ? <CodeClearAnalysisBadge state={candidate.analysisState} /> : null}
                </div>

                <div className="mt-4 space-y-2">
                  {CANDIDATE_SIGNAL_SOURCES.map((source) => {
                    const canScrape = SCRAPABLE_SOURCES.includes(source.value);
                    const isGitHub = source.value === "GITHUB";
                    return (
                      <div
                        key={source.value}
                        className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3"
                      >
                        <span className="text-sm font-medium text-[var(--text-2)]">
                          {source.label}
                        </span>
                        <div className="flex items-center gap-2">
                          {canScrape ? (
                            <Button
                              type="button"
                              variant="utility"
                              size="sm"
                              leadingIcon={<CloudArrowDownIcon className="h-3.5 w-3.5" />}
                              onClick={() =>
                                isGitHub
                                  ? runAnalysis.mutate()
                                  : updateCandidate.mutate({ scrapeSignalSource: source.value })
                              }
                              loading={isGitHub ? runAnalysis.isPending : updateCandidate.isPending}
                            >
                              Scrape
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant={source.value === "GITHUB" ? "secondary" : "utility"}
                            size="sm"
                            onClick={() =>
                              updateCandidate.mutate({ requestSignalSource: source.value })
                            }
                          >
                            Request
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {latestRun?.status === "COMPLETED" ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leadingIcon={<PlayIcon className="h-4 w-4" />}
                      onClick={() => applyRun.mutate(latestRun.id)}
                      loading={applyRun.isPending}
                    >
                      Apply latest run
                    </Button>
                  </div>
                ) : null}

                {latestRun ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MiniStat
                        label="Average health"
                        value={String(latestRun.metrics?.averageHealthScore ?? "—")}
                      />
                      <MiniStat
                        label="Recent repos"
                        value={
                          latestRun.metrics?.recentRepoRatio != null
                            ? `${latestRun.metrics.recentRepoRatio}%`
                            : "—"
                        }
                      />
                    </div>

                    {latestRun.metrics?.topLanguages?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {latestRun.metrics.topLanguages.map((language, index) => (
                          <StackPill
                            key={`${language.language}-${index}`}
                            label={language.language}
                            tone={index === 0 ? "brand" : "neutral"}
                          />
                        ))}
                      </div>
                    ) : null}

                    {latestRun.llmSummary ? (
                      <p className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-sm leading-6 text-[var(--text-2)]">
                        {latestRun.llmSummary}
                      </p>
                    ) : null}

                    {latestRun.redFlags?.length ? (
                      <div className="space-y-2">
                        {latestRun.redFlags.map((flag) => (
                          <p
                            key={flag}
                            className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                          >
                            {flag}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <p className="text-xs text-[var(--text-4)]">
                      Last run {formatDate(latestRun.completedAt ?? latestRun.createdAt)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-4">
                    <p className="text-sm font-medium text-[var(--text-2)]">
                      No repository signal captured yet.
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-4)]">
                      Request or scrape GitHub, LinkedIn, CV, interview, or portfolio evidence to make the record more complete before scoring.
                    </p>
                  </div>
                )}
              </section>

              {/* Notes */}
              <section className="app-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-1)]">Notes</p>
                  <span className="text-xs text-[var(--text-4)]">{candidate.notes.length}</span>
                </div>

                <label className="mt-4 block space-y-1.5">
                  <span className="text-sm font-medium text-[var(--text-2)]">Add note</span>
                  <textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    className="app-textarea min-h-[96px]"
                  />
                </label>

                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      addNote.mutate(
                        { body: noteBody },
                        {
                          onSuccess: () => setNoteBody(""),
                        },
                      )
                    }
                    loading={addNote.isPending}
                    disabled={!noteBody.trim()}
                  >
                    Save note
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  {candidate.notes.slice(0, 6).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3"
                    >
                      <p className="text-sm leading-6 text-[var(--text-2)]">{note.body}</p>
                      <p className="mt-2 text-xs text-[var(--text-4)]">
                        {note.createdBy} • {formatDate(note.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="app-card p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-1)]">Engagements</p>
                      {candidate.currentClient ? (
                        <p className="mt-1 text-xs text-[var(--text-4)]">
                          Currently with{" "}
                          <span className="font-medium text-[var(--text-2)]">
                            {candidate.currentClient.name}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--text-4)]">No active engagement.</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="utility"
                      size="icon-sm"
                      onClick={() => setShowPlacementForm((v) => !v)}
                      aria-label="Add placement"
                      title="Add placement"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  {showPlacementForm && (
                    <div className="mt-4 space-y-3 rounded-[10px] border border-[var(--border-2)] p-4">
                      {portalClients.length > 0 && (
                        <label className="block space-y-1">
                          <span className="app-field-label">Portal client</span>
                          <select
                            value={placementForm.clientId}
                            onChange={(e) => {
                              const selected = portalClients.find(c => c.id === e.target.value);
                              setPlacementForm((f) => ({
                                ...f,
                                clientId: e.target.value,
                                clientName: selected?.name ?? f.clientName,
                              }));
                            }}
                            className="app-select w-full"
                          >
                            <option value="">— None —</option>
                            {portalClients.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="block space-y-1">
                        <span className="app-field-label">Client name</span>
                        <input
                          value={placementForm.clientName}
                          onChange={(e) => setPlacementForm((f) => ({ ...f, clientName: e.target.value }))}
                          className="app-input w-full"
                          placeholder="Acme Corp"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="app-field-label">Project name</span>
                        <input
                          value={placementForm.projectName}
                          onChange={(e) => setPlacementForm((f) => ({ ...f, projectName: e.target.value }))}
                          className="app-input w-full"
                          placeholder="Platform Rebuild"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="app-field-label">Start date</span>
                          <input
                            type="date"
                            value={placementForm.startDate}
                            onChange={(e) => setPlacementForm((f) => ({ ...f, startDate: e.target.value }))}
                            className="app-input w-full"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="app-field-label">End date</span>
                          <input
                            type="date"
                            value={placementForm.endDate}
                            onChange={(e) => setPlacementForm((f) => ({ ...f, endDate: e.target.value }))}
                            className="app-input w-full"
                          />
                        </label>
                      </div>
                      {placementError && (
                        <p className="text-xs text-rose-600">{placementError}</p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" size="xs" onClick={() => setShowPlacementForm(false)}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          loading={createPlacementMutation.isPending}
                          disabled={createPlacementMutation.isPending || !placementForm.clientName.trim() || !placementForm.projectName.trim() || !placementForm.startDate}
                          onClick={() => void handleAddPlacement()}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 space-y-3">
                    {candidate.placements.length ? (
                      candidate.placements.map((placement) => (
                        <div key={placement.id} className="rounded-[10px] border border-[var(--border-2)] px-4 py-3">
                          <p className="text-sm font-semibold text-[var(--text-1)]">
                            {placement.clientName}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-3)]">
                            {placement.projectName}
                          </p>
                          <p className="mt-2 text-xs text-[var(--text-4)]">
                            {formatDate(placement.startDate)}
                            {placement.endDate ? ` – ${formatDate(placement.endDate)}` : " – present"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-4)]">No placements yet.</p>
                    )}
                  </div>
                </section>

                <section className="app-card p-5">
                  <p className="text-sm font-semibold text-[var(--text-1)]">Activity</p>
                  <div className="mt-4 space-y-3">
                    {candidate.activityLog.slice(0, 6).map((entry) => (
                      <div key={entry.id} className="rounded-[10px] border border-[var(--border-2)] px-4 py-3">
                        <p className="text-sm font-medium text-[var(--text-1)]">{entry.eventType}</p>
                        <p className="mt-1 text-xs text-[var(--text-4)]">{formatDate(entry.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="app-card p-6 text-sm text-[var(--text-4)]">
              Candidate not found.
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-2)] px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="danger"
              size="sm"
              leadingIcon={<TrashIcon className="h-4 w-4" />}
              onClick={() =>
                deleteCandidate.mutate(candidateId, {
                  onSuccess: () => {
                    onDeleted?.();
                    onClose();
                  },
                })
              }
              loading={deleteCandidate.isPending}
            >
              Delete
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const clipped = Math.min(100, Math.max(0, value));
  const barColor =
    clipped >= 80
      ? "bg-emerald-500"
      : clipped >= 60
        ? "bg-sky-500"
        : clipped >= 40
          ? "bg-amber-500"
          : "bg-rose-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
        <div className="flex items-center gap-2">
          <div className="h-2 w-32 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className={`h-full rounded-full transition-all duration-200 ${barColor}`}
              style={{ width: `${clipped}%` }}
            />
          </div>
          <input
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-16 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-center text-sm font-semibold text-[var(--text-1)] focus:border-[var(--brand-500)] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function DrawerField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: React.ComponentProps<"input">["type"];
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="app-input"
      />
    </label>
  );
}

function DrawerSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="app-input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function SignalCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(63,98,255,0.12)] bg-[linear-gradient(180deg,rgba(63,98,255,0.08),rgba(255,255,255,0.98))] px-4 py-4">
      <div className="flex items-center gap-2 text-[var(--brand-700)]">{icon}</div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">{value}</p>
    </div>
  );
}

/** Tiny LinkedIn / CV / Portfolio link strip under the candidate's name. */
function ExternalLinkStrip({
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

/** Compact mono row showing years exp / hourly rate / timezone. */
function CommercialsStrip({
  yearsExperience,
  hourlyRate,
  currency,
  timezone,
}: {
  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string | null;
  timezone: string | null;
}) {
  const entries: Array<{ label: string; value: string }> = [];
  if (yearsExperience != null) {
    entries.push({
      label: "Experience",
      value: `${yearsExperience} ${yearsExperience === 1 ? "year" : "years"}`,
    });
  }
  if (hourlyRate != null) {
    entries.push({
      label: "Hourly rate",
      value: `${currency ?? ""} ${hourlyRate}`.trim(),
    });
  }
  if (timezone) {
    entries.push({ label: "Timezone", value: timezone });
  }
  if (entries.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
      {entries.map((entry) => (
        <div key={entry.label}>
          <p className="widget-data-label">{entry.label}</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--text-1)]">{entry.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Availability pill that sits next to the name. */
function AvailabilityBadge({
  availability,
}: {
  availability: "AVAILABLE" | "ENGAGED" | "UNAVAILABLE" | null;
}) {
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
      className={`inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}
    >
      {label}
    </span>
  );
}
