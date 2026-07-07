"use client";

import { useState } from "react";
import Link from "next/link";
import { usePermissions } from "@/hooks/use-permissions";
import { useNotice } from "./notice";
import {
  useDevSignalAssessment,
  usePromoteDevSignalToCode,
  useRecordDevSignalDecision,
  useRecordDevSignalInterview,
  useRunDevSignalAssessment,
} from "@/hooks/use-devsignal";
import type { DevSignalAssessmentDTO, DevSignalStageResultDTO } from "@/types/devsignal";
import { OutcomeLinksPanel } from "./outcome-links-panel";

const STAGE_STATUS_STYLE: Record<string, string> = {
  PASS: "text-green-600",
  WARN: "text-amber-600",
  FAIL: "text-red-600",
  ERROR: "text-red-600",
  PENDING_HUMAN: "text-amber-600",
  PENDING: "text-neutral-400",
  RUNNING: "text-blue-600",
  SKIPPED: "text-neutral-300",
};

const INTERVIEW_DIMENSIONS = [
  ["ownership", "Ownership"],
  ["communication", "Communication"],
  ["client_handling", "Client handling"],
  ["delivery_judgement", "Delivery judgement"],
  ["collaboration", "Collaboration"],
  ["technical_leadership", "Technical leadership"],
  ["reliability", "Reliability"],
  ["risk_handling", "Risk handling"],
] as const;

function Header({ n, label }: { n: string; label: string }) {
  return <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">{`${n} // ${label}`}</p>;
}

export function AssessmentDetail({ id }: { id: string }) {
  const { canManageDevSignal } = usePermissions();
  const { data, isLoading } = useDevSignalAssessment(id);

  if (!canManageDevSignal) return <p className="text-sm text-neutral-500">You don&apos;t have access to DevSignal.</p>;
  if (isLoading) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (!data?.assessment) return <p className="text-sm text-red-600">Assessment not found.</p>;

  const a = data.assessment;

  return (
    <div className="space-y-6">
      <Link href="/app/codeclear/devsignal" className="text-xs text-neutral-400 hover:text-neutral-600">
        ← Back to queue
      </Link>

      <TopBar a={a} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StageTimeline stages={a.stageResults ?? []} />
          <ScoreBreakdown a={a} />
          <InterviewScorecard id={id} />
        </div>
        <div className="space-y-6">
          <BestMatchCard a={a} />
          <DecisionPanel id={id} a={a} />
          <OutcomeLinksPanel assessmentId={id} candidateId={a.candidateId} links={a.outcomeLinks ?? []} />
        </div>
      </div>
    </div>
  );
}

