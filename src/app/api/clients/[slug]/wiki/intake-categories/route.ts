import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { requireAuthedUser, assertCan, canManageClients } from "@/server/auth/effective-user";
import { setWikiIntakeCategories } from "@/server/wiki";
import { MAX_CATEGORY_LABEL, MAX_INTAKE_CATEGORIES } from "@/lib/wiki-intake-categories";

/**
 * The client's own Requests categories. Staff-only: a client PICKS from this
 * list on their wiki, but editing it decides what reaches the dev board, so it
 * stays on the internal (session-authed) route rather than the public token one.
 */
const bodySchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.string().trim().max(64).optional(),
        label: z.string().trim().min(1).max(MAX_CATEGORY_LABEL),
        mapsTo: z.enum(["BUG", "FEEDBACK", "TASK", "DESIGN"]),
      }),
    )
    .max(MAX_INTAKE_CATEGORIES),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    assertCan(user, canManageClients, "change this client's request categories");
    const { slug } = await params;
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);
    const { categories } = bodySchema.parse(await req.json());
    return apiOk({ categories: await setWikiIntakeCategories(client.id, categories) });
  } catch (err) {
    return fromError(err);
  }
}
