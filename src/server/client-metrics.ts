// Per-client aggregate metrics for the Portal client cards: active-dev count
// (always shown) plus the sensitive monthly dev cost + working-days-elapsed
// (shown only to viewers holding `clients.viewFinancials` / Super Admins).
//
// Devs + cost come from each client's ACTIVE placements (Candidate → Placement,
// endDate null) — the same source as the client detail's "DEVS" tile and Code's
// "current clients", so the card matches the detail and rates resolve straight off
// the candidate's rate-card link (no fragile User.email → Candidate join).
//
// All queries are batched across the whole client set (no N+1) and key results by
// clientId, mirroring how listDerivedClients already builds its care/repo maps.

import { prisma } from "@/lib/prisma";
import { normalizeToMonthly } from "@/server/rate-card";
import { getHolidaysForCountry } from "@/server/backstage-holidays";
import type { ClientMonthlyCost, ClientHealth, ClientHealthLevel } from "@/types/client";

/** Count of active devs on each client — distinct candidates with an open placement
 *  (endDate null), matching the client detail's "DEVS" tile. Always shown on cards. */
export async function computeClientDevCounts(
  workspaceId: string,
  clientIds: string[],
): Promise<Map<string, number>> {
  if (clientIds.length === 0) return new Map();
  const placements = await prisma.placement.findMany({
    where: { clientId: { in: clientIds }, endDate: null, candidate: { workspaceId } },
    select: { clientId: true, candidateId: true },
  });
  const byClient = new Map<string, Set<string>>();
  for (const p of placements) {
    if (!p.clientId) continue;
    const set = byClient.get(p.clientId) ?? new Set<string>();
    set.add(p.candidateId);
    byClient.set(p.clientId, set);
  }
  return new Map([...byClient].map(([id, set]) => [id, set.size]));
}

export interface ClientPulseHealth {
  scanId: string;
  healthScore: number | null;
  scannedAt: string | null;
}

/** Latest COMPLETED Pulse scan per client — batched, keyed by clientId. Powers the
 *  small health dot on Portal client cards. Always safe to show (not financial). */
export async function computeClientPulseHealth(
  workspaceId: string,
  clientIds: string[],
): Promise<Map<string, ClientPulseHealth>> {
  if (clientIds.length === 0) return new Map();
  const scans = await prisma.pulseScan.findMany({
    where: { workspaceId, clientId: { in: clientIds }, status: "COMPLETED" },
    select: { id: true, clientId: true, healthScore: true, completedAt: true },
    orderBy: { completedAt: "desc" },
  });
  const byClient = new Map<string, ClientPulseHealth>();
  for (const s of scans) {
    if (!s.clientId || byClient.has(s.clientId)) continue; // first = latest (desc order)
    byClient.set(s.clientId, {
      scanId: s.id,
      healthScore: s.healthScore,
      scannedAt: s.completedAt ? s.completedAt.toISOString() : null,
    });
  }
  return byClient;
}

/** Count of overdue open tasks per client — past due date, not done, not archived. A delivery
 *  signal feeding the client-health roll-up. Batched; keyed by clientId. Not financial. */
export async function computeClientOverdueTaskCounts(
  workspaceId: string,
  clientIds: string[],
): Promise<Map<string, number>> {
  if (clientIds.length === 0) return new Map();
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const rows = await prisma.task.groupBy({
    by: ["clientId"],
    where: {
      workspaceId,
      clientId: { in: clientIds },
      archivedAt: null,
      status: { not: "DONE" },
      dueDate: { lt: startOfToday },
    },
    _count: true,
  });
  const byClient = new Map<string, number>();
  for (const r of rows) byClient.set(r.clientId, r._count);
  return byClient;
}

/** Derive a composite delivery-health level from the cheap signals we already gather:
 *  overdue open tasks (delivery) + latest Pulse health (code). Returns null when neither
 *  signal exists, so the card shows nothing rather than implying a healthy empty client. */
