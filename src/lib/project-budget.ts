/**
 * Projects: budget against what has been spent, and how far the work has got (CLAUDE.md §150).
 *
 * Pure, so every rule that turns placements and tasks into a figure is tested. Nothing here is
 * stored: the server reads the project, its linked document, the client's placements and the
 * project's tasks (src/server/projects.ts) and this works the figures out each time.
 *
 * The rules, which the page also states in words:
 *
 *  - The budget is what the linked accepted document is worth, worked out exactly as Money works
 *    it out (`docTerms` in src/lib/money.ts: role lines are rate × months, other lines are one-off,
 *    after discount, without VAT). A budget typed by hand is used only when no document is linked.
 *  - Spent so far is what the developers on the client cost at rate-card rates (the rate card is
 *    cost, as on Money and Portal) over the project's dates up to today. Each developer's monthly
 *    rate is spread over the weekdays of each calendar month, and the project is charged for the
 *    weekdays they were placed on the client inside its dates.
 *  - Pro-bono developers cost nothing and are left out. A developer with no rate (no rate-card
 *    link, or an archived one) is left out of the figure and counted, never treated as free.
 *  - Today's rate is used for the whole period: the rate card keeps no history.
 *  - Placements are per client, not per project. When two projects of a client run at the same
 *    time, both are charged for the same developers, and the page names the other project.
 *  - Work done is the share of the project's top-level tasks that are done. A task belongs to a
 *    project directly, or through its release or its category.
 */

import { toBase, type FxRates } from "@/lib/money";

export const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD", "DONE"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  DONE: "Done",
};

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}

/** Reads a stored status; anything unknown reads as Planned rather than breaking the page. */
export function readProjectStatus(v: unknown): ProjectStatus {
  return isProjectStatus(v) ? v : "PLANNED";
}

export const PROJECT_LIMITS = { name: 120, budget: 100_000_000 } as const;

const DAY = 86_400_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Midnight UTC of the day a date falls on. */
export function dayOf(d: Date | string): number {
  const x = typeof d === "string" ? new Date(d) : d;
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/** Weekdays (Mon–Fri) from `a` to `b` inclusive, UTC. 0 when `b` is before `a`. Bank holidays are not removed. */
export function weekdaysBetween(a: number, b: number): number {
  if (b < a) return 0;
  const total = Math.floor((b - a) / DAY) + 1;
  const weeks = Math.floor(total / 7);
  let n = weeks * 5;
  const startDow = new Date(a).getUTCDay();
  for (let i = 0; i < total - weeks * 7; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return n;
}

/** YYYY-MM for a UTC day. */
function monthOf(day: number): string {
  const d = new Date(day);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MonthSlice {
  /** YYYY-MM. */
  month: string;
  /** Weekdays of this month inside the range. */
  days: number;
  /** Weekdays in the whole month. */
  monthDays: number;
}

/** The calendar months a range covers, with how many of each month's weekdays fall inside it. */
export function monthSlices(from: number, to: number): MonthSlice[] {
  const out: MonthSlice[] = [];
  if (to < from) return out;
  let d = new Date(from);
  let cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  while (cursor <= to) {
    d = new Date(cursor);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const monthEnd = next - DAY;
    out.push({
      month: monthOf(cursor),
      days: weekdaysBetween(Math.max(from, cursor), Math.min(to, monthEnd)),
      monthDays: weekdaysBetween(cursor, monthEnd),
    });
    cursor = next;
  }
  return out;
}

/** One placement of a developer on the client, with the developer's rate. */
export interface PlacementCost {
  candidateId: string;
  /** ISO. */
  start: string;
  /** ISO; null = still on it. */
  end: string | null;
  /** The developer's rate per month (rate card, normalised); null = no rate. */
  monthly: number | null;
  currency: string;
  proBono: boolean;
}

export interface Spend {
  /** Spent in the project's currency over its dates so far. */
  amount: number;
  /** Spent in each month, oldest first (YYYY-MM), in the project's currency. */
  byMonth: Array<{ month: string; amount: number }>;
  /** Distinct developers with a rate who were placed inside the dates. */
  pricedDevs: number;
  /** Distinct developers with no rate, left out of `amount`. */
  unpricedDevs: number;
  /** Amounts left out because their currency had no rate, per currency. */
  unconverted: Record<string, number>;
}

/**
 * What the developers placed on the client cost inside [start, min(end, now)], in `fx.base`.
 * A developer placed twice is charged for each placement's days (never the same day twice).
 */
export function spendToDate(input: {
  placements: PlacementCost[];
  start: string;
  end: string | null;
  now: Date;
  fx: FxRates;
}): Spend {
  const from = dayOf(input.start);
  const until = Math.min(input.end ? dayOf(input.end) : Infinity, dayOf(input.now));
  const unconverted: Record<string, number> = {};
  const months = new Map<string, number>();
  for (const s of monthSlices(from, until)) months.set(s.month, 0);
  const priced = new Set<string>();
  const unpriced = new Set<string>();

  // One set of charged days per developer, so overlapping placements never charge a day twice.
  const byDev = new Map<string, { monthly: number | null; currency: string; ranges: Array<[number, number]> }>();
  for (const p of input.placements) {
    if (p.proBono) continue;
    const a = Math.max(from, dayOf(p.start));
    const b = Math.min(until, p.end ? dayOf(p.end) : Infinity);
    if (b < a) continue;
    const e = byDev.get(p.candidateId) ?? { monthly: p.monthly, currency: p.currency, ranges: [] };
    e.ranges.push([a, b]);
    byDev.set(p.candidateId, e);
  }

  for (const [id, dev] of byDev) {
    if (dev.monthly == null || !(dev.monthly > 0)) {
      unpriced.add(id);
      continue;
    }
    priced.add(id);
    // Merge overlapping ranges.
    const ranges = [...dev.ranges].sort((x, y) => x[0] - y[0]);
    const merged: Array<[number, number]> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + DAY) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    for (const [a, b] of merged) {
      for (const s of monthSlices(a, b)) {
        if (s.monthDays === 0 || s.days === 0) continue;
        const own = (dev.monthly * s.days) / s.monthDays;
        const converted = toBase(own, dev.currency, input.fx);
        if (converted == null) {
          unconverted[dev.currency] = round2((unconverted[dev.currency] ?? 0) + own);
          continue;
        }
        months.set(s.month, (months.get(s.month) ?? 0) + converted);
      }
    }
  }

  const byMonth = [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, amount]) => ({ month, amount: round2(amount) }));
  return {
    amount: round2(byMonth.reduce((s, m) => s + m.amount, 0)),
    byMonth,
    pricedDevs: priced.size,
    unpricedDevs: unpriced.size,
    unconverted,
  };
}

