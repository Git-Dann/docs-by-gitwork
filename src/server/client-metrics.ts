// Per-client aggregate metrics for the Portal client cards: assigned-dev count
// (always shown) plus the sensitive monthly dev cost + working-days-elapsed
// (shown only to viewers holding `clients.viewFinancials` / Super Admins).
//
// All queries are batched across the whole client set (no N+1) and key results by
// clientId, mirroring how listDerivedClients already builds its care/repo maps.

import { prisma } from "@/lib/prisma";
import { normalizeToMonthly } from "@/server/rate-card";
import type { ClientMonthlyCost } from "@/types/client";

/** Count of developers assigned to each client (ClientAssignment). Always shown on cards. */
export async function computeClientDevCounts(
  workspaceId: string,
  clientIds: string[],
): Promise<Map<string, number>> {
  if (clientIds.length === 0) return new Map();
  const rows = await prisma.clientAssignment.groupBy({
    by: ["clientId"],
    where: { workspaceId, clientId: { in: clientIds } },
    _count: { userId: true },
  });
  return new Map(rows.map((r) => [r.clientId, r._count.userId]));
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
 * Cost path: ClientAssignment → User.email → Candidate(origin=INTERNAL).email →
 * rateCardPerson rate, normalised to monthly. Devs with no matched rate are counted as
 * `unpricedDevs` and excluded from the sum, so a missing rate degrades gracefully
 * (visible, never silently understated or thrown).
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

  const [assignments, blockStarts] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: { workspaceId, clientId: { in: clientIds } },
      select: { clientId: true, user: { select: { email: true } } },
    }),
    // Gantt timeline start per client — earliest dated feature block. No fallback to
    // tasks/createdAt: working days only count once a real Gantt timeline exists.
    prisma.featureBlock.groupBy({
      by: ["clientId"],
      where: { workspaceId, clientId: { in: clientIds }, startDate: { not: null } },
      _min: { startDate: true },
    }),
  ]);

  // Rate lookup by dev email — one batched Candidate query for the assigned devs.
  const emails = Array.from(
    new Set(assignments.map((a) => a.user.email).filter((e): e is string => Boolean(e))),
  );
  const candidates = emails.length
    ? await prisma.candidate.findMany({
        where: { workspaceId, origin: "INTERNAL", email: { in: emails } },
        select: {
          email: true,
          rateCardPerson: {
            select: { sourceRate: true, billingPeriod: true, sourceCurrencyCode: true },
          },
        },
      })
    : [];
  const rateByEmail = new Map<string, { monthly: number; currency: string }>();
  for (const c of candidates) {
    if (!c.email || !c.rateCardPerson) continue;
    rateByEmail.set(c.email.toLowerCase(), {
      monthly: normalizeToMonthly(c.rateCardPerson.sourceRate, c.rateCardPerson.billingPeriod),
      currency: c.rateCardPerson.sourceCurrencyCode,
    });
  }

  // Group assignments + earliest-start per client.
  const devsByClient = new Map<string, Array<string | null>>();
  for (const a of assignments) {
    const list = devsByClient.get(a.clientId) ?? [];
    list.push(a.user.email);
    devsByClient.set(a.clientId, list);
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
      for (const email of devs) {
        const rate = email ? rateByEmail.get(email.toLowerCase()) : undefined;
        if (rate) {
          amount += rate.monthly;
          pricedDevs += 1;
          currency = rate.currency;
        } else {
          unpricedDevs += 1;
        }
      }
      monthlyCost = { amount: Math.round(amount), currency, pricedDevs, unpricedDevs };
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
