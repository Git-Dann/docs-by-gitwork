/**
 * The AI budget Dispatch watches: the $200 pot on the workspace's Anthropic key, shared with
 * every AI feature (Pulse, Docs, Care…), not just Dispatch. Pure.
 *
 * A period is the calendar month (UTC) unless `budgetSince` is set, in which case it is
 * everything since that date: a one-off pot of credit rather than a monthly allowance.
 * Super Admins are told once at each of 50%, 80% and 95% per period. Nothing is blocked at
 * 100%: the pot is a figure to watch, and the provider stops calls when credit runs out.
 */

export const BUDGET_LEVELS = [50, 80, 95] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

export interface BudgetPeriod {
  start: Date;
  /** Stable id for "alerts already sent this period". */
  key: string;
  /** "November 2026" or "since 1 Dec 2026". */
  label: string;
}

export function budgetPeriod(budgetSince: string | null, now: Date = new Date()): BudgetPeriod {
  if (budgetSince && /^\d{4}-\d{2}-\d{2}$/.test(budgetSince)) {
    const start = new Date(`${budgetSince}T00:00:00Z`);
    if (!Number.isNaN(start.getTime()) && start.getTime() <= now.getTime()) {
      const label = start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
      return { start, key: `since-${budgetSince}`, label: `since ${label}` };
    }
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    start,
    key: start.toISOString().slice(0, 7),
    label: `in ${start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`,
  };
}

/**
 * Which alert to send now. Only the HIGHEST newly crossed level is sent (a first check at 96%
 * says "95%", not three messages); every crossed level is then marked sent.
 */
export function budgetAlert(
  spentUsd: number,
  budgetUsd: number,
  alreadySent: readonly number[],
): { send: BudgetLevel | null; mark: BudgetLevel[] } {
  if (!(budgetUsd > 0)) return { send: null, mark: [] };
  const pct = (spentUsd / budgetUsd) * 100;
  const crossed = BUDGET_LEVELS.filter((l) => pct >= l);
  const fresh = crossed.filter((l) => !alreadySent.includes(l));
  return { send: fresh.length ? fresh[fresh.length - 1] : null, mark: fresh };
}

export function formatBudgetUsd(n: number): string {
  // Whole dollars stay whole ("$200"); anything else to the cent ("$161.50").
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function budgetAlertCopy(
  level: BudgetLevel,
  spentUsd: number,
  budgetUsd: number,
  period: BudgetPeriod,
): { title: string; body: string } {
  return {
    title: `AI spend has reached ${level}% of the ${formatBudgetUsd(budgetUsd)} budget`,
    body: `${formatBudgetUsd(spentUsd)} of ${formatBudgetUsd(budgetUsd)} used ${period.label}, across every AI feature on the Anthropic key (Dispatch included). See Analytics → AI usage; the budget is in Settings → Dispatch.`,
  };
}
