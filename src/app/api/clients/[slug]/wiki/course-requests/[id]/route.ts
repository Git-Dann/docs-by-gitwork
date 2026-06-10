import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateCourseRequest, deleteCourseRequest } from "@/server/wiki";
import { z } from "zod";

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
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const request = await updateCourseRequest(id, body);
    return apiOk(request);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { id } = await params;
    await deleteCourseRequest(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
