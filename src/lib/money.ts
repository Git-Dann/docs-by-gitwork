/**
 * Money: revenue under contract, what's still to bill, what's been won and what's in the
 * pipeline. For Super Admins and people granted `clients.viewFinancials` only.
 *
 * Pure, so every rule that turns a document into a figure is tested. Nothing is stored: the
 * server reads accepted documents and their cost lines (src/server/money.ts) and this works the
 * numbers out each time the page opens. The page states these rules in words:
 *
 *  - A proposal prices each role as a monthly rate × a number of months (the cost table's
 *    budget editor). Those lines are a schedule: the rate is earned each month for that many
 *    months, starting the month the document was accepted.
 *  - Any other line is a one-off, earned in the month the document was accepted.
 *  - A line marked recurring is a monthly fee with no end date.
 *  - Values are after the document's discount and without VAT.
 *  - This is revenue the documents commit to, not invoices. Foundry doesn't invoice.
 *  - Other currencies are converted at the day's rate; when there's no rate, the amount is
 *    left out of totals and the page says how much.
 */

export type CostKind = "ONE_OFF" | "RECURRING";

/** The cost table's prefixes for a role line (rate × months). Kept in step with cost-breakdown-table.tsx. */
export const ROLE_LINE_PREFIXES = ["rate-card:", "proposal-role:", "custom-role:"] as const;

export interface DocLine {
  itemName: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  costKind: CostKind;
}

export type LineSchedule =
  | { kind: "monthly"; amount: number; months: number }
  | { kind: "ongoing"; amount: number }
  | { kind: "once"; amount: number };

export interface DocTerms {
  currency: string;
  lines: LineSchedule[];
  /** Everything the document is worth, ongoing lines counted for 12 months. */
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A document's schedule from its cost lines and its costing block's currency and discount (%). */
export function docTerms(lines: DocLine[], costing: { currency?: unknown; discount?: unknown } | null): DocTerms {
  const currency = typeof costing?.currency === "string" && /^[A-Z]{3}$/.test(costing.currency) ? costing.currency : "GBP";
  const rawDiscount = typeof costing?.discount === "number" && Number.isFinite(costing.discount) ? costing.discount : 0;
  const keep = 1 - Math.min(Math.max(rawDiscount, 0), 100) / 100;
  const out: LineSchedule[] = [];
  let total = 0;
  for (const l of lines) {
    if (l.costKind === "RECURRING") {
      const amount = round2(finite(l.unitCost) * finite(l.quantity || 1) * keep);
      if (amount > 0) {
        out.push({ kind: "ongoing", amount });
        total += amount * 12;
      }
      continue;
    }
    const isRole = ROLE_LINE_PREFIXES.some((p) => l.itemName.startsWith(p));
    const months = Math.round(finite(l.quantity));
    if (isRole && months >= 1) {
      const amount = round2(finite(l.unitCost) * keep);
      if (amount > 0) {
        out.push({ kind: "monthly", amount, months });
        total += amount * months;
      }
      continue;
    }
    const amount = round2(finite(l.subtotal) * keep);
    if (amount > 0) {
      out.push({ kind: "once", amount });
      total += amount;
    }
  }
  return { currency, lines: out, total: round2(total) };
}

/** YYYY-MM for a date, UTC. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whole months from `from` to `to` (YYYY-MM each); negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** `n` consecutive months starting `offset` months from `now`'s month, oldest first. */
export function monthRange(now: Date, offset: number, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + i, 1))));
  }
  return out;
}

/** What a document earns in one month (in its own currency), given the month it was won. */
export function earnedIn(terms: DocTerms, wonMonth: string, month: string): number {
  const k = monthsBetween(wonMonth, month);
  if (k < 0) return 0;
  let sum = 0;
  for (const l of terms.lines) {
    if (l.kind === "once") sum += k === 0 ? l.amount : 0;
    else if (l.kind === "ongoing") sum += l.amount;
    else if (k < l.months) sum += l.amount;
  }
  return round2(sum);
}

/** The last month a document earns anything, or null when it runs on with no end. */
export function lastEarningMonth(terms: DocTerms, wonMonth: string): string | null {
  if (terms.lines.some((l) => l.kind === "ongoing")) return null;
  let longest = 1;
  for (const l of terms.lines) if (l.kind === "monthly") longest = Math.max(longest, l.months);
  const [y, m] = wonMonth.split("-").map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + longest - 1, 1)));
}

/** Rates to the base currency: 1 unit of the key = rates[key] units of base. */
export type FxRates = { base: string; rates: Record<string, number>; asOf: string | null };

