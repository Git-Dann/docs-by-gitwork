import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { checkClientLinks, type ClientLinks } from "@/server/dispatch/assistant/link-check";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/dispatch/links — every active client's Figma designs and GitHub repositories, and
 * whether Dispatch can open each (§173). Super Admin: it lists every client.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const clients = await prisma.workspaceClient.findMany({
      where: { workspaceId: user.workspaceId, status: "ACTIVE" },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    const results: ClientLinks[] = [];
    // A few at a time: each client is a handful of Figma and GitHub calls.
    for (let i = 0; i < clients.length; i += 4) {
      const batch = await Promise.all(clients.slice(i, i + 4).map((c) => checkClientLinks(user.workspaceId, c.id)));
      for (const r of batch) if (r) results.push(r);
    }
    return apiOk({ clients: results, checkedAt: new Date().toISOString() });
  } catch (err) {
    return fromError(err);
  }
}
