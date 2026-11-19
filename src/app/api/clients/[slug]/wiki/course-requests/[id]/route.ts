import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateCourseRequest, deleteCourseRequest } from "@/server/wiki";
import { requireClientIdForSlug, requireRowOfClient } from "@/server/clients-scope";
import { z } from "zod";
import { assertClientWriter } from "@/server/client-write-access";

const patchSchema = z.object({
  courseName: z.string().min(1).optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    await assertClientWriter(req, slug);
    await requireRowOfClient("courseRequest", id, await requireClientIdForSlug(slug, req));
    const body = patchSchema.parse(await req.json());
    const request = await updateCourseRequest(id, body);
    return apiOk(request);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    await assertClientWriter(req, slug);
    await requireRowOfClient("courseRequest", id, await requireClientIdForSlug(slug, req));
    await deleteCourseRequest(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
