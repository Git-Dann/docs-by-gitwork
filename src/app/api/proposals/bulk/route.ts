/**
 * POST /api/proposals/bulk
 *
 * Bulk action endpoint for the proposal list. Body: { ids: string[], action: "archive" | "unarchive" | "revoke-share" | "delete" }.
 *
 * Returns a per-id result so the UI can surface partial failures without losing the rest.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["archive", "unarchive", "revoke-share", "delete"]),
});

export async function POST(request: NextRequest) {
  try {
    const body = bulkSchema.parse(await request.json());

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const id of body.ids) {
      try {
        if (body.action === "archive") {
          await prisma.document.update({
            where: { id },
            data: { archivedAt: new Date(), status: "ARCHIVED" },
          });
        } else if (body.action === "unarchive") {
          await prisma.document.update({
            where: { id },
            data: { archivedAt: null, status: "DRAFT" },
          });
        } else if (body.action === "revoke-share") {
          await prisma.document.update({
            where: { id },
            data: { isShared: false },
          });
        } else if (body.action === "delete") {
          await prisma.document.delete({ where: { id } });
        }
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: (err as Error).message });
      }
    }

    return apiOk({
      results,
      summary: {
        ok: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
