import { NextRequest } from "next/server";
import { REQUEST_MAX_TITLE } from "@/lib/wiki-request-title";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteWikiIntakeItem, updateWikiIntakeItem } from "@/server/wiki";
import { requireClientIdForSlug, requireRowOfClient } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";

const patchSchema = z.object({
  type: z.enum(["BUG", "FEEDBACK", "TASK", "DESIGN"]).optional(),
  title: z.string().trim().min(1).max(REQUEST_MAX_TITLE).optional(),
  description: z.string().trim().max(10_000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["NEW", "TRIAGED", "PROMOTED", "CLOSED"]).optional(),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalRef: z.string().trim().max(180).optional().nullable(),
  label: z.enum(["BACKEND", "FRONTEND", "UI_UX", "RESEARCH", "DESIGN", "SUPPORT"]).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    await assertClientWriter(req, slug);
    await requireRowOfClient("intakeItem", id, await requireClientIdForSlug(slug, req));
    return apiOk(await updateWikiIntakeItem(id, patchSchema.parse(await req.json())));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    await assertClientWriter(req, slug);
    await requireRowOfClient("intakeItem", id, await requireClientIdForSlug(slug, req));
    await deleteWikiIntakeItem(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
