"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { useNotice } from "./notice";
import {
  useCreateDevSignalAssessment,
  useDevSignalAnalytics,
  useDevSignalAssessments,
  useDevSignalConfigs,
} from "@/hooks/use-devsignal";
import type { DevSignalAssessmentDTO } from "@/types/devsignal";

// Status pill tones. Semantic colours (sky/amber/emerald/rose) are remapped for
// dark mode in globals.css; neutral states use design tokens so they flip too.
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]",
  RUNNING: "border-sky-200 bg-sky-50 text-sky-700",
  PENDING_HUMAN: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  ARCHIVED: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-4)]",
};

export function DevSignalQueue() {
  const { canManageDevSignal } = usePermissions();
  const assessments = useDevSignalAssessments();
  const analytics = useDevSignalAnalytics();
  const [modalOpen, setModalOpen] = useState(false);

  if (!canManageDevSignal) {
    return <p className="text-sm text-[var(--text-3)]">You don&apos;t have access to DevSignal.</p>;
  }

  const items = assessments.data?.items ?? [];
  const a = analytics.data?.analytics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
            DevSignal
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Vetting — staging review
          </h2>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Candidates are assessed here and only enter Code when a human promotes them.
          </p>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          New assessment
        </Button>
      </div>

      {/* Analytics strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard n="01" label="Assessed" value={a?.total ?? 0} />
        <StatCard n="02" label="Pending review" value={a?.byStatus?.PENDING_HUMAN ?? 0} />
        <StatCard n="03" label="Promoted to Code" value={a?.promotedToCode ?? 0} />
        <StatCard n="04" label="Outcomes linked" value={a?.outcomeLinks ?? 0} />
        <StatCard n="05" label="Avg score" value={a?.averageFinalScore ?? "—"} />
      </div>

      {/* Queue */}
      <WidgetCard number="06" name="Assessment queue" bodyClassName="!p-0">
        {assessments.isLoading ? (
          <p className="px-4 py-8 text-sm text-[var(--text-4)]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[var(--text-4)]">
            No assessments yet. Create one to mint a candidate invite link.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-3)]">
            {items.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </WidgetCard>

      <PipelineConfigCard />

      {modalOpen && <NewAssessmentModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function PipelineConfigCard() {
  const configs = useDevSignalConfigs();
  const def = configs.data?.items.find((c) => c.isDefault) ?? configs.data?.items[0];
  if (!def) return null;
  const weights = def.stageWeights;
  const stages = def.stageOrder.length ? def.stageOrder : Object.keys(weights);
  return (
    <WidgetCard number="07" name="Pipeline config">
      <p className="text-xs text-[var(--text-4)]">
        {def.name} · {def.version} — snapshotted onto every assessment so historical scores stay
        interpretable. Editing UI is coming; per-client configs are set via the API today.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stages.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 font-mono text-xs text-[var(--text-3)]"
          >
            {s.replace(/_/g, " ")} · {weights[s] ?? 0}
            {def.blockingRules[s] ? <span aria-label="blocking gate">🔒</span> : null}
          </span>
        ))}
      </div>
    </WidgetCard>
  );
}

function StatCard({ n, label, value }: { n: string; label: string; value: number | string }) {
  return (
    <WidgetCard number={n} name={label} bodyClassName="!py-4">
      <p className="widget-stat">{value}</p>
    </WidgetCard>
  );
}

function QueueRow({ item }: { item: DevSignalAssessmentDTO }) {
  const label = item.bestMatchSummary?.labelDisplay ?? "—";
  return (
    <li>
      <Link
        href={`/app/codeclear/devsignal/${item.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--surface-1)]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-1)]">{item.candidateName}</p>
          <p className="font-mono text-xs text-[var(--text-4)]">
            {item.candidateGithubHandle ?? "no handle"} ·{" "}
            {new Date(item.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-[var(--text-3)] sm:inline">{label}</span>
          {typeof item.finalScore === "number" && (
            <span className="font-mono text-sm text-[var(--text-2)]">{item.finalScore}</span>
          )}
          <span
            className={cn(
              "rounded-[6px] border px-2 py-0.5 text-xs font-medium capitalize",
              STATUS_STYLE[item.status] ?? "",
            )}
          >
            {item.status.replace("_", " ").toLowerCase()}
          </span>
          {item.promotedToCode && (
            <span className="rounded-[6px] bg-[var(--brand-600)] px-2 py-0.5 text-xs font-medium text-white">
              in Code
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function NewAssessmentModal({ onClose }: { onClose: () => void }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const create = useCreateDevSignalAssessment();
  const [name, setName] = useState("");
  const [githubHandle, setGithubHandle] = useState("");
  const [email, setEmail] = useState("");

  const submit = async () => {
    try {
      const res = await create.mutateAsync({
        candidate: { name, githubHandle, email: email || undefined },
      });
      const token = res.assessment.publicToken;
      showOk("Assessment created", token ? `Invite link: /vet/${token}` : undefined);
      onClose();
    } catch (e) {
      showErr("Could not create", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Modal open onClose={onClose} title="New DevSignal assessment" panelClassName="w-[560px] max-w-[92vw]">
      {/* Fixed height so the dialog reads intentional, not sparse. Fields in a
          2-column grid; footer pinned to the bottom. */}
      <div className="flex h-[360px] flex-col">
        <div className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-4 overflow-y-auto p-6">
          <Field label="Candidate name" value={name} onChange={setName} />
          <Field label="GitHub username" value={githubHandle} onChange={setGithubHandle} placeholder="octocat" />
          <div className="col-span-2">
            <Field label="Email (optional)" value={email} onChange={setEmail} type="email" />
          </div>
          <p className="col-span-2 text-sm leading-relaxed text-[var(--text-3)]">
            This mints a tokenised invite link the candidate uses to complete their assessment. They
            land in staging — nothing enters Code without your explicit promotion.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-1)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={create.isPending || !name.trim() || !githubHandle.trim()}
          >
            {create.isPending ? "Creating…" : "Create & mint link"}
          </Button>
        </div>
      </div>
      {noticeEl}
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="widget-data-label mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="app-input w-full"
      />
    </label>
  );
}
