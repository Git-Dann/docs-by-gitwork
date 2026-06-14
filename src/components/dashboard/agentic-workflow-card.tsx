"use client";

import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, formatDate } from "@/lib/format";
import {
  useDraftProposalFromMeeting,
  useFoundryAutomation,
  usePreviewProjectPlan,
  useSeedProjectPlan,
} from "@/hooks/use-foundry-automation";
import type {
  AutomationGateState,
  AutomationStageKey,
  FoundryAutomationItem,
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
  const draftProposal = useDraftProposalFromMeeting();
  const previewPlan = usePreviewProjectPlan();
  const seedPlan = useSeedProjectPlan();
  const [reviewing, setReviewing] = useState<{
    item: FoundryAutomationItem;
    startDate: string;
  } | null>(null);
  const [preview, setPreview] = useState<ProjectPlanPreview | null>(null);
  const [draftingClientId, setDraftingClientId] = useState<string | null>(null);
  const [previewingClientId, setPreviewingClientId] = useState<string | null>(null);
  const [seedingClientId, setSeedingClientId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const items = useMemo(() => data?.items.slice(0, 6) ?? [], [data?.items]);

  async function handleDraftProposal(item: FoundryAutomationItem) {
    setNotice(null);
    setReviewError(null);
    setDraftingClientId(item.client.id);
    try {
      const response = await draftProposal.mutateAsync({
        clientId: item.client.id,
        meetingId: item.latestMeeting?.id,
      });
      setNotice(
        response.result.created
          ? `${item.client.name}: drafted ${response.result.proposalTitle} from ${response.result.meetingTitle}.`
          : `${item.client.name}: opening existing draft ${response.result.proposalTitle}.`,
      );
      router.push(response.result.href);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not draft a proposal from these notes.");
    } finally {
      setDraftingClientId(null);
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
          <span className="widget-header__label--number">02</span>
          {" // AGENTIC WORKFLOW"}
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
        >
          <ArrowPathIcon className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
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
                  draftingClientId === item.client.id ||
                  seedingClientId === item.client.id ||
                  previewingClientId === item.client.id
                }
                actionDisabled={draftProposal.isPending || seedPlan.isPending || previewPlan.isPending}
                onDraft={() => void handleDraftProposal(item)}
                onSeed={() => void handleOpenReview(item)}
              />
            ))
          )}
        </div>
      </div>

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
    </section>
  );
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
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

function AutomationRow({
  item,
  actionPending,
  actionDisabled,
  onDraft,
  onSeed,
}: {
  item: FoundryAutomationItem;
  actionPending: boolean;
  actionDisabled: boolean;
  onDraft: () => void;
  onSeed: () => void;
}) {
  const detail = item.sourceProposal
    ? `${item.sourceProposal.title} · ${item.sourceProposal.status.replace(/_/g, " ")}`
    : item.latestMeeting
      ? `${item.latestMeeting.title} · ${formatDate(item.latestMeeting.startedAt)}`
      : "No proposal context yet";

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_180px]">
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
        </div>

        <p className="mt-1 truncate text-xs text-[var(--text-3)]">{detail}</p>

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

      <div className="flex items-center justify-start gap-2 lg:justify-end">
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
      </div>
    </div>
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