/** One task, as the progress rules read it. */
export interface ProjectTask {
  done: boolean;
  estimateHours: number | null;
}

export interface WorkProgress {
  tasks: number;
  done: number;
  /** 0–1; null when the project has no tasks yet (not "0% done"). */
  share: number | null;
  /** Null when no task carries an estimate. */
  estimate: { total: number; done: number; remaining: number; unestimated: number } | null;
}

export function workProgress(tasks: ProjectTask[]): WorkProgress {
  const done = tasks.filter((t) => t.done).length;
  const estimated = tasks.filter((t) => t.estimateHours != null && t.estimateHours >= 0);
  const doneHours = estimated.filter((t) => t.done).reduce((s, t) => s + (t.estimateHours ?? 0), 0);
  const total = estimated.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
  return {
    tasks: tasks.length,
    done,
    share: tasks.length > 0 ? done / tasks.length : null,
    estimate:
      estimated.length > 0
        ? { total: round2(total), done: round2(doneHours), remaining: round2(total - doneHours), unestimated: tasks.length - estimated.length }
        : null,
  };
}

/** Share (0–1) of the project's dates gone by; null with no end date. Clamped to 0–1. */
export function timeElapsed(start: string, end: string | null, now: Date): number | null {
  if (!end) return null;
  const a = dayOf(start);
  const b = dayOf(end);
  const n = dayOf(now);
  if (b <= a) return n >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (n - a) / (b - a)));
}

/** Which project a task belongs to: its own link first, then its release's, then its category's. */
export function projectOfTask(
  task: { projectId: string | null; releaseId: string | null; featureBlockId: string | null },
  releaseProject: ReadonlyMap<string, string>,
  blockProject: ReadonlyMap<string, string>,
): string | null {
  if (task.projectId) return task.projectId;
  if (task.releaseId && releaseProject.has(task.releaseId)) return releaseProject.get(task.releaseId) ?? null;
  if (task.featureBlockId && blockProject.has(task.featureBlockId)) return blockProject.get(task.featureBlockId) ?? null;
  return null;
}

/** The other projects of the same client whose dates overlap this one's (they share the team). */
export function overlappingProjects<T extends { id: string; name: string; startDate: string; endDate: string | null }>(
  project: T,
  others: T[],
): string[] {
  const a = dayOf(project.startDate);
  const b = project.endDate ? dayOf(project.endDate) : Infinity;
  return others
    .filter((o) => o.id !== project.id)
    .filter((o) => dayOf(o.startDate) <= b && (o.endDate ? dayOf(o.endDate) : Infinity) >= a)
    .map((o) => o.name);
}

export type VerdictKind = "no_budget" | "no_spend" | "not_started" | "over" | "burning_fast" | "ahead_of_time" | "on_budget";

export interface Verdict {
  kind: VerdictKind;
  /** One sentence, plain words. */
  text: string;
  tone: "neutral" | "good" | "warning" | "danger";
}

/** How far burn may run ahead of work done (or of time, with no tasks) before it is called out. */
export const BURN_SLACK = 0.15;

