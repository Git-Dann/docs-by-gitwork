/**
 * Which workspace a Docs request may read or write (docs/multi-tenant-roadmap.md, Phase 2.2b).
 *
 * Every Docs route used to find a document or template by `id` alone, so a member of one
 * business could open, edit, share or delete another business's document by guessing its id.
 * Each lookup now carries the caller's workspace, and a row in another workspace reads as
 * "not found" (404), exactly like an id that doesn't exist.
 *
 * The workspace is the one the server already serves the caller (`requireAuthedUser`), not the
 * token's claim, so for Gitwork every row that matched before still matches.
 */

import type { Prisma } from "@prisma/client";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

/**
 * The caller's workspace. A null caller is the workspace API key, which belongs to Gitwork
 * today, so it falls back to Gitwork's workspace exactly as these routes always behaved.
 * Per-workspace API keys (Phase 2) replace this fallback.
 */
export async function docsWorkspaceId(user: Pick<EffectiveUser, "workspaceId"> | null): Promise<string> {
  if (user) return user.workspaceId;
  return (await ensureBaseRecords()).workspace.id;
}

/** Templates a workspace can see: its own, plus Foundry's stock templates (workspaceId null). */
export function templateVisibleWhere(workspaceId: string): Prisma.DocumentTemplateWhereInput {
  return { OR: [{ workspaceId }, { workspaceId: null }] };
}

function notFound(what: string): Error {
  return Object.assign(new Error(`${what} not found`), { status: 404 });
}

/**
 * The guard every `documents/[id]/*` and `proposals/[id]/*` route runs before anything else:
 * the document must be in the caller's workspace, or the request ends as a 404. Throws, so a
 * route's existing `fromError` turns it into the response.
 */
export async function requireDocumentInWorkspace(
  id: string,
  user: Pick<EffectiveUser, "workspaceId"> | null,
): Promise<void> {
  const found = await prisma.document.findFirst({
    where: { id, workspaceId: await docsWorkspaceId(user) },
    select: { id: true },
  });
  if (!found) throw notFound("Document");
}

/**
 * For routes that name a row under the document (`comments/[commentId]`, `versions/[versionId]`,
 * `signature-requests/[requestId]`): the row must belong to that document, or a document of your
 * own could be used as the key to another business's comment or version.
 */
export async function requireRowOfDocument(
  kind: "comment" | "version" | "signatureRequest",
  rowId: string,
  documentId: string,
): Promise<void> {
  const where = { id: rowId, documentId };
  const count =
    kind === "comment"
      ? await prisma.documentComment.count({ where })
      : kind === "version"
        ? await prisma.documentVersion.count({ where })
        : await prisma.signatureRequest.count({ where });
  if (count === 0) throw notFound(kind === "signatureRequest" ? "Signature request" : kind === "comment" ? "Comment" : "Version");
}
