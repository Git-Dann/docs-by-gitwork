/**
 * Which clients a person is on, for Staff (docs/hr-platform.md).
 *
 * Two ways onto a client, and both count:
 *   - **placed on it** in Code (an open `Placement`), which is how a developer is on a project;
 *   - **on its product team** (`WorkspaceClient.productTeamUserIds`, the Gitwork leads in the
 *     client's wiki header), which is how product and account leads are on one. Without
 *     this, the people running a client's project read "No clients".
 *
 * Only ACTIVE clients count: a lead, a paused client or an archived one is not a project
 * someone is on today. `ClientAssignment` is deliberately not read: it grants a restricted
 * developer access to see a client, which is not the same as being on its project.
 */

import { prisma } from "@/lib/prisma";

export interface StaffClient {
  name: string;
  slug: string | null;
}

/** One list per person, de-duplicated (by slug, else name) and sorted by name. */
export function mergeStaffClients(...lists: StaffClient[][]): StaffClient[] {
  const seen = new Map<string, StaffClient>();
  for (const list of lists) {
    for (const c of list) {
      const key = c.slug ?? `name:${c.name.trim().toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, c);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** userId → the ACTIVE clients whose product team they're on. */
export async function productTeamClientsByUser(workspaceId: string, userIds?: string[]): Promise<Map<string, StaffClient[]>> {
  const out = new Map<string, StaffClient[]>();
  if (userIds && !userIds.length) return out;
  const clients = await prisma.workspaceClient.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      productTeamUserIds: userIds ? { hasSome: userIds } : { isEmpty: false },
    },
    select: { name: true, slug: true, productTeamUserIds: true },
  });
  for (const c of clients) {
    for (const id of c.productTeamUserIds) {
      if (userIds && !userIds.includes(id)) continue;
      const list = out.get(id) ?? [];
      list.push({ name: c.name, slug: c.slug });
      out.set(id, list);
    }
  }
  return out;
}