/** Converts to the base currency, or null when there's no rate (never a guess). */
export function toBase(amount: number, currency: string, fx: FxRates): number | null {
  if (currency === fx.base) return amount;
  const r = fx.rates[currency];
  return typeof r === "number" && r > 0 ? round2(amount * r) : null;
}

export interface WonDoc {
  id: string;
  title: string;
  clientId: string | null;
  /** When it was accepted or signed. ISO. */
  wonAt: string;
  terms: DocTerms;
  /** Recorded by hand or from a file rather than written in Docs. */
  recorded?: boolean;
}

export interface PipelineDoc {
  id: string;
  title: string;
  clientId: string | null;
  sharedAt: string | null;
  viewed: boolean;
  terms: DocTerms;
}

export interface ClientMoneyInput {
  id: string;
  name: string;
  slug: string;
  /** What the team on the client is worth at rate-card rates, per month (client-metrics.ts). */
  team: { amount: number; currency: string; unpricedDevs: number } | null;
  retainerDays: number | null;
  retainerDaysUsed: number | null;
}

export interface ClientMoneyRow {
  id: string;
  name: string;
  slug: string;
  /** Revenue under contract this month, base currency. */
  thisMonth: number;
  /** Still to earn under signed documents after this month. */
  toCome: number;
  /** The last month anything is contracted; null = runs on, or nothing contracted. */
  contractedTo: string | null;
  ongoing: boolean;
  /** Won from this client in the last 12 months (document totals). */
  wonLast12: number;
  /** The team on it now at rate-card rates per month, base currency. */
  teamAtRateCard: number | null;
  unpricedDevs: number;
  retainer: { used: number; allowance: number } | null;
}

export interface MonthBar {
  /** YYYY-MM. */
  month: string;
  /** Revenue the accepted documents schedule for that month, base currency. */
  amount: number;
  /** After this month: only what's already signed, so it can only grow. */
  future: boolean;
}

export interface MoneySummary {
  base: string;
  thisMonth: number;
  /** thisMonth vs the month before, as a share (0.1 = +10%); null when last month was 0. */
  monthChange: number | null;
  /** Everything signed still to earn after this month. */
  toCome: number;
  wonLast12: number;
  dealsLast12: number;
  /** Document totals of sent documents still waiting on a decision. */
  pipeline: number;
  pipelineDeals: number;
  /** Twelve months back and six forward. */
  months: MonthBar[];
  clients: ClientMoneyRow[];
  pipelineDocs: Array<{ id: string; title: string; clientName: string | null; sharedAt: string | null; viewed: boolean; total: number | null; currency: string }>;
  recentWins: Array<{ id: string; title: string; clientName: string | null; wonAt: string; total: number | null; currency: string; recorded: boolean }>;
  /** Amounts left out of totals because their currency had no rate, per currency. */
  unconverted: Record<string, number>;
  unpricedDevs: number;
  fxAsOf: string | null;
}

export const PAST_MONTHS = 12;
export const FUTURE_MONTHS = 6;

