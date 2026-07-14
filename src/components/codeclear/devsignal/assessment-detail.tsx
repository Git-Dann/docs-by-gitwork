"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
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
import { CompliancePanel } from "./compliance-panel";

// Status label tone. Uses the semantic palette (emerald/amber/rose/sky) that
// globals.css remaps for dark mode; neutral states use tokens.
const STAGE_STATUS_STYLE: Record<string, string> = {
  PASS: "text-emerald-600",
  WARN: "text-amber-600",
  FAIL: "text-rose-600",
  ERROR: "text-rose-600",
  PENDING_HUMAN: "text-amber-600",
  PENDING: "text-[var(--text-4)]",
  RUNNING: "text-sky-600",
  SKIPPED: "text-[var(--text-4)]",
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

export function AssessmentDetail({ id }: { id: string }) {
  const { canManageDevSignal } = usePermissions();
  const { data, isLoading } = useDevSignalAssessment(id);

  if (!canManageDevSignal) return <p className="text-sm text-[var(--text-3)]">You don&apos;t have access to DevSignal.</p>;
  if (isLoading) return <p className="text-sm text-[var(--text-4)]">Loading…</p>;
  if (!data?.assessment) return <p className="text-sm text-rose-600">Assessment not found.</p>;

  const a = data.assessment;

  return (
    <div className="space-y-6">
      <Link href="/app/codeclear/devsignal" className="widget-data-label inline-block text-[var(--text-4)] transition hover:text-[var(--text-2)]">
        ← Back to queue
      </Link>

      <Masthead a={a} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StageTimeline stages={a.stageResults ?? []} />
          <ScoreBreakdown a={a} />
          <InterviewScorecard id={id} />
        </div>
        <div className="space-y-6">
          <BestMatchCard a={a} />
          <DecisionPanel id={id} a={a} />
          <CompliancePanel id={id} a={a} />
          <OutcomeLinksPanel assessmentId={id} candidateId={a.candidateId} links={a.outcomeLinks ?? []} />
        </div>
      </div>
    </div>
  );
}

function Masthead({ a }: { a: DevSignalAssessmentDTO }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const run = useRunDevSignalAssessment(a.id);
  const inviteUrl = a.publicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/vet/${a.publicToken}`
    : null;

  return (
    <section className="widget-card">
      <div className="widget-body space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl leading-tight tracking-[-0.02em] text-[var(--text-1)]">
              {a.candidateName}
            </h1>
            <p className="widget-data-label mt-1 normal-case tracking-normal">
              {a.candidateGithubHandle ?? "no handle"} · {a.status.replace("_", " ").toLowerCase()} · config {a.configVersion}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await run.mutateAsync();
                showOk("Assessment run", "Automated stages scored.");
              } catch (e) {
                showErr("Run failed", e instanceof Error ? e.message : undefined);
              }
            }}
            disabled={run.isPending}
          >
            {run.isPending ? "Running…" : "Run automated stages"}
          </Button>
        </div>
        {inviteUrl && (
          <div className="flex items-center gap-2">
            <input readOnly value={inviteUrl} className="app-input flex-1 font-mono text-xs" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(inviteUrl);
                showOk("Copied", "Invite link copied.");
              }}
            >
              Copy invite link
            </Button>
          </div>
        )}
      </div>
      {noticeEl}
    </section>
  );
}

function BestMatchCard({ a }: { a: DevSignalAssessmentDTO }) {
  const summary = a.bestMatchSummary;
  return (
    <WidgetCard number="01" name="Best match">
      <p className="text-xl font-semibold text-[var(--text-1)]">{summary?.labelDisplay ?? "Not scored yet"}</p>
      {typeof a.finalScore === "number" && (
        <p className="widget-data-label mt-1 normal-case tracking-normal">Internal score {a.finalScore}/100</p>
      )}
      {a.scoreBreakdown?.humanReviewRequired && (
        <p className="mt-2 rounded-[6px] bg-amber-50 px-3 py-2 text-xs text-amber-700">Human review required.</p>
      )}
      {(summary?.strengths?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-1">
          {summary!.strengths.map((s) => (
            <li key={s} className="text-sm text-[var(--text-3)]">• {s}</li>
          ))}
        </ul>
      )}
      <p className="widget-data-label mt-3 text-[var(--text-4)]">
        Client-facing view shows this label only — never the number.
      </p>
    </WidgetCard>
  );
}

function StageTimeline({ stages }: { stages: DevSignalStageResultDTO[] }) {
  return (
    <WidgetCard number="02" name="Stage results">
      {stages.length === 0 ? (
        <p className="text-sm text-[var(--text-4)]">No stages run yet.</p>
      ) : (
        <ul className="space-y-4">
          {stages.map((s) => (
            <li key={s.id} className="border-l-2 border-[var(--border-3)] pl-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text-1)]">{s.stageName}</p>
                <span className={cn("font-mono text-xs uppercase tracking-[0.08em]", STAGE_STATUS_STYLE[s.status] ?? "")}>
                  {s.status}
                </span>
              </div>
              {s.subScores.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {s.subScores.map((sub) => (
                    <span key={sub.key} className="font-mono text-xs text-[var(--text-3)]">
                      {sub.label}: {sub.score}/{sub.maxScore}
                    </span>
                  ))}
                </div>
              )}
              {s.flags.map((f, i) => (
                <p
                  key={i}
                  className={cn(
                    "mt-1 text-xs",
                    f.severity === "block" ? "text-rose-600" : f.severity === "warn" ? "text-amber-600" : "text-[var(--text-4)]",
                  )}
                >
                  {f.severity === "info" ? "ℹ" : "⚠"} {f.message}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function ScoreBreakdown({ a }: { a: DevSignalAssessmentDTO }) {
  const b = a.scoreBreakdown;
  if (!b) return null;
  return (
    <WidgetCard number="03" name="Score breakdown">
      <p className="widget-data-label normal-case tracking-normal">
        {b.formulaVersion} · weighted {b.weightedScore}
        {b.cap !== null ? ` · capped to ${b.cap} by ${b.cappedByStageId}` : ""}
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {b.stages
            .filter((s) => s.included || s.effectiveWeight > 0 || s.contribution > 0)
            .map((s) => (
              <tr key={s.stageId} className="border-b border-[var(--border-3)]">
                <td className="py-1 text-[var(--text-2)]">{s.stageId.replace(/_/g, " ")}</td>
                <td className="py-1 text-right font-mono text-xs text-[var(--text-4)]">
                  {s.rawStageScore} × {s.effectiveWeight}
                </td>
                <td className="py-1 text-right font-mono text-[var(--text-2)]">+{s.contribution.toFixed(1)}</td>
              </tr>
            ))}
          <tr>
            <td className="pt-2 font-medium text-[var(--text-1)]">Final</td>
            <td />
            <td className="pt-2 text-right font-mono font-semibold text-[var(--text-1)]">{b.finalScore}</td>
          </tr>
        </tbody>
      </table>
    </WidgetCard>
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
    <WidgetCard number="04" name="Leadership interview">
      <p className="text-xs text-[var(--text-4)]">Human scorecard — supports the gate, doesn&apos;t replace your final audit.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INTERVIEW_DIMENSIONS.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--text-2)]">{label}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={scores[key]}
              onChange={(e) => setScores({ ...scores, [key]: Number(e.target.value) })}
              className="app-input-compact w-16 text-right"
            />
          </label>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Evidence / notes…"
        rows={3}
        className="app-textarea mt-3 w-full"
      />
      <div className="mt-3 flex items-center gap-2">
        <select value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)} className="app-select">
          <option value="PASS">Pass</option>
          <option value="WARN">Warn</option>
          <option value="FAIL">Fail</option>
          <option value="NEEDS_SECOND_REVIEW">Needs second review</option>
        </select>
        <Button variant="primary" onClick={submit} disabled={record.isPending}>
          {record.isPending ? "Saving…" : "Record interview"}
        </Button>
      </div>
      {noticeEl}
    </WidgetCard>
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
    <WidgetCard number="05" name="Decision">
      <p className="text-sm text-[var(--text-3)]">
        Current: <span className="font-medium text-[var(--text-2)]">{a.decision.replace(/_/g, " ").toLowerCase()}</span>
      </p>

      {a.promotedToCode ? (
        <p className="mt-3 rounded-[6px] bg-[var(--surface-brand)] px-3 py-2 text-sm text-[var(--brand-700)]">
          ✓ Promoted into Code{a.promotedToCodeAt ? ` on ${new Date(a.promotedToCodeAt).toLocaleDateString()}` : ""}.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDecision("APPROVED_FOR_STAGING")}>
              Approve for staging
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDecision("NEEDS_MORE_INFO")}>
              Needs more info
            </Button>
            <button
              onClick={() => setDecision("REJECTED")}
              className="rounded-[6px] border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              Reject
            </button>
          </div>

          <div className="mt-4 border-t border-[var(--border-3)] pt-4">
            <p className="widget-data-label text-[var(--text-4)]">The human gate</p>
            {!confirming ? (
              <Button
                variant="primary"
                className="mt-2 w-full"
                onClick={() => setConfirming(true)}
                disabled={a.decision === "REJECTED" || a.status === "DRAFT" || a.status === "RUNNING"}
              >
                Promote to Code →
              </Button>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-[var(--text-3)]">
                  This adds {a.candidateName} to the Code roster. Only you can do this.
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="app-input w-full"
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={doPromote} disabled={promote.isPending}>
                    {promote.isPending ? "Promoting…" : "Confirm promotion"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {noticeEl}
    </WidgetCard>
  );
}
