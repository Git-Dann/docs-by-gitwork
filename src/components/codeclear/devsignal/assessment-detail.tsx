"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  LockClosedIcon,
  QuestionMarkCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { useNotice } from "./notice";
import {
  useDevSignalAnalytics,
  useDevSignalAssessment,
  usePromoteDevSignalToCode,
  useRecordDevSignalDecision,
  useRecordDevSignalInterview,
  useRunDevSignalAssessment,
} from "@/hooks/use-devsignal";
import type { DevSignalAssessmentDTO, DevSignalStageResultDTO } from "@/types/devsignal";
import { OutcomeLinksPanel } from "./outcome-links-panel";
import { CompliancePanel } from "./compliance-panel";
import { Meter, scoreTone, TONE_STROKE } from "./devsignal-ui";
import {
  DocumentCover,
  HealthScoreRing,
  type DocumentCoverMeta,
  type DocumentCoverStat,
} from "@/components/document-cover";

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
      <ProfileHeader a={a} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <StageTimeline stages={a.stageResults ?? []} />
          <ScoreBreakdown a={a} />
          <InterviewScorecard id={id} />
        </div>
        <div className="space-y-6">
          <DecisionPanel id={id} a={a} />
          <CompliancePanel id={id} a={a} />
          <OutcomeLinksPanel assessmentId={id} candidateId={a.candidateId} links={a.outcomeLinks ?? []} />
        </div>
      </div>
    </div>
  );
}

/** Colour a signal cell (0–100) for the hero stat strip. */
function statColor(score: number): { color: string; bg: string } {
  const tone = scoreTone(score);
  if (tone === "success") return { color: "#16a34a", bg: "#f0fdf4" };
  if (tone === "brand") return { color: "#1d4ed8", bg: "#eff6ff" };
  if (tone === "warning") return { color: "#d97706", bg: "#fffbeb" };
  return { color: "#dc2626", bg: "#fef2f2" };
}

// Clean, scannable candidate profile hero — the same Gitwork navy DocumentCover
// Pulse uses for its report, so the two read as one product. Score ring + serif
// name + a mono fact grid + a tinted signal strip, above the detail drill-down.
function ProfileHeader({ a }: { a: DevSignalAssessmentDTO }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const run = useRunDevSignalAssessment(a.id);
  const analytics = useDevSignalAnalytics();
  const model = analytics.data?.analytics.modelStatus;
  const summary = a.bestMatchSummary;
  const b = a.scoreBreakdown;
  const scored = typeof a.finalScore === "number";
  const inviteUrl = a.publicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/vet/${a.publicToken}`
    : null;

  const meta: DocumentCoverMeta[] = [];
  if (scored && summary?.labelDisplay) meta.push({ label: "Match", value: summary.labelDisplay });
  meta.push({ label: "Status", value: a.status.replace(/_/g, " ").toLowerCase() });
  meta.push({ label: "GitHub", value: a.candidateGithubHandle ?? "—" });
  meta.push({ label: "Config", value: a.configVersion });

  const STAGE_LABELS: Record<string, string> = {
    coding_challenge: "Coding",
    online_footprint: "Footprint",
    video_assessment: "Comms",
    leadership_interview: "Interview",
  };
  const stats: DocumentCoverStat[] | undefined =
    scored && b
      ? b.stages
          .filter((s) => STAGE_LABELS[s.stageId] && (s.included || s.rawStageScore > 0))
          .map((s) => ({ count: s.rawStageScore, label: STAGE_LABELS[s.stageId], ...statColor(s.rawStageScore) }))
      : undefined;

  const execSummary = scored
    ? `${summary?.labelDisplay ?? "Scored"} — internal score ${a.finalScore}/100.${
        b?.humanReviewRequired ? " Human review is required before promotion." : ""
      }${
        (summary?.strengths?.length ?? 0) > 0 ? ` Strengths: ${summary!.strengths.join(", ")}.` : ""
      }`
    : "Not scored yet — run the automated stages to compute the breakdown and best-match label. A person makes the final call; the score only informs it.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/app/codeclear/devsignal"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)] transition hover:text-[var(--text-2)]"
        >
          ← Back to queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {inviteUrl && (
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
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={run.isPending}
            onClick={async () => {
              try {
                await run.mutateAsync();
                showOk("Assessment run", "Automated stages scored.");
              } catch (e) {
                showErr("Run failed", e instanceof Error ? e.message : undefined);
              }
            }}
          >
            {run.isPending ? "Running…" : "Run automated stages"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px]">
        <DocumentCover
          variant="screen"
          boldPalette="navy"
          eyebrow="DEVSIGNAL // CANDIDATE ASSESSMENT"
          title={a.candidateName}
          subtitle={a.candidateGithubHandle ? `github.com/${a.candidateGithubHandle}` : undefined}
          rightSlot={scored ? <HealthScoreRing score={a.finalScore as number} /> : undefined}
          meta={meta}
          stats={stats}
          executiveSummary={execSummary}
          callout={
            scored && model && model.status !== "calibrated"
              ? { text: `Score is provisional — the model isn't calibrated on outcomes yet (n=${model.n}). It informs the human call, it doesn't make it.`, tone: "blue" }
              : undefined
          }
          dated={`Created ${new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
        />
      </div>
      {noticeEl}
    </div>
  );
}

