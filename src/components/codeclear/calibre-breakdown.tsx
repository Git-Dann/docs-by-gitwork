"use client";

import { CheckCircleIcon, ExclamationTriangleIcon, MinusCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { cn } from "@/lib/format";
import type {
  CodeClearCheckRecord,
  CodeClearCheckStatus,
  CodeClearScoreDraftRecord,
  CodeClearScoreRecord,
  CodeClearTier,
  IdentityConfidence,
} from "@/types/codeclear";

const SUB_SCORE_LABELS = {
  technicalDepth: "Technical depth",
  codeQuality: "Code quality",
  deliveryReadiness: "Delivery readiness",
  aiFluency: "AI fluency",
} as const;

// Mirror src/server/codeclear-scoring.ts (single source of truth — these
// are display-only, the server still does the math).
const WEIGHTS = {
  technicalDepth: 30,
  codeQuality: 30,
  deliveryReadiness: 25,
  aiFluency: 15,
} as const;

const IDENTITY_CAP_NOTES: Record<IdentityConfidence, string | null> = {
  HIGH: null,
  MEDIUM: null,
  LOW: "Score capped at 65 (LOW identity confidence)",
  PENDING: "Score capped at 50 (identity not yet verified)",
};

/**
 * The headline calibre panel for the drawer. Shows the four sub-scores as
 * bars, the weights, identity cap state (if any), and an expandable
 * "How this is scored" explainer.
 */
export function CalibreBreakdown({
  score,
  scoreDraft,
  effectiveTier,
  redFlagsCount,
}: {
  score: CodeClearScoreRecord | null;
  scoreDraft: CodeClearScoreDraftRecord | null;
  effectiveTier: CodeClearTier;
  /** Latest analysis red-flag count, used to display the penalty applied. */
  redFlagsCount: number;
}) {
  const source = score ?? scoreDraft;
  const overall = source?.overallScore ?? null;
  const identity = source?.identityConfidence ?? "PENDING";
  const identityNote = IDENTITY_CAP_NOTES[identity];
  const isDraft = !score && Boolean(scoreDraft);

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-4 rounded-[10px] border border-[var(--border-2)] bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="widget-data-label">Calibre</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-[40px] font-normal leading-[1] tracking-[-0.02em] text-[var(--text-1)]">
              {overall ?? "—"}
            </span>
            <span className="widget-data-label">/ 100</span>
            {isDraft ? (
              <span className="ml-2 rounded-[4px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                Draft
              </span>
            ) : null}
          </div>
        </div>
        <TierBadge tier={effectiveTier} />
      </div>

      <div className="space-y-3">
        {(Object.keys(SUB_SCORE_LABELS) as Array<keyof typeof SUB_SCORE_LABELS>).map((key) => {
          const value = source?.[key] ?? 0;
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-[var(--text-2)]">{SUB_SCORE_LABELS[key]}</span>
                <span className="font-mono text-[var(--text-4)]">
                  {value} <span className="text-[10px]">({WEIGHTS[key]}%)</span>
                </span>
              </div>
              <div className="widget-progress mt-1">
                <div
                  className="widget-progress__fill"
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {identityNote ? (
        <div className="flex items-start gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{identityNote}</span>
        </div>
      ) : null}

      {redFlagsCount > 0 ? (
        <div className="flex items-start gap-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
          <MinusCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
          <span>
            {redFlagsCount} red flag{redFlagsCount === 1 ? "" : "s"} from latest scan — calibre
            reduced by up to {Math.min(15, redFlagsCount * 3)} points.
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="text-xs font-semibold text-[var(--brand-700)] hover:underline"
      >
        {expanded ? "Hide" : "How this is scored"}
      </button>

      {expanded ? (
        <div className="space-y-1.5 rounded-[8px] border border-[var(--border-3)] bg-[var(--surface-1)] px-3 py-2.5 text-xs leading-5 text-[var(--text-3)]">
          <p>
            <strong className="text-[var(--text-2)]">Weighted average:</strong>{" "}
            technical depth ({WEIGHTS.technicalDepth}%) + code quality ({WEIGHTS.codeQuality}%) +
            delivery readiness ({WEIGHTS.deliveryReadiness}%) + AI fluency ({WEIGHTS.aiFluency}%).
          </p>
          <p>
            <strong className="text-[var(--text-2)]">Red-flag penalty:</strong> −3 per open red
            flag from the latest validation scan, capped at −15 total.
          </p>
          <p>
            <strong className="text-[var(--text-2)]">Identity caps:</strong> PENDING → max 50;
            LOW → max 65. HIGH and MEDIUM have no cap.
          </p>
          <p>
            <strong className="text-[var(--text-2)]">Tier:</strong> 80+ → Tier 1, 60–79 → Tier 2,
            below 60 → Tier 3. Admins can override per dev.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Grouped list of validation checks for the drawer. PASS / WARN / FAIL pills
 * mirror the Pulse report layout so the validation story reads the same as
 * the project-health story.
 */
export function ValidationCheckList({ checks }: { checks: CodeClearCheckRecord[] }) {
  if (!checks.length) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
        No validation checks yet — click <span className="font-medium text-[var(--text-2)]">Run validation</span> to gather signals from this dev&apos;s GitHub profile.
      </div>
    );
  }

  // Group by category, preserving the order seen in the array (which already
  // came back ordered by [category asc, sortOrder asc] from the server).
  const groups: Array<{ category: string; items: CodeClearCheckRecord[] }> = [];
  for (const check of checks) {
    const last = groups[groups.length - 1];
    if (last && last.category === check.category) {
      last.items.push(check);
    } else {
      groups.push({ category: check.category, items: [check] });
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <p className="widget-data-label mb-2">{group.category}</p>
          <ul className="divide-y divide-[var(--border-3)] overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
            {group.items.map((check) => (
              <li key={check.id} className="flex items-start gap-3 px-4 py-2.5">
                <CheckIcon status={check.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
                  {check.detail ? (
                    <p className="mt-0.5 text-xs text-[var(--text-4)]">{check.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CheckIcon({ status }: { status: CodeClearCheckStatus }) {
  if (status === "PASS") {
    return <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
  }
  if (status === "WARN") {
    return <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  }
  if (status === "FAIL") {
    return <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />;
  }
  return <MinusCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />;
}

function TierBadge({ tier }: { tier: CodeClearTier }) {
  const label = tier === "TIER_1" ? "Tier 1" : tier === "TIER_2" ? "Tier 2" : "Tier 3";
  const tone =
    tier === "TIER_1"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tier === "TIER_2"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]";
  return (
    <span
      className={cn(
        "shrink-0 rounded-[6px] border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}
