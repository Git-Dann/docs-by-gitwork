import { cn } from "@/lib/format";
import type { GateEvaluationRecord, ReleaseDecisionState } from "@/types/pulse";

/** Plain words for each decision — the label a non-engineer reads first. */
export const GATE_LABEL: Record<ReleaseDecisionState, string> = {
  READY: "Ready to ship",
  CONDITIONAL: "Ship with reservations",
  BLOCKED: "Blocked",
  INCONCLUSIVE: "Not enough evidence",
};

/**
 * The release decision, at the top of the report.
 *
 * A score says how a product is doing; this says whether it can ship and what is
 * stopping it. It leads because that is the question the reader actually arrived
 * with — §39 of the assurance brief puts the decision above the number for
 * exactly that reason.
 *
 * INCONCLUSIVE is styled as its own state, not as a soft failure: "we could not
 * establish this" and "this is broken" are different facts with different fixes,
 * and collapsing them is the mistake the whole gate exists to avoid.
 */
export function ReleaseGateBanner({ gate }: { gate: GateEvaluationRecord }) {
  // Semantic tokens, not Tailwind's own reds and ambers — the palette has no
  // -600 step and the literals do not flip in dark mode, which is the defect
  // §42.12 had to go back and fix across Care.
  //
  // Colour lives in the accent rule, the dot and the decision word; the reasons
  // stay in ordinary text tokens. This banner renders on EVERY scan, and a
  // saturated panel that is always on screen becomes wallpaper — the same
  // lesson §42.7 had to learn when Care's reply banner filled a card on healthy
  // threads too. Only BLOCKED is allowed to fill, because it is the one state
  // that must interrupt.
  //
  // INCONCLUSIVE is deliberately NEUTRAL rather than a warning colour. It is not
  // a finding about the product; colouring it like one invites a reader to treat
  // "we could not see enough" as "something is wrong here", and the two need
  // different actions from different people.
  const tone =
    gate.decision === "BLOCKED"
      ? { rule: "border-l-[var(--danger-500)]", bg: "bg-[var(--danger-50)]", text: "text-[var(--danger-700)]", dot: "bg-[var(--danger-500)]" }
      : gate.decision === "INCONCLUSIVE"
        ? { rule: "border-l-[var(--text-4)]", bg: "bg-[var(--surface-0)]", text: "text-[var(--text-2)]", dot: "bg-[var(--text-4)]" }
        : gate.decision === "CONDITIONAL"
          ? { rule: "border-l-[var(--warning-500)]", bg: "bg-[var(--surface-0)]", text: "text-[var(--warning-500)]", dot: "bg-[var(--warning-500)]" }
          : { rule: "border-l-[var(--success-500)]", bg: "bg-[var(--surface-0)]", text: "text-[var(--success-500)]", dot: "bg-[var(--success-500)]" };

  const reasons = gate.decision === "BLOCKED" ? gate.blocking
    : gate.decision === "INCONCLUSIVE" ? gate.unverified
      : gate.decision === "CONDITIONAL" ? gate.conditional
        : [];

  return (
    <div className={cn("rounded-[10px] border border-[var(--border-1)] border-l-[3px] p-4", tone.rule, tone.bg)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone.dot)} />
        <span className={cn("text-sm font-semibold", tone.text)}>{GATE_LABEL[gate.decision]}</span>
        <span className="widget-data-label text-[var(--text-4)]">
          {gate.policy.label} · health {gate.metrics.health} · coverage {gate.metrics.coverage}%
        </span>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {reasons.map((reason) => (
            <li key={reason.code} className="text-xs leading-5 text-[var(--text-2)]">{reason.summary}</li>
          ))}
        </ul>
      )}
      {/* Always visible, whatever the decision — a READY that quietly omits what
          it could not check is the overstatement this report is built to avoid. */}
      {gate.decision !== "INCONCLUSIVE" && gate.unverified.length > 0 && (
        <p className="mt-2 border-t border-current/10 pt-2 text-xs leading-5 text-[var(--text-3)]">
          {gate.unverified.map((reason) => reason.summary).join(" ")}
        </p>
      )}
      <p className="mt-2 text-[10px] text-[var(--text-4)]">
        Decided from the checks and coverage on this scan under policy{" "}
        <span className="font-mono">{gate.policy.id}@{gate.policy.version}</span>. No AI output is used.
      </p>
    </div>
  );
}

