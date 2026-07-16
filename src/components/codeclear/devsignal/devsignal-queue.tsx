"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { useNotice } from "./notice";
import { DevSignalAssessmentList } from "./assessment-list";
import {
  useCreateDevSignalAssessment,
  useDevSignalAnalytics,
  useDevSignalAssessments,
  useDevSignalConfigs,
} from "@/hooks/use-devsignal";

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
          {a?.modelStatus && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
              Model: {a.modelStatus.status}
              {a.modelStatus.status !== "calibrated" ? " · scores provisional" : ` · r=${a.modelStatus.overallValidity?.toFixed(2) ?? "—"}`}
              {` · n=${a.modelStatus.n}`}
            </p>
          )}
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

      {a?.funnel && a.funnel[0]?.n > 0 && <CompletionFunnel funnel={a.funnel} />}

      {/* Queue — starter-style candidate cards (matches /app/starters) */}
      <div>
        <p className="widget-data-label mb-3">
          <span className="text-[var(--brand-700)]">07</span>
          {" // Assessment queue"}
        </p>
        {assessments.isLoading ? (
          <p className="text-sm text-[var(--text-4)]">Loading…</p>
        ) : (
          <DevSignalAssessmentList items={items} />
        )}
      </div>

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
    <WidgetCard number="08" name="Pipeline config">
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

function CompletionFunnel({ funnel }: { funnel: Array<{ key: string; label: string; n: number }> }) {
  const start = funnel[0]?.n || 1;
  return (
    <WidgetCard number="06" name="Completion funnel">
      <p className="text-xs text-[var(--text-4)]">
        Where candidates drop off across the flow. A big fall between two steps is friction worth
        fixing.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {funnel.map((f, i) => {
          const pct = Math.round((f.n / start) * 100);
          const prev = i > 0 ? funnel[i - 1].n : f.n;
          const dropped = prev - f.n;
          return (
            <div key={f.key} className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2.5">
              <p className="widget-data-label">{f.label}</p>
              <p className="mt-1 font-mono text-lg text-[var(--text-1)]">{f.n}</p>
              <p className="font-mono text-[10px] text-[var(--text-4)]">
                {pct}%{i > 0 && dropped > 0 ? ` · −${dropped}` : ""}
              </p>
            </div>
          );
        })}
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
