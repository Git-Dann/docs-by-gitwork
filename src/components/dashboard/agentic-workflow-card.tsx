"use client";

import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, formatDate } from "@/lib/format";
import {
  useCreateAutomationOnboardingLink,
  useDraftProposalFromMeeting,
  useFoundryAutomation,
  usePreviewProposalDraft,
  usePreviewProjectPlan,
  useSeedProjectPlan,
  useUpdateAutomationNudge,
} from "@/hooks/use-foundry-automation";
import type {
  AutomationOnboardingLinkResult,
  AutomationGateState,
  AutomationStageKey,
  FoundryAutomationItem,
  ProposalDraftEdits,
  ProposalDraftPreview,
  ProjectPlanPreview,
} from "@/types/foundry-automation";

const STAGE_TONE: Record<AutomationStageKey, string> = {
  INTAKE_NEEDED: "border-slate-200 bg-slate-50 text-slate-700",
  DRAFT_PROPOSAL: "border-blue-200 bg-blue-50 text-blue-700",
  REVIEW_PROPOSAL: "border-amber-200 bg-amber-50 text-amber-800",
  WAITING_SIGNATURE: "border-sky-200 bg-sky-50 text-sky-700",
  SEND_ONBOARDING: "border-violet-200 bg-violet-50 text-violet-800",
  READY_TO_ACTIVATE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  READY_TO_SEED_PLAN: "border-indigo-200 bg-indigo-50 text-indigo-800",
  DELIVERY_ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const GATE_TONE: Record<AutomationGateState, string> = {
  done: "bg-emerald-500",
  ready: "bg-blue-500",
  waiting: "bg-amber-400",
  blocked: "bg-slate-300",
};

export function AgenticWorkflowCard() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isFetching } = useFoundryAutomation();
  const onboardingLink = useCreateAutomationOnboardingLink();
  const draftProposal = useDraftProposalFromMeeting();
  const previewProposal = usePreviewProposalDraft();
  const previewPlan = usePreviewProjectPlan();
  const seedPlan = useSeedProjectPlan();
  const updateNudge = useUpdateAutomationNudge();
  const [reviewing, setReviewing] = useState<{
    item: FoundryAutomationItem;
    startDate: string;
  } | null>(null);
  const [draftReviewing, setDraftReviewing] = useState<FoundryAutomationItem | null>(null);
  const [draftPreview, setDraftPreview] = useState<ProposalDraftPreview | null>(null);
  const [draftEdits, setDraftEdits] = useState<Required<ProposalDraftEdits> | null>(null);
  const [actionDrawerItem, setActionDrawerItem] = useState<FoundryAutomationItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [preview, setPreview] = useState<ProjectPlanPreview | null>(null);
  const [draftingClientId, setDraftingClientId] = useState<string | null>(null);
  const [onboardingClientId, setOnboardingClientId] = useState<string | null>(null);
  const [onboardingShare, setOnboardingShare] = useState<AutomationOnboardingLinkResult | null>(null);
  const [previewingClientId, setPreviewingClientId] = useState<string | null>(null);
  const [seedingClientId, setSeedingClientId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const items = useMemo(() => data?.items.slice(0, 6) ?? [], [data?.items]);

  async function handleOnboardingLink(item: FoundryAutomationItem) {
    setNotice(null);
    setReviewError(null);
    setOnboardingClientId(item.client.id);
    try {
      const response = await onboardingLink.mutateAsync({ clientId: item.client.id });
      setOnboardingShare(response.result);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not prepare an onboarding link.");
    } finally {
      setOnboardingClientId(null);
    }
  }

  async function handleDraftProposal(item: FoundryAutomationItem) {
    setNotice(null);
    setReviewError(null);
    setDraftingClientId(item.client.id);
    try {
      const response = await previewProposal.mutateAsync({
        clientId: item.client.id,
        meetingId: item.latestMeeting?.id,
      });
      setDraftPreview(response.preview);
      setDraftEdits(response.preview.draft);
      setDraftReviewing(item);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not preview a proposal from these notes.");
    } finally {
      setDraftingClientId(null);
    }
  }

  async function handleApproveDraft() {
    if (!draftReviewing || !draftEdits) return;
    const item = draftReviewing;
    setNotice(null);
    setReviewError(null);
    setDraftingClientId(item.client.id);
    try {
      const response = await draftProposal.mutateAsync({
        clientId: item.client.id,
        meetingId: item.latestMeeting?.id,
        draft: draftEdits,
      });
      setNotice(
        response.result.created
          ? `${item.client.name}: drafted ${response.result.proposalTitle} from ${response.result.meetingTitle}.`
          : `${item.client.name}: opening existing draft ${response.result.proposalTitle}.`,
      );
      setDraftReviewing(null);
      setDraftPreview(null);
      setDraftEdits(null);
      router.push(response.result.href);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not create the reviewed proposal draft.");
    } finally {
      setDraftingClientId(null);
    }
  }

  async function handleAssignNudge(item: FoundryAutomationItem) {
    const nudge = item.nudges[0];
    if (!nudge) return;
    setNotice(null);
    try {
      await updateNudge.mutateAsync({
        clientId: item.client.id,
        kind: nudge.kind,
        note: "Assigned from Agentic Workflow.",
      });
      setNotice(`${item.client.name}: nudge assigned.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not assign this nudge.");
    }
  }

  async function handleSnoozeNudge(item: FoundryAutomationItem) {
    const nudge = item.nudges[0];
    if (!nudge) return;
    const until = new Date();
    until.setDate(until.getDate() + 3);
    setNotice(null);
    try {
      await updateNudge.mutateAsync({
        clientId: item.client.id,
        kind: nudge.kind,
        snoozedUntil: until.toISOString(),
        note: "Snoozed for three days from Agentic Workflow.",
      });
      setNotice(`${item.client.name}: nudge snoozed for 3 days.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not snooze this nudge.");
    }
  }

  async function loadPreview(item: FoundryAutomationItem, startDate?: string) {
    setNotice(null);
    setReviewError(null);
    setPreviewingClientId(item.client.id);
    try {
      const response = await previewPlan.mutateAsync({
        clientId: item.client.id,
        documentId: item.sourceProposal?.id,
        startDate: startDate || undefined,
      });
      setPreview(response.preview);
      setReviewing({ item, startDate: toDateInput(response.preview.startDate) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not preview the project plan.";
      setReviewError(message);
      if (!reviewing) {
        setNotice(message);
      }
    } finally {
      setPreviewingClientId(null);
    }
  }

  async function handleOpenReview(item: FoundryAutomationItem) {
    setPreview(null);
    setReviewing({ item, startDate: "" });
    await loadPreview(item);
  }

  async function handleRefreshPreview() {
    if (!reviewing) return;
    await loadPreview(reviewing.item, reviewing.startDate);
  }

  async function handleSeed() {
    if (!reviewing) return;
    const item = reviewing.item;
    setNotice(null);
    setReviewError(null);
    setSeedingClientId(item.client.id);
    try {
      const response = await seedPlan.mutateAsync({
        clientId: item.client.id,
        documentId: item.sourceProposal?.id,
        startDate: reviewing.startDate || undefined,
      });
      const { created, skipped, sourceDocumentTitle } = response.result;
      setNotice(
        `${item.client.name}: seeded ${created.featureBlocks} blocks, ${created.tasks} tasks, ${created.milestones} milestones from ${sourceDocumentTitle}. ${skipped.tasks + skipped.featureBlocks + skipped.milestones} existing items skipped.`,
      );
      setReviewing(null);
      setPreview(null);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not seed the project plan.");
    } finally {
      setSeedingClientId(null);
    }
  }

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">09</span>
          {" // AGENTIC WORKFLOW"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRuns((value) => !value)}
            className="text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
          >
            Runs
          </button>
          <button
            type="button"
            onClick={() => setShowCompleted((value) => !value)}
            className="text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
          >
            Completed {data?.completedItems.length ?? 0}
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
          >
            <ArrowPathIcon className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4">
        {error ? (
          <div className="rounded-[8px] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            Could not load the automation loop.
          </div>
        ) : null}

        {data ? (
          <div className="grid gap-2 sm:grid-cols-4">
            <SummaryTile label="Human gates" value={data.summary.humanGates} />
            <SummaryTile label="Agent ready" value={data.summary.agentReady} />
            <SummaryTile label="Waiting client" value={data.summary.waitingOnClient} />
            <SummaryTile label="Plan gaps" value={data.summary.activePlanGaps} />
          </div>
        ) : null}

        {notice ? (
          <div className="mt-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs leading-5 text-[var(--text-3)]">
            {notice}
          </div>
        ) : null}

        <div className="mt-4 divide-y divide-[var(--border-3)] overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-white">
          {items.length === 0 ? (
            <div className="flex items-center gap-3 p-4 text-sm text-[var(--text-3)]">
              <SparklesIcon className="h-5 w-5 text-[var(--brand-700)]" />
              No clients are in the automation loop yet.
            </div>
          ) : (
            items.map((item) => (
              <AutomationRow
                key={item.client.id}
                item={item}
                actionPending={
                  onboardingClientId === item.client.id ||
                  draftingClientId === item.client.id ||
                  seedingClientId === item.client.id ||
                  previewingClientId === item.client.id
                }
                actionDisabled={
                  onboardingLink.isPending ||
                  draftProposal.isPending ||
                  previewProposal.isPending ||
                  seedPlan.isPending ||
                  previewPlan.isPending ||
                  updateNudge.isPending
                }
                onOnboarding={() => void handleOnboardingLink(item)}
                onDraft={() => void handleDraftProposal(item)}
                onSeed={() => void handleOpenReview(item)}
                onActions={() => setActionDrawerItem(item)}
                onAssignNudge={() => void handleAssignNudge(item)}
                onSnoozeNudge={() => void handleSnoozeNudge(item)}
              />
            ))
          )}
        </div>

        {showCompleted && data?.completedItems.length ? (
          <CompactPanel title="Recently completed">
            {data.completedItems.map((item) => (
              <CompletedRow key={item.client.id} item={item} />
            ))}
          </CompactPanel>
        ) : null}

        {showRuns && data?.runHistory.length ? (
          <CompactPanel title="Agent run history">
            {data.runHistory.map((run) => (
              <div key={run.id} className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--text-1)]">{run.label}</p>
                  <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--text-3)]">
                  {run.clientName ?? "Client"} · {run.inputSummary} → {run.outputSummary}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                  {formatDate(run.at)}{run.actorName ? ` · ${run.actorName}` : ""}
                </p>
              </div>
            ))}
          </CompactPanel>
        ) : null}
      </div>

      <ProposalDraftReviewModal
        item={draftReviewing}
        preview={draftPreview}
        edits={draftEdits}
        loading={previewProposal.isPending}
        creating={draftProposal.isPending}
        onEditsChange={setDraftEdits}
        onConfirm={() => void handleApproveDraft()}
        onClose={() => {
          if (draftProposal.isPending) return;
          setDraftReviewing(null);
          setDraftPreview(null);
          setDraftEdits(null);
        }}
      />

      <PlanReviewModal
        item={reviewing?.item ?? null}
        preview={preview}
        startDate={reviewing?.startDate ?? ""}
        loading={previewPlan.isPending}
        seeding={seedPlan.isPending}
        error={reviewError}
        onStartDateChange={(startDate) =>
          setReviewing((current) => (current ? { ...current, startDate } : current))
        }
        onRefresh={() => void handleRefreshPreview()}
        onConfirm={() => void handleSeed()}
        onClose={() => {
          if (seedPlan.isPending) return;
          setReviewing(null);
          setPreview(null);
          setReviewError(null);
        }}
      />

      <OnboardingLinkModal
        result={onboardingShare}
        onClose={() => setOnboardingShare(null)}
      />

      <ActionDrawer
        item={actionDrawerItem}
        actionDisabled={
          onboardingLink.isPending ||
          draftProposal.isPending ||
          previewProposal.isPending ||
          seedPlan.isPending ||
          previewPlan.isPending
        }
        actionPendingClientId={onboardingClientId ?? draftingClientId ?? seedingClientId ?? previewingClientId}
        onClose={() => setActionDrawerItem(null)}
        onDraft={() => actionDrawerItem && void handleDraftProposal(actionDrawerItem)}
        onOnboarding={() => actionDrawerItem && void handleOnboardingLink(actionDrawerItem)}
        onSeed={() => actionDrawerItem && void handleOpenReview(actionDrawerItem)}
      />
    </section>
  );
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function activityLine(item: FoundryAutomationItem): string | null {
  const latest = item.activity[0];
  if (!latest) return null;
  const actor = latest.actorName ? ` · ${latest.actorName}` : "";
  return `Last action: ${latest.label} · ${formatDate(latest.at)}${actor}`;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
      <p className="text-2xl leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
        {label}
      </p>
    </div>
  );
}

function CompactPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
        {title}
      </p>
      <div className="grid gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

function CompletedRow({ item }: { item: FoundryAutomationItem }) {
  return (
    <Link
      href={`/app/portal/${item.client.slug}`}
      className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold text-[var(--text-1)]">{item.client.name}</p>
        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-3)]">
        {item.projectPlan.taskCount} tasks · {item.projectPlan.milestoneCount} milestones
      </p>
    </Link>
  );
}

function AutomationRow({
  item,
  actionPending,
  actionDisabled,
  onOnboarding,
  onDraft,
  onSeed,
  onActions,
  onAssignNudge,
  onSnoozeNudge,
}: {
  item: FoundryAutomationItem;
  actionPending: boolean;
  actionDisabled: boolean;
  onOnboarding: () => void;
  onDraft: () => void;
  onSeed: () => void;
  onActions: () => void;
  onAssignNudge: () => void;
  onSnoozeNudge: () => void;
}) {
  const detail = item.sourceProposal
    ? `${item.sourceProposal.title} · ${item.sourceProposal.status.replace(/_/g, " ")}`
    : item.latestMeeting
      ? `${item.latestMeeting.title} · ${formatDate(item.latestMeeting.startedAt)}`
      : "No proposal context yet";
  const latestActivity = activityLine(item);
  const primaryNudge = item.nudges[0] ?? null;

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app/portal/${item.client.slug}`} className="truncate text-sm font-semibold text-[var(--text-1)] hover:underline">
            {item.client.name}
          </Link>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", STAGE_TONE[item.stage])}>
            {item.stageLabel}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
            {item.confidence}% ready
          </span>
          {primaryNudge ? (
            <span
              title={primaryNudge.detail}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
            >
              <ExclamationTriangleIcon className="h-3 w-3" />
              {primaryNudge.label}
            </span>
          ) : null}
        </div>

        <p className="mt-1 truncate text-xs text-[var(--text-3)]">{detail}</p>
        {latestActivity ? (
          <p className="mt-1 truncate text-[11px] text-[var(--text-4)]">{latestActivity}</p>
        ) : null}
        {primaryNudge?.state ? (
          <p className="mt-1 truncate text-[11px] text-[var(--text-4)]">
            {primaryNudge.state.assignedToName ? `Assigned to ${primaryNudge.state.assignedToName}` : ""}
            {primaryNudge.state.assignedToName && primaryNudge.state.snoozedUntil ? " · " : ""}
            {primaryNudge.state.snoozedUntil ? `Snoozed until ${formatDate(primaryNudge.state.snoozedUntil)}` : ""}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.gates.map((gate) => (
            <span
              key={gate.key}
              title={`${gate.label}: ${gate.detail}`}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-2)] bg-white px-2 py-1 text-[10px] font-medium text-[var(--text-3)]"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", GATE_TONE[gate.state])} />
              {gate.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
        {item.stage === "READY_TO_ACTIVATE" ? (
          <ExclamationTriangleIcon className="h-4 w-4 text-amber-600" />
        ) : item.stage === "WAITING_SIGNATURE" ? (
          <ClockIcon className="h-4 w-4 text-sky-600" />
        ) : item.stage === "DELIVERY_ACTIVE" ? (
          <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
        ) : (
          <SparklesIcon className="h-4 w-4 text-[var(--brand-700)]" />
        )}

        {item.nextAction.kind === "draft_proposal" ? (
          <Button
            type="button"
            size="xs"
            variant="primary"
            loading={actionPending}
            disabled={actionDisabled}
            onClick={onDraft}
          >
            {item.nextAction.label}
          </Button>
        ) : item.nextAction.kind === "send_onboarding" ? (
          <Button
            type="button"
            size="xs"
            variant="primary"
            loading={actionPending}
            disabled={actionDisabled}
            onClick={onOnboarding}
          >
            {item.nextAction.label}
          </Button>
        ) : item.nextAction.kind === "seed_project_plan" ? (
          <Button
            type="button"
            size="xs"
            variant="primary"
            loading={actionPending}
            disabled={actionDisabled}
            onClick={onSeed}
          >
            {item.nextAction.label}
          </Button>
        ) : item.nextAction.href ? (
          <Link
            href={item.nextAction.href}
            className={buttonStyles({ variant: "secondary", size: "xs" })}
          >
            {item.nextAction.label}
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        ) : null}
        {primaryNudge ? (
          <>
            <Button type="button" size="xs" variant="secondary" disabled={actionDisabled} onClick={onAssignNudge}>
              Assign
            </Button>
            <Button type="button" size="xs" variant="secondary" disabled={actionDisabled} onClick={onSnoozeNudge}>
              Snooze
            </Button>
          </>
        ) : null}
        <Button type="button" size="xs" variant="secondary" onClick={onActions}>
          Actions
        </Button>
      </div>
    </div>
  );
}

function linesToText(values: string[]): string {
  return values.join("\n");
}

function textToLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function ProposalDraftReviewModal({
  item,
  preview,
  edits,
  loading,
  creating,
  onEditsChange,
  onConfirm,
  onClose,
}: {
  item: FoundryAutomationItem | null;
  preview: ProposalDraftPreview | null;
  edits: Required<ProposalDraftEdits> | null;
  loading: boolean;
  creating: boolean;
  onEditsChange: (value: Required<ProposalDraftEdits> | null) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const existingDraft = preview?.existingDraft;

  function patch<K extends keyof Required<ProposalDraftEdits>>(
    key: K,
    value: Required<ProposalDraftEdits>[K],
  ) {
    if (!edits) return;
    onEditsChange({ ...edits, [key]: value });
  }

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title="Proposal draft review"
      panelClassName="flex max-h-[calc(100dvh-32px)] w-full max-w-3xl flex-col"
    >
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !preview ? (
          <div className="rounded-[8px] border border-[var(--border-2)] bg-white p-4 text-sm text-[var(--text-3)]">
            Building proposal outline...
          </div>
        ) : null}

        {existingDraft ? (
          <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">Existing draft found</p>
            <p className="mt-1 text-xs text-amber-800">
              This meeting already has a draft. Open it instead of creating a duplicate.
            </p>
            <Link href={existingDraft.href} className={cn("mt-3", buttonStyles({ variant: "primary", size: "sm" }))}>
              Open draft
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : null}

        {edits && !existingDraft ? (
          <div className="space-y-3">
            <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
              <p className="text-sm font-semibold text-[var(--text-1)]">{preview?.clientName ?? item?.client.name}</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                {preview?.meetingTitle ?? item?.latestMeeting?.title ?? "Scribe meeting"} · review before Docs creation
              </p>
            </div>

            <label className="block text-xs font-medium text-[var(--text-3)]">
              Proposal title
              <input
                value={edits.title}
                onChange={(event) => patch("title", event.target.value)}
                className="mt-1 w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
              />
            </label>

            <label className="block text-xs font-medium text-[var(--text-3)]">
              Summary
              <textarea
                value={edits.summary}
                onChange={(event) => patch("summary", event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
              />
            </label>

            {([
              ["objectives", "Objectives"],
              ["touchpoints", "Scope touchpoints"],
              ["assumptions", "Assumptions"],
              ["outOfScope", "Out of scope"],
            ] as const).map(([key, label]) => (
              <label key={key} className="block text-xs font-medium text-[var(--text-3)]">
                {label}
                <textarea
                  value={linesToText(edits[key])}
                  onChange={(event) => patch(key, textToLines(event.target.value))}
                  rows={4}
                  className="mt-1 w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
                />
              </label>
            ))}

            <label className="block text-xs font-medium text-[var(--text-3)]">
              Next steps
              <textarea
                value={edits.nextSteps}
                onChange={(event) => patch("nextSteps", event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
              />
            </label>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-2)] p-4">
        <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={creating}>
          Close
        </Button>
        {!existingDraft ? (
          <Button type="button" variant="primary" size="sm" onClick={onConfirm} loading={creating} disabled={!edits}>
            Create Docs draft
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function ActionDrawer({
  item,
  actionDisabled,
  actionPendingClientId,
  onClose,
  onDraft,
  onOnboarding,
  onSeed,
}: {
  item: FoundryAutomationItem | null;
  actionDisabled: boolean;
  actionPendingClientId: string | null;
  onClose: () => void;
  onDraft: () => void;
  onOnboarding: () => void;
  onSeed: () => void;
}) {
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title="Client actions"
      panelClassName="w-full max-w-md"
    >
      <div className="space-y-2 p-4">
        <p className="mb-3 text-sm font-semibold text-[var(--text-1)]">{item?.client.name ?? "Client"}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={Boolean(item && actionPendingClientId === item.client.id)}
          disabled={actionDisabled || !item?.latestMeeting}
          onClick={onDraft}
          className="w-full justify-start"
        >
          <SparklesIcon className="h-4 w-4" />
          Review proposal draft
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={Boolean(item && actionPendingClientId === item.client.id)}
          disabled={actionDisabled}
          onClick={onOnboarding}
          className="w-full justify-start"
        >
          <LinkIcon className="h-4 w-4" />
          Prepare onboarding link
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={Boolean(item && actionPendingClientId === item.client.id)}
          disabled={actionDisabled}
          onClick={onSeed}
          className="w-full justify-start"
        >
          <CheckCircleIcon className="h-4 w-4" />
          Review and seed delivery plan
        </Button>
        {item ? (
          <Link href={`/app/portal/${item.client.slug}`} className={buttonStyles({ variant: "primary", size: "sm" })}>
            Open client record
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </Modal>
  );
}

function OnboardingLinkModal({
  result,
  onClose,
}: {
  result: AutomationOnboardingLinkResult | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fullUrl = useMemo(() => {
    if (!result) return "";
    if (typeof window === "undefined") return result.path;
    return `${window.location.origin}${result.path}`;
  }, [result]);
  const mailtoHref = useMemo(() => {
    if (!result) return "";
    const subject = encodeURIComponent("Gitwork onboarding link");
    const body = encodeURIComponent(
      `Hi,\n\nPlease complete your Gitwork onboarding using the link below:\n\n${fullUrl}\n\nThanks,\nGitwork`,
    );
    const recipient = result.contactEmail ?? "";
    return `mailto:${recipient}?subject=${subject}&body=${body}`;
  }, [fullUrl, result]);

  async function handleCopy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      open={Boolean(result)}
      onClose={onClose}
      title="Onboarding link"
      panelClassName="w-full max-w-lg"
    >
      <div className="p-4">
        <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
          <p className="text-sm font-semibold text-[var(--text-1)]">
            {result?.created ? "Link created" : "Existing link ready"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">
            {result?.clientName ?? "Client"} can complete this form whenever you send the URL.
            The client record stays in human review until the form is submitted and manually activated.
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-2)]">
            {fullUrl || "-"}
          </code>
          <Button type="button" variant="secondary" size="xs" onClick={() => void handleCopy()}>
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            <LinkIcon className="h-4 w-4" />
            Preview
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Done
            </Button>
            <a href={mailtoHref} className={buttonStyles({ variant: "primary", size: "sm" })}>
              <EnvelopeIcon className="h-4 w-4" />
              Email link
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PlanReviewModal({
  item,
  preview,
  startDate,
  loading,
  seeding,
  error,
  onStartDateChange,
  onRefresh,
  onConfirm,
  onClose,
}: {
  item: FoundryAutomationItem | null;
  preview: ProjectPlanPreview | null;
  startDate: string;
  loading: boolean;
  seeding: boolean;
  error: string | null;
  onStartDateChange: (value: string) => void;
  onRefresh: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const existingTotal = preview
    ? preview.totals.existingFeatureBlocks + preview.totals.existingTasks + preview.totals.existingMilestones
    : 0;
  const newTotal = preview
    ? preview.totals.newFeatureBlocks + preview.totals.newTasks + preview.totals.newMilestones
    : 0;

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title="Plan review"
      panelClassName="flex max-h-[calc(100dvh-32px)] w-full max-w-4xl flex-col"
    >
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="min-w-0 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <p className="truncate text-sm font-semibold text-[var(--text-1)]">
              {item?.client.name ?? "Selected client"}
            </p>
            <p className="mt-1 truncate text-xs text-[var(--text-3)]">
              {preview?.sourceDocumentTitle ?? item?.sourceProposal?.title ?? "Proposal timeline"}
            </p>
          </div>
          <label className="rounded-[8px] border border-[var(--border-2)] bg-white p-3 text-xs font-medium text-[var(--text-3)]">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="mt-1 w-full rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1.5 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)]"
            />
          </label>
        </div>

        {preview ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <SummaryTile label="New blocks" value={preview.totals.newFeatureBlocks} />
            <SummaryTile label="New tasks" value={preview.totals.newTasks} />
            <SummaryTile label="Milestones" value={preview.totals.newMilestones} />
            <SummaryTile label="Skipped" value={existingTotal} />
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {loading && !preview ? (
            <div className="rounded-[8px] border border-[var(--border-2)] bg-white p-4 text-sm text-[var(--text-3)]">
              Building preview...
            </div>
          ) : null}

          {preview?.blocks.map((block) => (
            <div key={block.key} className="rounded-[8px] border border-[var(--border-2)] bg-white">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-3)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">{block.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    {formatDate(block.startDate)} - {formatDate(block.endDate)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    block.existing
                      ? "border-slate-200 bg-slate-50 text-slate-600"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {block.existing ? "Existing block" : "New block"}
                </span>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs leading-5 text-[var(--text-3)]">{block.summary}</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {block.tasks.map((task) => (
                    <div
                      key={task.key}
                      className="flex items-start gap-2 rounded-[6px] border border-[var(--border-3)] bg-[var(--surface-1)] px-2 py-1.5"
                    >
                      <span
                        className={cn(
                          "mt-1 h-1.5 w-1.5 rounded-full",
                          task.existing ? "bg-slate-300" : "bg-emerald-500",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--text-1)]">{task.title}</p>
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                          Due {formatDate(task.dueDate)}
                          {task.existing ? " / skip" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {preview?.milestones.length ? (
          <div className="mt-4 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
              Milestones
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {preview.milestones.map((milestone) => (
                <div key={milestone.key} className="rounded-[6px] border border-[var(--border-3)] bg-white px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-[var(--text-1)]">{milestone.name}</p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                    {formatDate(milestone.date)}
                    {milestone.existing ? " / skip" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-2)] px-4 py-3">
        <p className="text-xs text-[var(--text-3)]">
          {preview
            ? `${newTotal} records ready, ${existingTotal} already present.`
            : "Preview required before creating records."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={seeding}>
            Close
          </Button>
          <Button type="button" variant="secondary" size="sm" loading={loading} onClick={onRefresh}>
            Refresh preview
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={seeding}
            disabled={!preview || loading}
            onClick={onConfirm}
          >
            Create plan
          </Button>
        </div>
      </div>
    </Modal>
  );
}
