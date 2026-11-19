/**
 * The team's default dashboard arrangement for a client (Decision E, CLAUDE.md §133).
 *   PUT { layout: { order, sizes, hidden } | null }   — null clears it (back to the code's default)
 *
 * Gated like the Board's settings (`resolveInternalSheets`): 'Manage clients' AND access to this
 * client. There is no client route: the client arranges their own view in their browser only.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { readDefaultLayout } from "@/lib/wiki-dashboard-layout";
import { setWikiDashboardLayout } from "@/server/wiki";
import { resolveInternalSheets } from "@/server/wiki-sheets-access";

const id = z.string().min(1).max(64);
const bodySchema = z
  .object({
    layout: z
      .object({
        order: z.array(id).max(60),
        hidden: z.array(id).max(60),
        sizes: z.record(id, z.union([z.literal(1), z.literal(2), z.literal(3)])),
      })
      .nullable(),
  })
  .strict();

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { clientId } = await resolveInternalSheets(req, slug, "set this client's default dashboard");
    if (!clientId) return apiError("Client not found", 404);
    const { layout } = bodySchema.parse(await req.json());
    const stored = layout ? readDefaultLayout(layout) : null;
    await setWikiDashboardLayout(clientId, stored);
    return apiOk({ layout: stored });
  } catch (err) {
    return fromError(err);
  }
}
