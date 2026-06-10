/**
 * POST /api/dev/import-bigwedge-courses — admin-only.
 *
 * Pulls course requests from the Big Wedge Golf backend API
 * (/api/v1/course-requests/, admin JWT reused from the Care analytics connector)
 * into the Wedge wiki's Course Requests tracker.
 *
 * Body (all optional):
 *   { "dryRun": true, "since": "2026-06-01", "clientSlug": "wedge" }
 *
 * dryRun DEFAULTS TO TRUE — returns counts + a raw API sample + how it maps,
 * writing nothing. Re-POST { "dryRun": false } to commit. Idempotent (de-duped
 * by externalRef + course name). since defaults to 2026-06-01.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { importBigWedgeCourseRequests } from "@/server/wiki-bigwedge-import";
import { isAtLeast } from "@/types/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clientSlug: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    const { dryRun = true, since = "2026-06-01", clientSlug = "wedge" } = bodySchema.parse(
      await req.json().catch(() => ({})),
    );

    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: clientSlug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const result = await importBigWedgeCourseRequests(client.id, { since, dryRun });
    if ("error" in result) return apiError(result.error, 400);
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
