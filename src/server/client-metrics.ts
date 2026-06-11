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
import type { ClientMonthlyCost } from "@/types/client";

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
 * dated `FeatureBlock.startDate` — to today. Null when the client has no dated feature
 * block (no Gantt timeline) so the card can hide it. Public holidays are not excluded.
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
      let amount = 0;
      let pricedDevs = 0;
      let unpricedDevs = 0;
      let currency = "USD";
      for (const d of devs) {
        if (d.proBono) continue; // free — not billed, not counted as "unpriced"
        if (d.monthly != null) {
          amount += d.monthly;
          pricedDevs += 1;
          currency = d.currency;
        } else {
          unpricedDevs += 1;
        }
      }
      // Only surface a cost block when there's a billable dev (priced or unpriced) — an
      // all-pro-bono client shows no cost rather than a misleading "rates n/a".
      if (pricedDevs > 0 || unpricedDevs > 0) {
        monthlyCost = { amount: Math.round(amount), currency, pricedDevs, unpricedDevs };
      }
    }

    // Working days only count once the Gantt has a dated start — else null (hidden on the card).
    const start = startByClient.get(client.id);
    const workingDays = start ? businessDaysBetween(start, today) : null;
    result.set(client.id, { monthlyCost, workingDays });
  }

  return result;
}

/** Inclusive count of business days (Mon–Fri) between two dates, in UTC. Holidays not excluded. */
export function businessDaysBetween(start: Date, end: Date): number {
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
  return business;
}
