import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { resolvePublicWiki, updateCourseRequest, deleteCourseRequest } from "@/server/wiki";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
  courseName: z.string().min(1).optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

async function resolveWikiByToken(token: string) {
  const resolved = await resolvePublicWiki(token);
  if (!resolved) return null;
  return resolved.wiki;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const wiki = await resolveWikiByToken(token);
    if (!wiki) return apiError("Not found", 404);

    // Verify this request belongs to this wiki
    const belongs = wiki.courseRequests.some((r) => r.id === id);
    if (!belongs) return apiError("Not found", 404);

    const body = patchSchema.parse(await req.json());
    const updated = await updateCourseRequest(id, body);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const wiki = await resolveWikiByToken(token);
    if (!wiki) return apiError("Not found", 404);

    const belongs = wiki.courseRequests.some((r) => r.id === id);
    if (!belongs) return apiError("Not found", 404);

    await deleteCourseRequest(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
