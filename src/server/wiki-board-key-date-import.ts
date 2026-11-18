/**
 * Importing a client's planning-tool calendar (Big Wedge's Forge "companyDates") as key dates on
 * their Board Schedule. Kept apart from src/server/wiki-board-key-dates.ts (the add/edit/delete
 * writes) so the plan import doesn't pull in the whole Board module. CLAUDE.md §128.
 */

import type { Prisma } from "@prisma/client";
import { planKeyDateImport, type KeyDateImportPlan } from "@/lib/wiki-board-key-dates";
import type { ForgeKeyDate } from "@/lib/forge-import/feed";

/** A YYYY-MM-DD as the @db.Date the column stores. */
function dateValue(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

type KeyDateDb = Pick<Prisma.TransactionClient, "wikiBoardKeyDate">;

/** What importing these planning-tool dates would do on this client. Writes nothing. */
export async function planForgeKeyDates(
  db: KeyDateDb,
  clientId: string,
  dates: readonly ForgeKeyDate[],
): Promise<KeyDateImportPlan> {
  // Every ref already used on this client, deleted ones included.
  const known = await db.wikiBoardKeyDate.findMany({
    where: { clientId, externalRef: { not: null } },
    select: { externalRef: true },
  });
  return planKeyDateImport(dates, new Set(known.map((k) => k.externalRef!)));
}

/**
 * Create the planning tool's dates that aren't on this client yet. Idempotent: each carries
 * `externalRef` "forge-date:<id>", and a ref already used (even on a deleted date) is skipped.
 * Called inside the Forge import's transaction, and by the one-off backfill route.
 */
export async function syncForgeKeyDates(
  db: KeyDateDb,
  workspaceId: string,
  clientId: string,
  dates: readonly ForgeKeyDate[],
): Promise<KeyDateImportPlan & { created: number }> {
  const plan = await planForgeKeyDates(db, clientId, dates);
  if (plan.create.length) {
    await db.wikiBoardKeyDate.createMany({
      data: plan.create.map((d) => ({
        workspaceId,
        clientId,
        title: d.title,
        date: dateValue(d.date),
        externalRef: d.externalRef,
        createdByName: "Imported from the planning tool",
      })),
    });
  }
  return { ...plan, created: plan.create.length };
}
