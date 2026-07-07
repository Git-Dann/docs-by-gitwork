"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/hooks/use-permissions";
import { useNotice } from "./notice";
import {
  useCreateDevSignalAssessment,
  useDevSignalAnalytics,
  useDevSignalAssessments,
  useDevSignalConfigs,
} from "@/hooks/use-devsignal";
import type { DevSignalAssessmentDTO } from "@/types/devsignal";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  RUNNING: "bg-blue-100 text-blue-700",
  PENDING_HUMAN: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-neutral-100 text-neutral-500",
};

function WidgetHeader({ n, label }: { n: string; label: string }) {
  return (
    <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">
      {`${n} // ${label}`}
    </p>
  );
}

export function DevSignalQueue() {
  const { canManageDevSignal } = usePermissions();
  const assessments = useDevSignalAssessments();
  const analytics = useDevSignalAnalytics();
  const [modalOpen, setModalOpen] = useState(false);

  if (!canManageDevSignal) {
    return <p className="text-sm text-neutral-500">You don&apos;t have access to DevSignal.</p>;
  }

  const items = assessments.data?.items ?? [];
  const a = analytics.data?.analytics;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-600">DevSignal</p>
          <h2 className="text-2xl font-semibold text-neutral-900">Vetting — staging review</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Candidates are assessed here and only enter Code when a human promotes them.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New assessment
        </button>
      </div>

      {/* Analytics strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard n="01" label="Assessed" value={a?.total ?? 0} />
        <StatCard n="02" label="Pending review" value={a?.byStatus?.PENDING_HUMAN ?? 0} />
        <StatCard n="03" label="Promoted to Code" value={a?.promotedToCode ?? 0} />
        <StatCard n="04" label="Outcomes linked" value={a?.outcomeLinks ?? 0} />
        <StatCard n="05" label="Avg score" value={a?.averageFinalScore ?? "—"} />
      </div>

      {/* Queue */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-5 py-3">
          <WidgetHeader n="06" label="Assessment queue" />
        </div>
        {assessments.isLoading ? (
          <p className="px-5 py-8 text-sm text-neutral-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-neutral-400">
            No assessments yet. Create one to mint a candidate invite link.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
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
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <WidgetHeader n="07" label="Pipeline config" />
      <p className="mt-1 text-xs text-neutral-400">
        {def.name} · {def.version} — snapshotted onto every assessment so historical scores stay
        interpretable. Editing UI is coming; per-client configs are set via the API today.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stages.map((s) => (
          <span key={s} className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-mono text-xs text-neutral-600">
            {s.replace(/_/g, " ")} · {weights[s] ?? 0}
            {def.blockingRules[s] ? " ·🔒" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({ n, label, value }: { n: string; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <WidgetHeader n={n} label={label} />
      <p className="mt-2 font-serif text-3xl text-neutral-900">{value}</p>
    </div>
  );
}

function QueueRow({ item }: { item: DevSignalAssessmentDTO }) {
  const label = item.bestMatchSummary?.labelDisplay ?? "—";
  return (
    <li>
      <Link
        href={`/app/codeclear/devsignal/${item.id}`}
        className="flex items-center justify-between px-5 py-3 hover:bg-neutral-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{item.candidateName}</p>
          <p className="font-mono text-xs text-neutral-400">
            {item.candidateGithubHandle ?? "no handle"} · {new Date(item.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-500 sm:inline">{label}</span>
          {typeof item.finalScore === "number" && (
            <span className="font-mono text-sm text-neutral-700">{item.finalScore}</span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status] ?? ""}`}>
            {item.status.replace("_", " ").toLowerCase()}
          </span>
          {item.promotedToCode && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">in Code</span>
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
    <Modal open onClose={onClose} title="New DevSignal assessment">
      <div className="space-y-4 p-1">
        <Field label="Candidate name" value={name} onChange={setName} />
        <Field label="GitHub username" value={githubHandle} onChange={setGithubHandle} placeholder="octocat" />
        <Field label="Email (optional)" value={email} onChange={setEmail} type="email" />
        <p className="text-xs text-neutral-400">
          This mints a tokenised invite link the candidate uses to complete their assessment. They
          land in staging — nothing enters Code without your explicit promotion.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={create.isPending || !name.trim() || !githubHandle.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create & mint link"}
          </button>
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
      <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}
