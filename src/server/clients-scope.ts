/**
 * Finding a Portal client by slug inside the caller's workspace (Phase 2.2b).
 *
 * Slugs are unique per workspace, not globally, so a lookup by slug alone could land in
 * another business. Every `/api/clients/[slug]/**` route resolves its client here.
 */

import { prisma } from "@/lib/prisma";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

/** The client's id in the caller's workspace, or null when there is no such client there. */
export async function clientIdForSlug(slug: string, req: Request): Promise<string | null> {
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: await workspaceIdForRequest(req), slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

function notFound(what: string): Error {
  return Object.assign(new Error(`${what} not found`), { status: 404 });
}

/** The client id for `slug` in the caller's workspace, or a 404. */
export async function requireClientIdForSlug(slug: string, req: Request): Promise<string> {
  const id = await clientIdForSlug(slug, req);
  if (!id) throw notFound("Client");
  return id;
}

export type ClientRowKind = "platform" | "design" | "documentLink" | "intakeItem" | "monitor" | "courseRequest";

const ROW_LABEL: Record<ClientRowKind, string> = {
  platform: "Platform",
  design: "Design",
  documentLink: "Document link",
  intakeItem: "Request",
  monitor: "Monitor",
  courseRequest: "Course request",
};

/**
 * For routes that name a row under a client (`platforms/[platformId]`, `intake-items/[id]`, …):
 * the row must belong to that client, which `requireClientIdForSlug` already placed in the
 * caller's workspace. Otherwise a 404, the same as an id that doesn't exist.
 */
export async function requireRowOfClient(kind: ClientRowKind, rowId: string, clientId: string): Promise<void> {
  const byClient = { id: rowId, clientId };
  const byWiki = { id: rowId, wiki: { clientId } };
  const count =
    kind === "platform"
      ? await prisma.clientPlatform.count({ where: byClient })
      : kind === "design"
        ? await prisma.clientDesign.count({ where: byClient })
        : kind === "documentLink"
          ? await prisma.clientDocumentLink.count({ where: byClient })
          : kind === "intakeItem"
            ? await prisma.clientWikiIntakeItem.count({ where: byWiki })
            : kind === "monitor"
              ? await prisma.wikiMonitor.count({ where: byWiki })
              : await prisma.clientCourseRequest.count({ where: byWiki });
  if (count === 0) throw notFound(ROW_LABEL[kind]);
}
