/**
 * Which documents an MCP caller may list or edit.
 *
 * The document type gate (`allowedDocTypesForUser`) already hides proposals and contracts from
 * developers, but nothing limited documents to the caller's CLIENTS: `list_documents` with no
 * client returned every client's handovers, reports and briefs, and `update_document` would edit
 * any of them by id. Every other client-based MCP tool goes through `resolveClient`, which is
 * limited to the clients the caller can see; this brings documents in line with it.
 *
 * The rule:
 *  - Super Admins and `seeAllClients` holders: every document in their workspace.
 *  - Everyone else: documents for a client they're assigned to (ClientAssignment or an open
 *    placement — the same `assignedClientIds` the rest of MCP uses), plus documents with no
 *    client that they own. A client-less document is someone's own internal draft; one owned
 *    by somebody else is not theirs to read.
 */

import type { Prisma } from "@prisma/client";
import { canSeeAllClients, type EffectiveUser } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";

/** The visibility rule as plain data, so it can be tested without a database. */
export function documentScopeFor(
  user: Pick<EffectiveUser, "id" | "workspaceId">,
  allClients: boolean,
  clientIds: readonly string[],
): Prisma.DocumentWhereInput {
  if (allClients) return { workspaceId: user.workspaceId };
  return {
    workspaceId: user.workspaceId,
    OR: [
      { clientId: { in: clientIds.length ? [...clientIds] : ["__none__"] } },
      { clientId: null, ownerId: user.id },
    ],
  };
}

/** Same rule, applied to one document row. */
export function documentInScope(
  doc: { workspaceId: string; clientId: string | null; ownerId: string },
  user: Pick<EffectiveUser, "id" | "workspaceId">,
  allClients: boolean,
  clientIds: readonly string[],
): boolean {
  if (doc.workspaceId !== user.workspaceId) return false;
  if (allClients) return true;
  if (doc.clientId) return clientIds.includes(doc.clientId);
  return doc.ownerId === user.id;
}

export async function documentScopeWhere(user: EffectiveUser): Promise<Prisma.DocumentWhereInput> {
  const all = canSeeAllClients(user);
  return documentScopeFor(user, all, all ? [] : await assignedClientIds(user));
}

export async function canReachDocument(
  user: EffectiveUser,
  doc: { workspaceId: string; clientId: string | null; ownerId: string },
): Promise<boolean> {
  const all = canSeeAllClients(user);
  return documentInScope(doc, user, all, all ? [] : await assignedClientIds(user));
}
