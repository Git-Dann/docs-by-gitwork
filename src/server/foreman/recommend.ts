/**
 * Foreman — deterministic recommendation generator.
 *
 * Pure + framework-free so it's unit-testable and the server can import it freely. Every finding
 * gets a concrete, specific next step ("ways it might improve") keyed on its kind + a small context.
 * These are always present regardless of the opt-in AI pass, so a recommendation is never missing.
 */

import type { FindingKind } from "./types";

export interface RecoContext {
  clientLabel?: string;
  devLabel?: string;
  count?: number;
  blockName?: string;
  progressPct?: number;
  milestoneName?: string;
  days?: number;
  clientCount?: number;
  dueSoonDays?: number;
}

function plural(n: number | undefined, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function recommendationFor(kind: FindingKind, ctx: RecoContext): string {
  const n = ctx.count ?? 0;
  const client = ctx.clientLabel ?? "the client";
  const dev = ctx.devLabel ?? "the developer";

  switch (kind) {
    case "OVERDUE_TASKS":
      return `Triage with ${client}: reprioritise or reassign the ${n} overdue ${plural(n, "task", "tasks")}, or agree realistic new due dates and reflect them on the timeline so the board stops lying.`;
    case "BLOCK_SLIPPING":
      return `Re-baseline "${ctx.blockName ?? "this block"}" — move its end date to a target you can hit, or split the remaining ${100 - (ctx.progressPct ?? 0)}% into a new block, and tell ${client} on the shared timeline before they notice.`;
    case "MILESTONE_MISSED":
      return `"${ctx.milestoneName ?? "The milestone"}" is ${ctx.days ?? 0} ${plural(ctx.days, "day", "days")} past due with work outstanding. Re-date it to a committed target and send ${client} a short heads-up rather than letting it drift.`;
    case "MILESTONE_IMMINENT":
      return `"${ctx.milestoneName ?? "A milestone"}" lands in ${ctx.days ?? 0} ${plural(ctx.days, "day", "days")} with work still open. Confirm the remaining tasks can land in time, or move the date now while there's warning.`;
    case "DUE_SOON_CLUSTER":
      return `${n} tasks all fall due for ${client} within ${ctx.dueSoonDays ?? 3} days. Spread the due dates or pull people in early so the week doesn't tip into overdue.`;
    case "UNASSIGNED_WORK":
      return `${n} time-critical ${plural(n, "task has", "tasks have")} no owner. Assign each one — unowned deadlines are the ones that quietly slip.`;
    case "DEV_OVERDUE":
      return `Check in with ${dev}: ${n} overdue ${plural(n, "task", "tasks")}${ctx.clientCount && ctx.clientCount > 1 ? ` across ${ctx.clientCount} clients` : ""} usually means a blocker or overload — unblock, rebalance, or renegotiate the dates.`;
    case "DEV_STALLED":
      return `${dev} has ${n} in-progress ${plural(n, "task", "tasks")} that hasn't moved in ${ctx.days ?? 0}+ days. Ask if it's blocked, needs a pair, or should be broken down.`;
    case "DEV_OVERLOADED":
      return `${dev} is spread across ${ctx.clientCount ?? 0} clients (${n} open tasks). Consider consolidating their focus or moving some work to someone with headroom.`;
    case "NO_TIMELINE":
      return `Add at least one dated feature block for ${client} so Foreman can measure slippage — right now there's active work but no timeline to judge it against.`;
    case "NO_DUE_DATES":
      return `${n} of ${client}'s open tasks have no due date. Set dates so timing can actually be tracked — undated tasks are invisible to every "late" check.`;
    case "BLOCK_NO_DATES":
      return `${n} of ${client}'s feature ${plural(n, "block has", "blocks have")} no start/end dates, so ${plural(n, "it is", "they are")} excluded from the Gantt. Add dates to bring ${plural(n, "it", "them")} into the timeline.`;
    default:
      return "Review this with the delivery lead.";
  }
}
