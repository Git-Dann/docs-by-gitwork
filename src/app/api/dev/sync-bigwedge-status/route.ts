/**
 * POST /api/dev/sync-bigwedge-status — admin-only.
 *
 * Re-fetches all course requests from the Big Wedge API and marks any that
 * have action_taken = true as ADDED in the Foundry tracker.
 *
 * Body (all optional):
 *   { "dryRun": true, "clientSlug": "wedge", "apiToken": "..." }
 *
 * dryRun DEFAULTS TO TRUE — reports how many records would be marked ADDED
 * without writing anything. Re-POST { "dryRun": false } to commit.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { requireAuthedUserOrDefault } from "@/server/auth/effective-user";
import { syncBigWedgeStatus } from "@/server/wiki-bigwedge-sync";
import { isAtLeast } from "@/types/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  clientSlug: z.string().optional(),
  apiToken: z.string().optional(),
});

function isWorkspaceApiKeyCall(req: Request): boolean {
  const apiKey = process.env.API_KEY ?? process.env.NEXT_PUBLIC_API_KEY ?? null;
  if (!apiKey) return false;
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/, "").trim() ?? null;
  return bearer === apiKey;
}

export async function POST(req: Request) {
  try {
    if (!isWorkspaceApiKeyCall(req)) {
      const user = await requireAuthedUserOrDefault(req);
      if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);
    }

    const { dryRun = true, clientSlug = "wedge", apiToken } = bodySchema.parse(
      await req.json().catch(() => ({})),
    );

    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: clientSlug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const result = await syncBigWedgeStatus(client.id, { dryRun, apiToken });
    if ("error" in result) return apiError(result.error, 400);
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