function TopBar({ a }: { a: DevSignalAssessmentDTO }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const run = useRunDevSignalAssessment(a.id);
  const inviteUrl = a.publicToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/vet/${a.publicToken}` : null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{a.candidateName}</h1>
          <p className="font-mono text-xs text-neutral-400">
            {a.candidateGithubHandle ?? "no handle"} · {a.status.replace("_", " ").toLowerCase()} · config {a.configVersion}
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              await run.mutateAsync();
              showOk("Assessment run", "Automated stages scored.");
            } catch (e) {
              showErr("Run failed", e instanceof Error ? e.message : undefined);
            }
          }}
          disabled={run.isPending}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          {run.isPending ? "Running…" : "Run automated stages"}
        </button>
      </div>
      {inviteUrl && (
        <div className="mt-4 flex items-center gap-2">
          <input readOnly value={inviteUrl} className="flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-xs text-neutral-600" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(inviteUrl);
              showOk("Copied", "Invite link copied.");
            }}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium"
          >
            Copy invite link
          </button>
        </div>
      )}
      {noticeEl}
    </div>
  );
}

function BestMatchCard({ a }: { a: DevSignalAssessmentDTO }) {
  const summary = a.bestMatchSummary;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Header n="01" label="Best match" />
      <p className="mt-3 text-xl font-semibold text-neutral-900">{summary?.labelDisplay ?? "Not scored yet"}</p>
      {typeof a.finalScore === "number" && (
        <p className="mt-1 font-mono text-xs text-neutral-400">Internal score {a.finalScore}/100</p>
      )}
      {a.scoreBreakdown?.humanReviewRequired && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Human review required.</p>
      )}
      {(summary?.strengths?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1">
          {summary!.strengths.map((s) => (
            <li key={s} className="text-sm text-neutral-600">• {s}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-neutral-300">
        Client-facing view shows this label only — never the number.
      </p>
    </div>
  );
}

function StageTimeline({ stages }: { stages: DevSignalStageResultDTO[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Header n="02" label="Stage results" />
      {stages.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No stages run yet.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {stages.map((s) => (
            <li key={s.id} className="border-l-2 border-neutral-100 pl-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-900">{s.stageName}</p>
                <span className={`font-mono text-xs uppercase ${STAGE_STATUS_STYLE[s.status] ?? ""}`}>{s.status}</span>
              </div>
              {s.subScores.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {s.subScores.map((sub) => (
                    <span key={sub.key} className="font-mono text-xs text-neutral-500">
                      {sub.label}: {sub.score}/{sub.maxScore}
                    </span>
                  ))}
                </div>
              )}
              {s.flags.map((f, i) => (
                <p
                  key={i}
                  className={`mt-1 text-xs ${f.severity === "block" ? "text-red-600" : f.severity === "warn" ? "text-amber-600" : "text-neutral-400"}`}
                >
                  {f.severity === "info" ? "ℹ" : "⚠"} {f.message}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreBreakdown({ a }: { a: DevSignalAssessmentDTO }) {
  const b = a.scoreBreakdown;
  if (!b) return null;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Header n="03" label="Score breakdown" />
      <p className="mt-2 font-mono text-xs text-neutral-400">
        {b.formulaVersion} · weighted {b.weightedScore}
        {b.cap !== null ? ` · capped to ${b.cap} by ${b.cappedByStageId}` : ""}
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {b.stages
            .filter((s) => s.included || s.effectiveWeight > 0 || s.contribution > 0)
            .map((s) => (
              <tr key={s.stageId} className="border-b border-neutral-50">
                <td className="py-1 text-neutral-700">{s.stageId.replace(/_/g, " ")}</td>
                <td className="py-1 text-right font-mono text-xs text-neutral-400">{s.rawStageScore} × {s.effectiveWeight}</td>
                <td className="py-1 text-right font-mono text-neutral-700">+{s.contribution.toFixed(1)}</td>
              </tr>
            ))}
          <tr>
            <td className="pt-2 font-medium text-neutral-900">Final</td>
            <td />
            <td className="pt-2 text-right font-mono font-semibold text-neutral-900">{b.finalScore}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InterviewScorecard({ id }: { id: string }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const record = useRecordDevSignalInterview(id);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(INTERVIEW_DIMENSIONS.map(([k]) => [k, 70])),
  );
  const [verdict, setVerdict] = useState<"PASS" | "WARN" | "FAIL" | "NEEDS_SECOND_REVIEW">("PASS");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    try {
      await record.mutateAsync({
        dimensions: INTERVIEW_DIMENSIONS.map(([key, label]) => ({ key, label, score: scores[key] })),
        verdict,
        notes: notes || undefined,
      });
      showOk("Interview recorded");
    } catch (e) {
      showErr("Could not record", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Header n="04" label="Leadership interview" />
      <p className="mt-1 text-xs text-neutral-400">Human scorecard — supports the gate, doesn&apos;t replace your final audit.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INTERVIEW_DIMENSIONS.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-neutral-700">{label}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={scores[key]}
              onChange={(e) => setScores({ ...scores, [key]: Number(e.target.value) })}
              className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm"
            />
          </label>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Evidence / notes…"
        rows={3}
        className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-2">
        <select
          value={verdict}
          onChange={(e) => setVerdict(e.target.value as typeof verdict)}
          className="app-select rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="PASS">Pass</option>
          <option value="WARN">Warn</option>
          <option value="FAIL">Fail</option>
          <option value="NEEDS_SECOND_REVIEW">Needs second review</option>
        </select>
        <button
          onClick={submit}
          disabled={record.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {record.isPending ? "Saving…" : "Record interview"}
        </button>
      </div>
      {noticeEl}
    </div>
  );
}

function DecisionPanel({ id, a }: { id: string; a: DevSignalAssessmentDTO }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const decision = useRecordDevSignalDecision(id);
  const promote = usePromoteDevSignalToCode(id);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const setDecision = async (d: "APPROVED_FOR_STAGING" | "REJECTED" | "NEEDS_MORE_INFO") => {
    try {
      await decision.mutateAsync({ decision: d });
      showOk("Decision recorded");
    } catch (e) {
      showErr("Failed", e instanceof Error ? e.message : undefined);
    }
  };

  const doPromote = async () => {
    try {
      await promote.mutateAsync({ reason: reason || undefined });
      showOk("Promoted to Code", `${a.candidateName} is now in the Code roster.`);
      setConfirming(false);
    } catch (e) {
      showErr("Promotion blocked", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Header n="05" label="Decision" />
      <p className="mt-2 text-sm text-neutral-500">
        Current: <span className="font-medium text-neutral-800">{a.decision.replace(/_/g, " ").toLowerCase()}</span>
      </p>

      {a.promotedToCode ? (
        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          ✓ Promoted into Code{a.promotedToCodeAt ? ` on ${new Date(a.promotedToCodeAt).toLocaleDateString()}` : ""}.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setDecision("APPROVED_FOR_STAGING")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Approve for staging
            </button>
            <button onClick={() => setDecision("NEEDS_MORE_INFO")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Needs more info
            </button>
            <button onClick={() => setDecision("REJECTED")} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              Reject
            </button>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-4">
            <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">The human gate</p>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={a.decision === "REJECTED" || a.status === "DRAFT" || a.status === "RUNNING"}
                className="mt-2 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Promote to Code →
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-neutral-600">
                  This adds {a.candidateName} to the Code roster. Only you can do this.
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={doPromote}
                    disabled={promote.isPending}
                    className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {promote.isPending ? "Promoting…" : "Confirm promotion"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {noticeEl}
    </div>
  );
}