export function summariseMoney(input: {
  clients: ClientMoneyInput[];
  won: WonDoc[];
  pipeline: PipelineDoc[];
  fx: FxRates;
  now: Date;
}): MoneySummary {
  const { fx, now } = input;
  const unconverted: Record<string, number> = {};
  const conv = (amount: number, currency: string): number | null => {
    const v = toBase(amount, currency, fx);
    if (v == null && amount > 0) unconverted[currency] = round2((unconverted[currency] ?? 0) + amount);
    return v;
  };
  // Conversion that doesn't record (for figures derived from amounts already recorded once).
  const quiet = (amount: number, currency: string) => toBase(amount, currency, fx);

  const current = monthKey(now);
  const previous = monthRange(now, -1, 1)[0];
  const months = monthRange(now, -(PAST_MONTHS - 1), PAST_MONTHS + FUTURE_MONTHS);
  const bars: MonthBar[] = months.map((month) => ({ month, amount: 0, future: month > current }));

  const clientName = new Map(input.clients.map((c) => [c.id, c.name]));
  const yearAgo = monthRange(now, -(PAST_MONTHS - 1), 1)[0];

  type Acc = { thisMonth: number; toCome: number; contractedTo: string | null; ongoing: boolean; wonLast12: number };
  const byClient = new Map<string, Acc>();
  const acc = (id: string) => {
    let a = byClient.get(id);
    if (!a) byClient.set(id, (a = { thisMonth: 0, toCome: 0, contractedTo: null, ongoing: false, wonLast12: 0 }));
    return a;
  };

  let thisMonth = 0;
  let lastMonth = 0;
  let toCome = 0;
  let wonLast12 = 0;
  let dealsLast12 = 0;
  const recentWins: MoneySummary["recentWins"] = [];

  const wonSorted = [...input.won].sort((a, b) => Date.parse(b.wonAt) - Date.parse(a.wonAt));
  for (const d of wonSorted) {
    const wonMonth = d.wonAt.slice(0, 7);
    const cur = d.terms.currency;
    const totalBase = conv(d.terms.total, cur);

    for (const bar of bars) {
      const v = quiet(earnedIn(d.terms, wonMonth, bar.month), cur);
      if (v) bar.amount = round2(bar.amount + v);
    }
    const now0 = quiet(earnedIn(d.terms, wonMonth, current), cur) ?? 0;
    const prev0 = quiet(earnedIn(d.terms, wonMonth, previous), cur) ?? 0;
    const end = lastEarningMonth(d.terms, wonMonth);
    let rest = 0;
    if (end === null) {
      // Runs on: count the next 12 months, and say "runs on" rather than pretend an end.
      for (const m of monthRange(now, 1, 12)) rest += earnedIn(d.terms, wonMonth, m);
    } else if (end > current) {
      for (const m of monthRange(now, 1, monthsBetween(current, end))) rest += earnedIn(d.terms, wonMonth, m);
    }
    const restBase = quiet(round2(rest), cur) ?? 0;
    thisMonth += now0;
    lastMonth += prev0;
    toCome += restBase;

    const inLastYear = wonMonth >= yearAgo;
    if (inLastYear) {
      recentWins.push({ id: d.id, title: d.title, clientName: d.clientId ? clientName.get(d.clientId) ?? null : null, wonAt: d.wonAt, total: totalBase, currency: cur, recorded: Boolean(d.recorded) });
      if (totalBase != null) {
        wonLast12 += totalBase;
        dealsLast12 += 1;
      }
    }

    if (d.clientId) {
      const a = acc(d.clientId);
      a.thisMonth += now0;
      a.toCome += restBase;
      if (inLastYear && totalBase != null) a.wonLast12 += totalBase;
      if (end === null && (now0 > 0 || restBase > 0)) a.ongoing = true;
      if (end !== null && end >= current && (!a.contractedTo || end > a.contractedTo)) a.contractedTo = end;
    }
  }

  let unpricedDevs = 0;
  const clients: ClientMoneyRow[] = input.clients.map((c) => {
    const a = byClient.get(c.id);
    const team = c.team ? (c.team.amount > 0 ? conv(c.team.amount, c.team.currency) : 0) : null;
    unpricedDevs += c.team?.unpricedDevs ?? 0;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      thisMonth: round2(a?.thisMonth ?? 0),
      toCome: round2(a?.toCome ?? 0),
      contractedTo: a?.ongoing ? null : a?.contractedTo ?? null,
      ongoing: a?.ongoing ?? false,
      wonLast12: round2(a?.wonLast12 ?? 0),
      teamAtRateCard: team,
      unpricedDevs: c.team?.unpricedDevs ?? 0,
      retainer: c.retainerDays ? { used: c.retainerDaysUsed ?? 0, allowance: c.retainerDays } : null,
    };
  });
  // The clients earning most this month lead, then what's still to come, then name.
  clients.sort((a, b) => b.thisMonth - a.thisMonth || b.toCome - a.toCome || a.name.localeCompare(b.name));

  let pipeline = 0;
  const pipelineDocs = [...input.pipeline]
    .sort((a, b) => b.terms.total - a.terms.total)
    .map((d) => {
      const total = conv(d.terms.total, d.terms.currency);
      if (total != null) pipeline += total;
      return {
        id: d.id,
        title: d.title,
        clientName: d.clientId ? clientName.get(d.clientId) ?? null : null,
        sharedAt: d.sharedAt,
        viewed: d.viewed,
        total,
        currency: d.terms.currency,
      };
    });

  thisMonth = round2(thisMonth);
  lastMonth = round2(lastMonth);
  return {
    base: fx.base,
    thisMonth,
    monthChange: lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : null,
    toCome: round2(toCome),
    wonLast12: round2(wonLast12),
    dealsLast12,
    pipeline: round2(pipeline),
    pipelineDeals: pipelineDocs.length,
    months: bars,
    clients,
    pipelineDocs,
    recentWins: recentWins.slice(0, 8),
    unconverted,
    unpricedDevs,
    fxAsOf: fx.asOf,
  };
}

/** £12,400 / £1.2m: whole units, compact from ten thousand when asked. */
export function formatMoney(amount: number, currency: string, opts: { compact?: boolean } = {}): string {
  const compact = Boolean(opts.compact) && Math.abs(amount) >= 10_000;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(amount);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar" or "Mar 2027" for YYYY-MM. Fixed names: en-GB writes September as "Sept". */
export function monthLabel(month: string, style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTHS[m - 1] ?? month;
  return style === "long" ? `${name} ${y}` : name;
}