function StageTimeline({ stages }: { stages: DevSignalStageResultDTO[] }) {
  return (
    <WidgetCard number="01" name="Stage results">
      {stages.length === 0 ? (
        <p className="text-sm text-[var(--text-4)]">No stages run yet.</p>
      ) : (
        <ul className="space-y-4">
          {stages.map((s) => (
            <li key={s.id} className="border-l-2 border-[var(--border-3)] pl-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-1)]">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", (STAGE_STATUS_STYLE[s.status] ?? "").replace("text-", "bg-"))} />
                  {s.stageName}
                </p>
                <span className={cn("font-mono text-[10px] uppercase tracking-[0.08em]", STAGE_STATUS_STYLE[s.status] ?? "")}>
                  {s.status}
                </span>
              </div>
              {s.subScores.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {s.subScores.map((sub) => {
                    const pct = sub.maxScore > 0 ? (sub.score / sub.maxScore) * 100 : 0;
                    return (
                      <div key={sub.key} className="flex items-center gap-2.5">
                        <span className="w-28 shrink-0 truncate text-xs text-[var(--text-3)]">{sub.label}</span>
                        <Meter value={pct} tone={scoreTone(pct)} className="flex-1" />
                        <span className="w-12 shrink-0 text-right font-mono text-[10px] text-[var(--text-4)]">
                          {sub.score}/{sub.maxScore}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {s.flags.map((f, i) => (
                <p
                  key={i}
                  className={cn(
                    "mt-1.5 text-xs",
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
  const analytics = useDevSignalAnalytics();
  const model = analytics.data?.analytics.modelStatus;
  if (!b) {
    return (
      <WidgetCard number="02" name="Score breakdown">
        <p className="text-sm text-[var(--text-4)]">
          Not scored yet — run the automated stages to compute the breakdown.
        </p>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard number="02" name="Score breakdown">
      <p className="widget-data-label normal-case tracking-normal">
        {b.formulaVersion} · weighted {b.weightedScore}
        {b.cap !== null ? ` · capped to ${b.cap} by ${b.cappedByStageId}` : ""}
      </p>
      {model && model.status !== "calibrated" && (
        <p className="mt-2 rounded-[6px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Provisional score — the model isn&apos;t yet calibrated on outcomes (n={model.n}). Weights are
          starting estimates until enough delivery outcomes are recorded.
        </p>
      )}
      <div className="mt-3 space-y-2.5">
        {b.stages
          .filter((s) => s.included || s.effectiveWeight > 0 || s.contribution > 0)
          .map((s) => (
            <div key={s.stageId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-[var(--text-2)]">{s.stageId.replace(/_/g, " ")}</span>
              <Meter value={s.rawStageScore} tone={scoreTone(s.rawStageScore)} className="flex-1" />
              <span className="w-14 shrink-0 text-right font-mono text-[10px] text-[var(--text-4)]">
                {s.rawStageScore}×{s.effectiveWeight}
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-xs text-[var(--text-2)]">+{s.contribution.toFixed(1)}</span>
            </div>
          ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-2)] pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">Final score</span>
        <span className="font-serif text-3xl leading-none text-[var(--text-1)]">{b.finalScore}</span>
      </div>
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

  const avg = Math.round(
    INTERVIEW_DIMENSIONS.reduce((sum, [k]) => sum + (scores[k] ?? 0), 0) / INTERVIEW_DIMENSIONS.length,
  );

  return (
    <WidgetCard number="03" name="Leadership interview">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-md text-xs text-[var(--text-4)]">
          Human scorecard — supports the gate, doesn&apos;t replace your final audit.
        </p>
        <div className="shrink-0 text-right">
          <p className="font-serif text-2xl leading-none text-[var(--text-1)]">{avg}</p>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-4)]">avg score</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {INTERVIEW_DIMENSIONS.map(([key, label]) => {
          const v = scores[key] ?? 0;
          return (
            <div key={key} className="min-w-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-[var(--text-2)]">{label}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-1)]">{v}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={v}
                onChange={(e) => setScores({ ...scores, [key]: Number(e.target.value) })}
                aria-label={label}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--border-2)]"
                style={{ accentColor: TONE_STROKE[scoreTone(v)] }}
              />
            </div>
          );
        })}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Evidence / notes…"
        rows={3}
        className="app-textarea mt-5 w-full"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--border-2)] pt-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">Verdict</span>
        <select
          value={verdict}
          onChange={(e) => setVerdict(e.target.value as typeof verdict)}
          className="app-select w-44"
        >
          <option value="PASS">Pass</option>
          <option value="WARN">Warn</option>
          <option value="FAIL">Fail</option>
          <option value="NEEDS_SECOND_REVIEW">Needs second review</option>
        </select>
        <Button variant="primary" className="ml-auto" onClick={submit} disabled={record.isPending}>
          {record.isPending ? "Saving…" : "Record interview"}
        </Button>
      </div>
      {noticeEl}
    </WidgetCard>
  );
}

const DECISION_CHIP: Record<string, string> = {
  NONE: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]",
  APPROVED_FOR_STAGING: "border-sky-200 bg-sky-50 text-sky-700",
  APPROVED_FOR_CODE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NEEDS_MORE_INFO: "border-amber-200 bg-amber-50 text-amber-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
};

function DecisionChip({ decision }: { decision: string }) {
  return (
    <span
      className={cn(
        "rounded-[4px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        DECISION_CHIP[decision] ?? DECISION_CHIP.NONE,
      )}
    >
      {decision.replace(/_/g, " ")}
    </span>
  );
}

const DECISION_OPTIONS = [
  {
    key: "APPROVED_FOR_STAGING" as const,
    label: "Approve for staging",
    Icon: CheckCircleIcon,
    icon: "text-emerald-500",
    hover: "hover:border-emerald-300 hover:bg-emerald-50",
    active: "border-emerald-400 bg-emerald-50 text-emerald-700",
  },
  {
    key: "NEEDS_MORE_INFO" as const,
    label: "Needs more info",
    Icon: QuestionMarkCircleIcon,
    icon: "text-amber-500",
    hover: "hover:border-amber-300 hover:bg-amber-50",
    active: "border-amber-400 bg-amber-50 text-amber-700",
  },
  {
    key: "REJECTED" as const,
    label: "Reject",
    Icon: XCircleIcon,
    icon: "text-rose-500",
    hover: "hover:border-rose-300 hover:bg-rose-50",
    active: "border-rose-400 bg-rose-50 text-rose-700",
  },
];

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

  const gateBlockedReason =
    a.status === "DRAFT" || a.status === "RUNNING"
      ? "Run the automated stages before promoting."
      : a.decision === "REJECTED"
        ? "This candidate was rejected — record a different decision to promote."
        : null;

  return (
    <WidgetCard number="05" name="Decision">
      <div className="flex items-center gap-2 text-sm text-[var(--text-3)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">Current</span>
        <DecisionChip decision={a.decision} />
      </div>

      {a.promotedToCode ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-[6px] bg-[var(--surface-brand)] px-3 py-2 text-sm font-medium text-[var(--brand-700)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-600)]" />
          Promoted into Code{a.promotedToCodeAt ? ` on ${new Date(a.promotedToCodeAt).toLocaleDateString()}` : ""}.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {DECISION_OPTIONS.map((opt) => {
              const active = a.decision === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDecision(opt.key)}
                  disabled={decision.isPending}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[6px] border px-3 py-2.5 text-left text-sm font-medium transition disabled:opacity-60",
                    active ? opt.active : `border-[var(--border-2)] text-[var(--text-2)] ${opt.hover}`,
                  )}
                >
                  <opt.Icon className={cn("h-4 w-4 shrink-0", active ? "" : opt.icon)} />
                  {opt.label}
                  {active && <CheckIcon className="ml-auto h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-[var(--border-3)] pt-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">
              <LockClosedIcon className="h-3 w-3" /> The human gate
            </p>
            {gateBlockedReason ? (
              <div className="mt-2">
                <div className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 text-sm font-medium text-[var(--text-4)]">
                  <LockClosedIcon className="h-4 w-4" /> Promote to Code
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-4)]">{gateBlockedReason}</p>
              </div>
            ) : !confirming ? (
              <Button variant="primary" className="mt-2 w-full" onClick={() => setConfirming(true)}>
                Promote to Code <ArrowRightIcon className="ml-1 inline h-3.5 w-3.5" />
              </Button>
            ) : (
              <div className="mt-2 space-y-2 rounded-[6px] border border-[var(--brand-200)] bg-[var(--surface-brand-soft)] p-3">
                <p className="text-sm text-[var(--text-2)]">
                  This adds <span className="font-medium">{a.candidateName}</span> to the Code roster. Only you can do this.
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
                  <Button variant="primary" size="sm" className="ml-auto" onClick={doPromote} disabled={promote.isPending}>
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