export function deriveClientHealth(input: {
  pulseHealthScore: number | null;
  overdueTasks: number;
}): ClientHealth | null {
  const rank: Record<ClientHealthLevel, number> = { green: 0, amber: 1, red: 2 };
  let level: ClientHealthLevel | null = null;
  const reasons: string[] = [];
  const bump = (l: ClientHealthLevel) => {
    if (level == null || rank[l] > rank[level]) level = l;
  };

  if (input.overdueTasks > 0) {
    bump(input.overdueTasks >= 5 ? "red" : "amber");
    reasons.push(`${input.overdueTasks} overdue task${input.overdueTasks === 1 ? "" : "s"}`);
  }
  if (input.pulseHealthScore != null) {
    if (input.pulseHealthScore < 50) {
      bump("red");
      reasons.push(`Pulse health ${input.pulseHealthScore}`);
    } else if (input.pulseHealthScore < 75) {
      bump("amber");
      reasons.push(`Pulse health ${input.pulseHealthScore}`);
    } else {
      bump("green");
    }
  }

  if (level == null) return null;
  if (level === "green" && reasons.length === 0) reasons.push("On track");
  return { level, reasons };
}

export interface ClientFinancials {
  monthlyCost: ClientMonthlyCost | null;
  /** Business days since the Gantt timeline started, or null when the client has no
   *  dated feature block (no timeline) — the card hides the figure in that case. */
  workingDays: number | null;
}

/**
 * Monthly dev cost + working-days-elapsed per client. SENSITIVE — only call when the
 * viewer holds `clients.viewFinancials` (or is a Super Admin); the route gates it.
 *
 * Cost path: active Placement → Candidate → rateCardPerson rate, normalised to monthly —
 * the SAME rate Code shows (rateCardFields rules: pro-bono, archived rate-card, or
 * unlinked devs contribute no rate). Distinct candidate per client (multiple placements
 * count once). Billable devs with no resolvable rate are `unpricedDevs` (excluded from the
 * sum, surfaced on the card); pro-bono devs are simply free and excluded entirely.
 *
 * Working days: business days (Mon–Fri) from the project's Gantt start — the earliest
 * dated `FeatureBlock.startDate` — to today, excluding GB public/bank holidays. Null when
 * the client has no dated feature block (no Gantt timeline) so the card can hide it.
 */
