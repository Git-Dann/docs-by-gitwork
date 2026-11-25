/**
 * The clients a person works on, as Dispatch counts them: the clients they can open
 * (respond.ts `loadCandidates`), with their status, so "what clients have I got?" agrees with
 * Portal. Portal lists ACTIVE clients by default, so those are "your clients"; paused and
 * archived ones can still be asked about by name; leads are only for Super Admins (as in
 * Portal's Leads tab), and clients still awaiting review are left out.
 *
 * Dan, 25 Nov 2026: Dispatch said "You have 28 clients" when Portal showed 13; the 28 included
 * leads, paused and archived clients.
 */

import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/types/auth";
import type { EffectiveUser } from "@/server/auth/effective-user";

export interface OwnClientRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** Statuses Dispatch can talk about, for this person. */
export function reachableStatuses(user: Pick<EffectiveUser, "role">): string[] {
  return isSuperAdmin(user.role) ? ["ACTIVE", "INACTIVE", "ARCHIVED", "LEAD"] : ["ACTIVE", "INACTIVE", "ARCHIVED"];
}

export async function ownClients(user: EffectiveUser): Promise<OwnClientRow[]> {
  const { askerScope, loadCandidates } = await import("@/server/dispatch/respond");
  const { clients } = await loadCandidates(user.workspaceId, await askerScope(user));
  if (!clients.length) return [];
  const rows = await prisma.workspaceClient.findMany({
    where: { workspaceId: user.workspaceId, id: { in: clients.map((c) => c.id) } },
    select: { id: true, status: true },
  });
  const statusOf = new Map(rows.map((r) => [r.id, String(r.status)]));
  const allowed = new Set(reachableStatuses(user));
  return clients
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, status: statusOf.get(c.id) ?? "ACTIVE" }))
    .filter((c) => allowed.has(c.status))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The ones Portal shows by default: what "your clients" means in an answer. */
export function activeOnly<T extends { status: string }>(clients: readonly T[]): T[] {
  return clients.filter((c) => c.status === "ACTIVE");
}
