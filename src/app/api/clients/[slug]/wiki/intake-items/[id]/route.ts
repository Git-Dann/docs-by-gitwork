import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteWikiIntakeItem, updateWikiIntakeItem } from "@/server/wiki";

const patchSchema = z.object({
  type: z.enum(["BUG", "FEEDBACK", "TASK"]).optional(),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(10_000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["NEW", "TRIAGED", "PROMOTED", "CLOSED"]).optional(),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalRef: z.string().trim().max(180).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { id } = await params;
    return apiOk(await updateWikiIntakeItem(id, patchSchema.parse(await req.json())));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { id } = await params;
    await deleteWikiIntakeItem(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
