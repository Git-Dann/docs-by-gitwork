/**
 * Linking a second client's delivery work into a wiki.
 *
 * A big workstream often ends up as its own client record — YourGroop's
 * intelligence engine is the case this was built for — while the people reading
 * YourGroop's wiki still need to see it next to the rest.
 *
 * ⚠️ The link is ONE-WAY. Linking Intelligence into YourGroop does not put
 * YourGroop's board into Intelligence's wiki. Both directions would be symmetric
 * and tidy and would also mean anyone holding EITHER client's public share token
 * could read the other's plan, which is not a thing to arrive at by accident.
 */
import { prisma } from "@/lib/prisma";
import {
  type EffectiveUser,
  ForbiddenError,
  NotFoundError,
  assertCan,
} from "@/server/auth/effective-user";
import { canManageClients } from "@/server/auth/effective-user";

export interface WikiLinkDTO {
  id: string;
  linkedClientId: string;
  clientName: string;
  slug: string;
  label: string | null;
  orderKey: number;
}

async function wikiForSlug(workspaceId: string, slug: string) {
  const client = await prisma.workspaceClient.findFirst({
    where: { workspaceId, slug },
    select: { id: true, wiki: { select: { id: true } } },
  });
  if (!client?.wiki) throw new NotFoundError("That client has no wiki.");
  return { clientId: client.id, wikiId: client.wiki.id };
}

export async function listWikiLinks(user: EffectiveUser, slug: string): Promise<WikiLinkDTO[]> {
  const { wikiId } = await wikiForSlug(user.workspaceId, slug);
  const rows = await prisma.clientWikiLink.findMany({
    where: { wikiId },
    orderBy: [{ orderKey: "asc" }, { createdAt: "asc" }],
    include: { linkedClient: { select: { name: true, slug: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    linkedClientId: r.linkedClientId,
    clientName: r.linkedClient.name,
    slug: r.linkedClient.slug,
    label: r.label,
    orderKey: r.orderKey,
  }));
}

export async function addWikiLink(
  user: EffectiveUser,
  slug: string,
  input: { linkedClientId: string; label?: string | null },
): Promise<WikiLinkDTO> {
  assertCan(user, canManageClients, "link a client into a wiki");
  const { clientId, wikiId } = await wikiForSlug(user.workspaceId, slug);

  // ⚠️ A wiki linking ITSELF would double every block, every task and every
  // milestone on its own timeline, and the numbers would look merely wrong rather
  // than obviously broken.
  if (input.linkedClientId === clientId) {
    throw new ForbiddenError("A client can't be linked to its own wiki.");
  }

  const linked = await prisma.workspaceClient.findFirst({
    where: { id: input.linkedClientId, workspaceId: user.workspaceId },
    select: { id: true, name: true, slug: true },
  });
  if (!linked) throw new ForbiddenError("That client isn't in your workspace.");

  const last = await prisma.clientWikiLink.findFirst({
    where: { wikiId },
    orderBy: { orderKey: "desc" },
    select: { orderKey: true },
  });

  const row = await prisma.clientWikiLink.create({
    data: {
      wikiId,
      linkedClientId: linked.id,
      label: input.label?.trim() || null,
      orderKey: (last?.orderKey ?? 0) + 1,
    },
  });
  return {
    id: row.id,
    linkedClientId: linked.id,
    clientName: linked.name,
    slug: linked.slug,
    label: row.label,
    orderKey: row.orderKey,
  };
}

export async function removeWikiLink(user: EffectiveUser, slug: string, id: string): Promise<void> {
  assertCan(user, canManageClients, "unlink a client from a wiki");
  const { wikiId } = await wikiForSlug(user.workspaceId, slug);
  // Scoped by wikiId as well as id: an id alone would let one client's wiki unlink
  // another's.
  const existing = await prisma.clientWikiLink.findFirst({
    where: { id, wikiId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("That link doesn't exist.");
  await prisma.clientWikiLink.delete({ where: { id } });
}