export function verdict(input: {
  budget: number | null;
  spent: number | null;
  /** 0–1 or null. */
  workShare: number | null;
  timeShare: number | null;
  started: boolean;
}): Verdict {
  const { budget, spent, workShare, timeShare } = input;
  if (budget == null || !(budget > 0)) return { kind: "no_budget", text: "No budget set.", tone: "neutral" };
  if (!input.started) return { kind: "not_started", text: "Not started yet.", tone: "neutral" };
  if (spent == null) {
    return { kind: "no_spend", text: "Spend can't be worked out: no developer on it has a rate.", tone: "neutral" };
  }
  const burned = spent / budget;
  if (burned > 1) return { kind: "over", text: "Over budget.", tone: "danger" };
  if (workShare != null && burned - workShare > BURN_SLACK) {
    return { kind: "burning_fast", text: "Burning faster than work is getting done.", tone: "warning" };
  }
  if (workShare == null && timeShare != null && burned - timeShare > BURN_SLACK) {
    return { kind: "ahead_of_time", text: "Spending ahead of the dates. No tasks to measure work by.", tone: "warning" };
  }
  return { kind: "on_budget", text: "On budget.", tone: "good" };
}

export interface BurnPoint {
  /** YYYY-MM. */
  month: string;
  /** Spent to the end of this month (only up to today). Null for months still to come. */
  spent: number | null;
  /** Where spend would be at the end of this month if the budget ran evenly over the dates. Null with no end date or no budget. */
  planned: number | null;
}

/** Month-by-month cumulative spend against an even plan, for the burn chart. */
export function burnSeries(input: {
  start: string;
  end: string | null;
  now: Date;
  budget: number | null;
  byMonth: Array<{ month: string; amount: number }>;
}): BurnPoint[] {
  const from = dayOf(input.start);
  const today = dayOf(input.now);
  const last = input.end ? dayOf(input.end) : today;
  const months = monthSlices(from, Math.max(last, from));
  const spentBy = new Map(input.byMonth.map((m) => [m.month, m.amount]));
  const thisMonth = monthOf(today);
  const totalDays = input.end ? weekdaysBetween(from, dayOf(input.end)) : 0;
  let running = 0;
  let plannedDays = 0;
  return months.map((s) => {
    running += spentBy.get(s.month) ?? 0;
    plannedDays += s.days;
    const past = s.month <= thisMonth;
    return {
      month: s.month,
      spent: past ? round2(running) : null,
      planned: input.budget != null && totalDays > 0 ? round2((input.budget * plannedDays) / totalDays) : null,
    };
  });
}

export interface ProjectFigures {
  currency: string;
  budget: number | null;
  budgetSource: "document" | "manual" | null;
  /** Null when no developer on it has a rate (nothing could be priced). */
  spent: number | null;
  /** spent / budget, 0–n. */
  burned: number | null;
  pricedDevs: number;
  unpricedDevs: number;
  unconverted: Record<string, number>;
  verdict: Verdict;
  burn: BurnPoint[];
}

/** Every money figure on a project, from its budget and the client's placements. */
export function projectFigures(input: {
  start: string;
  end: string | null;
  now: Date;
  budget: { amount: number; currency: string; source: "document" | "manual" } | null;
  placements: PlacementCost[];
  fx: FxRates;
  progress: WorkProgress;
}): ProjectFigures {
  // Every figure is in fx.base: the server reads the rates with the budget's currency as base, so
  // the budget passes through unchanged and only developers paid in another currency convert.
  const currency = input.fx.base;
  const started = dayOf(input.start) <= dayOf(input.now);
  const spend = spendToDate({ placements: input.placements, start: input.start, end: input.end, now: input.now, fx: input.fx });
  // Only unpriced developers: spend can't be known. Nobody placed at all: nothing was spent.
  const spent = spend.pricedDevs === 0 && spend.unpricedDevs > 0 ? null : spend.amount;
  const budgetRaw = input.budget && input.budget.amount > 0 ? toBase(input.budget.amount, input.budget.currency, input.fx) : null;
  const budget = budgetRaw != null && budgetRaw > 0 ? budgetRaw : null;
  if (input.budget && input.budget.amount > 0 && budget == null) {
    unconvertedBudget(spend.unconverted, input.budget.currency, input.budget.amount);
  }
  return {
    currency,
    budget,
    budgetSource: budget != null ? input.budget!.source : null,
    spent,
    burned: budget != null && spent != null ? spent / budget : null,
    pricedDevs: spend.pricedDevs,
    unpricedDevs: spend.unpricedDevs,
    unconverted: spend.unconverted,
    verdict: verdict({
      budget,
      spent,
      workShare: input.progress.share,
      timeShare: timeElapsed(input.start, input.end, input.now),
      started,
    }),
    burn: burnSeries({ start: input.start, end: input.end, now: input.now, budget, byMonth: spend.byMonth }),
  };
}

function unconvertedBudget(into: Record<string, number>, currency: string, amount: number): void {
  into[currency] = round2((into[currency] ?? 0) + amount);
}

/** "42%" for 0.42; "—" for null. */
export function percentText(share: number | null): string {
  return share == null ? "—" : `${Math.round(share * 100)}%`;
}
