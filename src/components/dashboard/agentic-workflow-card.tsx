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
import { useMemo, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/format";
import { useFoundryAutomation, useSeedProjectPlan } from "@/hooks/use-foundry-automation";
import type {
  AutomationGateState,
  AutomationStageKey,
  FoundryAutomationItem,
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
  const { data, isLoading, error, refetch, isFetching } = useFoundryAutomation();
  const seedPlan = useSeedProjectPlan();
  const [seedingClientId, setSeedingClientId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = useMemo(() => data?.items.slice(0, 6) ?? [], [data?.items]);

  async function handleSeed(item: FoundryAutomationItem) {
    setNotice(null);
    setSeedingClientId(item.client.id);
    try {
      const response = await seedPlan.mutateAsync({
        clientId: item.client.id,
        documentId: item.sourceProposal?.id,
      });
      const { created, skipped, sourceDocumentTitle } = response.result;
      setNotice(
        `${item.client.name}: seeded ${created.featureBlocks} blocks, ${created.tasks} tasks, ${created.milestones} milestones from ${sourceDocumentTitle}. ${skipped.tasks + skipped.featureBlocks + skipped.milestones} existing items skipped.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not seed the project plan.");
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
                seeding={seedingClientId === item.client.id}
                seedDisabled={seedPlan.isPending}
                onSeed={() => void handleSeed(item)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
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
  seeding,
  seedDisabled,
  onSeed,
}: {
  item: FoundryAutomationItem;
  seeding: boolean;
  seedDisabled: boolean;
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

        {item.nextAction.kind === "seed_project_plan" ? (
          <Button
            type="button"
            size="xs"
            variant="primary"
            loading={seeding}
            disabled={seedDisabled}
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
