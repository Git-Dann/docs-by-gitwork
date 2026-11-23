/**
 * A person's own snoozes and dismissals in the "Needs you" inbox (§151). Rules are pure, in
 * src/lib/needs-you.ts; this only reads and writes the rows.
 *
 * Every read and write is scoped to the caller's own user id AND workspace, so one person can
 * never see or change another's. One row per item is kept here (there is no unique constraint,
 * CLAUDE.md §2): a write updates the newest row for the key and deletes any others.
 */

import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import {
  isValidSnoozeUntil,
  sourceOfKey,
  staleHoldIds,
  type NeedsYouItem,
  type NeedsYouSource,
  type StoredHold,
} from "@/lib/needs-you";

export class NeedsYouStateError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type HoldInput =
  | { itemKey: string; action: "snooze"; fingerprint: string; until: string }
  | { itemKey: string; action: "dismiss"; fingerprint: string }
  | { itemKey: string; action: "clear" };

function mine(user: Pick<EffectiveUser, "id" | "workspaceId">) {
  return { userId: user.id, workspaceId: user.workspaceId };
}

/** The caller's holds, for applying to the items just read. */
export async function readHolds(user: Pick<EffectiveUser, "id" | "workspaceId">): Promise<StoredHold[]> {
  return prisma.needsYouState.findMany({
    where: mine(user),
    select: { id: true, itemKey: true, fingerprint: true, state: true, until: true, updatedAt: true },
    take: 2000,
  });
}

/** Deletes holds that no longer do anything. Best effort: a failure here changes nothing shown. */
export async function pruneHolds(
  user: Pick<EffectiveUser, "id" | "workspaceId">,
  rows: StoredHold[],
  items: Pick<NeedsYouItem, "id" | "fingerprint">[],
  checked: NeedsYouSource[],
  now: Date,
): Promise<void> {
  const ids = staleHoldIds(rows, items, checked, now);
  if (ids.length === 0) return;
  try {
    // Scoped to the caller as well as the ids, so a bad id list can't reach anyone else's rows.
    await prisma.needsYouState.deleteMany({ where: { id: { in: ids }, ...mine(user) } });
  } catch (err) {
    console.error("[needs-you] could not prune old snoozes", err);
  }
}

/** Snooze, dismiss or clear one item for the caller. */
export async function setHold(
  user: Pick<EffectiveUser, "id" | "workspaceId">,
  input: HoldInput,
  now: Date = new Date(),
): Promise<{ itemKey: string; state: "snoozed" | "dismissed" | null; until: string | null }> {
  if (!sourceOfKey(input.itemKey)) throw new NeedsYouStateError("That isn't an item in Needs you.");
  const where = { ...mine(user), itemKey: input.itemKey };

  if (input.action === "clear") {
    await prisma.needsYouState.deleteMany({ where });
    return { itemKey: input.itemKey, state: null, until: null };
  }

  let until: Date | null = null;
  if (input.action === "snooze") {
    until = new Date(input.until);
    if (!isValidSnoozeUntil(until, now)) {
      throw new NeedsYouStateError("A snooze has to end in the future, and within 30 days.");
    }
  }
  const data = {
    fingerprint: input.fingerprint,
    state: input.action === "snooze" ? "snoozed" : "dismissed",
    until,
  };

  const existing = await prisma.needsYouState.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (existing.length === 0) {
    await prisma.needsYouState.create({ data: { ...where, ...data } });
  } else {
    const [keep, ...extra] = existing;
    await prisma.needsYouState.updateMany({ where: { id: keep.id, ...mine(user) }, data });
    if (extra.length > 0) {
      await prisma.needsYouState.deleteMany({ where: { id: { in: extra.map((e) => e.id) }, ...mine(user) } });
    }
  }
  return { itemKey: input.itemKey, state: data.state as "snoozed" | "dismissed", until: until?.toISOString() ?? null };
}
