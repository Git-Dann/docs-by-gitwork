/**
 * GET /api/platform/workspaces — one page of businesses on Foundry. Platform admins only.
 * Query: q, page (0-based), pageSize (≤50), sort (name|created|members), dir, modules
 * (any|every|chosen), ai (any|gitwork|own). A bad value is a 400 naming it.
 *
 * POST — create a business and email its owner an invite. Platform admins only.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { parsePlatformWorkspaceQuery } from "@/lib/platform-rules";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { z } from "zod";
import { createPlatformBusiness, listPlatformWorkspaces } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const query = parsePlatformWorkspaceQuery(new URL(request.url).searchParams);
    return apiOk(await listPlatformWorkspaces(query));
  } catch (error) {
    return fromError(error);
  }
}

const createSchema = z
  .object({
    name: z.string().max(200),
    ownerName: z.string().max(200).optional().nullable(),
    ownerEmail: z.string().max(320),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin(request);
    const body = createSchema.parse(await request.json());
    return apiOk(await createPlatformBusiness(actor.id, body), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
