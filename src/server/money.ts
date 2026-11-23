/**
 * Reads what the Money page needs (rules in src/lib/money.ts). Only call for a viewer who passes
 * canViewClientFinancials; the route checks.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeClientFinancials } from "@/server/client-metrics";
import { loadFxRates } from "@/server/fx";
import { docTerms, summariseMoney, type MoneySummary, type DocLine } from "@/lib/money";

export const LINE_SELECT = { itemName: true, quantity: true, unitCost: true, subtotal: true, costKind: true } as const satisfies Prisma.CostLineItemSelect;

export type RawLine = { itemName: string; quantity: unknown; unitCost: unknown; subtotal: unknown; costKind: "ONE_OFF" | "RECURRING" };

export function lines(raw: RawLine[]): DocLine[] {
  return raw.map((l) => ({
    itemName: l.itemName,
    quantity: Number(l.quantity),
    unitCost: Number(l.unitCost),
    subtotal: Number(l.subtotal),
    costKind: l.costKind,
  }));
}

export function costingOf(sections: Array<{ data: unknown }>): { currency?: unknown; discount?: unknown } | null {
  const data = sections[0]?.data;
  return data && typeof data === "object" ? (data as { currency?: unknown; discount?: unknown }) : null;
}

export async function loadMoney(workspaceId: string, now: Date = new Date()): Promise<MoneySummary> {
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 86_400_000);
  const docSelect = {
    id: true,
    title: true,
    clientId: true,
    acceptedAt: true,
    sharedAt: true,
    firstViewedAt: true,
    updatedAt: true,
    metadata: true,
    costLineItems: { select: LINE_SELECT },
    sections: { where: { key: "costing" }, select: { data: true }, take: 1 },
    signatureRequests: { where: { status: "COMPLETED" }, select: { completedAt: true }, orderBy: { completedAt: "asc" }, take: 1 },
  } as const satisfies Prisma.DocumentSelect;

  const [clients, wonRaw, pipelineRaw, fx] = await Promise.all([
    prisma.workspaceClient.findMany({
      where: { workspaceId, hidden: false, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, retainerDays: true, retainerDaysUsed: true },
    }),
    prisma.document.findMany({
      where: {
        workspaceId,
        // An archived document is withdrawn: it's how a recorded deal is taken out.
        archivedAt: null,
        status: { not: "ARCHIVED" },
        costLineItems: { some: {} },
        OR: [
          { acceptedAt: { gte: twoYearsAgo } },
          { signatureRequests: { some: { status: "COMPLETED", completedAt: { gte: twoYearsAgo } } } },
        ],
      },
      select: docSelect,
    }),
    prisma.document.findMany({
      where: {
        workspaceId,
        status: "SENT",
        archivedAt: null,
        acceptedAt: null,
        declinedAt: null,
        costLineItems: { some: {} },
        sharedAt: { gte: new Date(now.getTime() - 120 * 86_400_000) },
        signatureRequests: { none: { status: "COMPLETED" } },
      },
      select: docSelect,
    }),
    loadFxRates("GBP"),
  ]);

  const team = await computeClientFinancials(workspaceId, clients);

  return summariseMoney({
    now,
    fx,
    clients: clients.map((c) => {
      const cost = team.get(c.id)?.monthlyCost ?? null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        team: cost ? { amount: cost.amount, currency: cost.currency, unpricedDevs: cost.unpricedDevs } : null,
        retainerDays: c.retainerDays,
        retainerDaysUsed: c.retainerDaysUsed,
      };
    }),
    won: wonRaw.map((d) => ({
      id: d.id,
      title: d.title,
      clientId: d.clientId,
      wonAt: (d.acceptedAt ?? d.signatureRequests[0]?.completedAt ?? d.updatedAt).toISOString(),
      terms: docTerms(lines(d.costLineItems as RawLine[]), costingOf(d.sections)),
      recorded: Boolean(d.metadata && typeof d.metadata === "object" && "recordedDeal" in d.metadata),
    })),
    pipeline: pipelineRaw.map((d) => ({
      id: d.id,
      title: d.title,
      clientId: d.clientId,
      sharedAt: d.sharedAt?.toISOString() ?? null,
      viewed: Boolean(d.firstViewedAt),
      terms: docTerms(lines(d.costLineItems as RawLine[]), costingOf(d.sections)),
    })),
  });
}
