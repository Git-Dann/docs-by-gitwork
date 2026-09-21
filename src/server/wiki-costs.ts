/**
 * Running costs — load and edit a client's cost model.
 *
 * The arithmetic lives in `src/lib/wiki-costs.ts` (pure, unit-tested). This file only
 * fetches and writes; nothing here decides a number.
 *
 * ⚠️ Writes are staff-only, by client slug. There is deliberately **no**
 * `/api/wiki/[token]/costs` route: the client's view is read-only and rides down inside
 * the wiki DTO, exactly as Insights does. A token write route would be dead surface with
 * a live attack surface on a page that states a client's cost base.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CostItem, CostModel } from "@/types/wiki-costs";

/** ⚠️ `as const satisfies` — see CLAUDE.md §50.5. `as const` alone does NOT re-enable
 *  the excess-property check that extracting this const disables. */
const ITEM_INCLUDE = {
  tiers: { orderBy: [{ orderKey: "asc" }, { id: "asc" }] },
} as const satisfies Prisma.WikiCostItemInclude;

const ITEM_ORDER = [
  { orderKey: "asc" },
  { createdAt: "asc" },
] as const satisfies Prisma.WikiCostItemOrderByWithRelationInput[];

type ItemRow = Prisma.WikiCostItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

function serializeItem(row: ItemRow): CostItem {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    kind: row.kind,
    amountMonthly: row.amountMonthly,
    amountAnnual: row.amountAnnual,
    unitLabel: row.unitLabel,
    includedUnits: row.includedUnits,
    unitPrice: row.unitPrice,
    unitsPerUser: row.unitsPerUser,
    tiers: row.tiers.map((t) => ({
      id: t.id,
      upToUsers: t.upToUsers,
      amountMonthly: t.amountMonthly,
      label: t.label,
      orderKey: t.orderKey,
    })),
    notes: row.notes,
    included: row.included,
    orderKey: row.orderKey,
  };
}

const EMPTY: CostModel = {
  enabled: false,
  currency: "GBP",
  headlineUsers: 1000,
  items: [],
  notes: null,
  updatedAt: null,
};

export async function loadWikiCosts(clientId: string): Promise<CostModel> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      costsEnabled: true,
      costsCurrency: true,
      costsHeadlineUsers: true,
      costsNotes: true,
      updatedAt: true,
      costItems: { include: ITEM_INCLUDE, orderBy: ITEM_ORDER },
    },
  });
  if (!wiki) return EMPTY;
  return {
    enabled: wiki.costsEnabled,
    currency: wiki.costsCurrency,
    headlineUsers: wiki.costsHeadlineUsers,
    items: wiki.costItems.map(serializeItem),
    notes: wiki.costsNotes,
    updatedAt: wiki.updatedAt.toISOString(),
  };
}

async function ensureWikiId(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  return wiki.id;
}

export async function setWikiCostsEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, costsEnabled: enabled },
    update: { costsEnabled: enabled },
    select: { id: true },
  });
}

export interface CostSettingsInput {
  currency?: string;
  headlineUsers?: number;
  notes?: string | null;
}

export async function updateWikiCostSettings(
  clientId: string,
  data: CostSettingsInput,
): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: {
      clientId,
      ...(data.currency !== undefined ? { costsCurrency: data.currency } : {}),
      ...(data.headlineUsers !== undefined ? { costsHeadlineUsers: data.headlineUsers } : {}),
      ...(data.notes !== undefined ? { costsNotes: data.notes } : {}),
    },
    update: {
      ...(data.currency !== undefined ? { costsCurrency: data.currency } : {}),
      ...(data.headlineUsers !== undefined ? { costsHeadlineUsers: data.headlineUsers } : {}),
      ...(data.notes !== undefined ? { costsNotes: data.notes } : {}),
    },
    select: { id: true },
  });
}

/** The shape a caller sends for one item. Tiers REPLACE the item's existing bands. */
export interface CostItemInput {
  name: string;
  vendor?: string | null;
  kind: CostItem["kind"];
  amountMonthly?: number | null;
  amountAnnual?: number | null;
  unitLabel?: string | null;
  includedUnits?: number | null;
  unitPrice?: number | null;
  unitsPerUser?: number | null;
  notes?: string | null;
  /** Omitted means committed — a caller that does not know about options is safe. */
  included?: boolean;
  tiers?: Array<{ upToUsers: number | null; amountMonthly: number; label?: string | null }>;
}

function itemData(input: CostItemInput) {
  return {
    name: input.name.trim(),
    vendor: input.vendor?.trim() || null,
    kind: input.kind,
    amountMonthly: input.amountMonthly ?? null,
    amountAnnual: input.amountAnnual ?? null,
    unitLabel: input.unitLabel?.trim() || null,
    includedUnits: input.includedUnits ?? null,
    unitPrice: input.unitPrice ?? null,
    unitsPerUser: input.unitsPerUser ?? null,
    notes: input.notes?.trim() || null,
    included: input.included ?? true,
  };
}

export async function addWikiCostItem(clientId: string, input: CostItemInput): Promise<CostModel> {
  const wikiId = await ensureWikiId(clientId);
  const last = await prisma.wikiCostItem.findFirst({
    where: { wikiId },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });
  await prisma.wikiCostItem.create({
    data: {
      wikiId,
      ...itemData(input),
      orderKey: (last?.orderKey ?? -1) + 1,
      tiers: {
        create: (input.tiers ?? []).map((t, i) => ({
          upToUsers: t.upToUsers,
          amountMonthly: t.amountMonthly,
          label: t.label?.trim() || null,
          orderKey: i,
        })),
      },
    },
    select: { id: true },
  });
  return loadWikiCosts(clientId);
}

export async function updateWikiCostItem(
  clientId: string,
  itemId: string,
  input: CostItemInput,
): Promise<CostModel> {
  // Scoped through the wiki so an id from another client cannot be written.
  const owned = await prisma.wikiCostItem.findFirst({
    where: { id: itemId, wiki: { clientId } },
    select: { id: true },
  });
  if (!owned) throw new Error("Cost item not found");

  // ⚠️ Tiers are REPLACED wholesale rather than diffed — the same contract
  // `replaceBoardContent` uses for insight boards (§48.1). A band's identity is its
  // position in the ladder, so a diff buys nothing and a partial update can leave a
  // ladder with a hole in it.
  await prisma.$transaction([
    prisma.wikiCostTier.deleteMany({ where: { itemId } }),
    prisma.wikiCostItem.update({
      where: { id: itemId },
      data: {
        ...itemData(input),
        tiers: {
          create: (input.tiers ?? []).map((t, i) => ({
            upToUsers: t.upToUsers,
            amountMonthly: t.amountMonthly,
            label: t.label?.trim() || null,
            orderKey: i,
          })),
        },
      },
    }),
  ]);
  return loadWikiCosts(clientId);
}

export async function deleteWikiCostItem(clientId: string, itemId: string): Promise<CostModel> {
  await prisma.wikiCostItem.deleteMany({ where: { id: itemId, wiki: { clientId } } });
  return loadWikiCosts(clientId);
}