export async function computeClientFinancials(
  workspaceId: string,
  clients: Array<{ id: string }>,
): Promise<Map<string, ClientFinancials>> {
  const result = new Map<string, ClientFinancials>();
  if (clients.length === 0) return result;
  const clientIds = clients.map((c) => c.id);

  const [placements, blockStarts] = await Promise.all([
    // Active devs on each client — open placements (endDate null), with the candidate's
    // rate-card link so cost resolves exactly as Code does. Scoped via the candidate.
    prisma.placement.findMany({
      where: { clientId: { in: clientIds }, endDate: null, candidate: { workspaceId } },
      select: {
        clientId: true,
        candidateId: true,
        candidate: {
          select: {
            devGroup: true,
            rateCardPerson: {
              select: {
                sourceRate: true,
                billingPeriod: true,
                sourceCurrencyCode: true,
                archivedAt: true,
              },
            },
          },
        },
      },
    }),
    // Gantt timeline start per client — earliest dated feature block. No fallback to
    // tasks/createdAt: working days only count once a real Gantt timeline exists.
    prisma.featureBlock.groupBy({
      by: ["clientId"],
      where: { workspaceId, clientId: { in: clientIds }, startDate: { not: null } },
      _min: { startDate: true },
    }),
  ]);

  // Resolve each distinct active dev's monthly rate (mirrors Code's rateCardFields:
  // pro-bono / archived / unlinked → no rate). Dedupe candidates per client.
  type DevRate = { monthly: number | null; currency: string; proBono: boolean };
  const devsByClient = new Map<string, DevRate[]>();
  const seenByClient = new Map<string, Set<string>>();
  for (const p of placements) {
    if (!p.clientId) continue;
    const seen = seenByClient.get(p.clientId) ?? new Set<string>();
    if (seen.has(p.candidateId)) continue; // a dev with multiple placements counts once
    seen.add(p.candidateId);
    seenByClient.set(p.clientId, seen);

    const rc = p.candidate.rateCardPerson;
    const proBono = p.candidate.devGroup === "PRO_BONO";
    let monthly: number | null = null;
    let currency = "USD";
    if (!proBono && rc && !rc.archivedAt) {
      monthly = normalizeToMonthly(rc.sourceRate, rc.billingPeriod);
      currency = rc.sourceCurrencyCode;
    }
    const list = devsByClient.get(p.clientId) ?? [];
    list.push({ monthly, currency, proBono });
    devsByClient.set(p.clientId, list);
  }

  const startByClient = new Map<string, Date>();
  for (const b of blockStarts) {
    if (b._min.startDate) startByClient.set(b.clientId, b._min.startDate);
  }

  const today = new Date();
  for (const client of clients) {
    const devs = devsByClient.get(client.id) ?? [];
    let monthlyCost: ClientMonthlyCost | null = null;
    if (devs.length > 0) {
      const billable = devs.filter((d) => !d.proBono); // pro-bono are free, excluded entirely
      const unpricedDevs = billable.filter((d) => d.monthly == null).length;

      // Group priced devs by currency. Summing across currencies is meaningless, so we
      // sum only the dominant currency (most devs, tie-broken by larger sum) and flag the
      // rest as `mixedCurrency` for the card to render as "mixed" rather than a bad total.
      const byCurrency = new Map<string, { count: number; sum: number }>();
      for (const d of billable) {
        if (d.monthly == null) continue;
        const e = byCurrency.get(d.currency) ?? { count: 0, sum: 0 };
        e.count += 1;
        e.sum += d.monthly;
        byCurrency.set(d.currency, e);
      }

      // Only surface a cost block when there's a billable dev (priced or unpriced) — an
      // all-pro-bono client shows no cost rather than a misleading "rates n/a".
      if (byCurrency.size > 0 || unpricedDevs > 0) {
        let currency = "USD";
        let amount = 0;
        let pricedDevs = 0;
        if (byCurrency.size > 0) {
          const [domCurrency, dom] = [...byCurrency.entries()].sort(
            (a, b) => b[1].count - a[1].count || b[1].sum - a[1].sum,
          )[0];
          currency = domCurrency;
          amount = dom.sum;
          pricedDevs = dom.count;
        }
        monthlyCost = {
          amount: Math.round(amount),
          currency,
          pricedDevs,
          unpricedDevs,
          mixedCurrency: byCurrency.size > 1,
        };
      }
    }

    // Working days only count once the Gantt has a dated start — else null (hidden on the card).
    const start = startByClient.get(client.id);
    const workingDays = start ? businessDaysBetween(start, today) : null;
    result.set(client.id, { monthlyCost, workingDays });
  }

  return result;
}

/** Inclusive count of business days (Mon–Fri) between two dates, in UTC, excluding the
 *  country's public/bank holidays (default GB — Gitwork's base). */
export function businessDaysBetween(start: Date, end: Date, countryCode = "GB"): number {
  const MS_PER_DAY = 86_400_000;
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (e < s) return 0;
  const totalDays = Math.floor((e - s) / MS_PER_DAY) + 1; // inclusive of both ends
  const fullWeeks = Math.floor(totalDays / 7);
  let business = fullWeeks * 5;
  const remaining = totalDays - fullWeeks * 7;
  const startDow = new Date(s).getUTCDay(); // 0=Sun … 6=Sat
  for (let i = 0; i < remaining; i += 1) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) business += 1;
  }

  // Subtract public/bank holidays that land on a weekday within the range (deduped by date).
  const startDate = new Date(s);
  const endDate = new Date(e);
  const holidayDates = new Set(
    getHolidaysForCountry(countryCode, startDate, endDate)
      .filter((h) => h.type === "public" || h.type === "bank")
      .map((h) => h.date),
  );
  let holidayWeekdays = 0;
  for (const iso of holidayDates) {
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) holidayWeekdays += 1;
  }
  return Math.max(0, business - holidayWeekdays);
}
