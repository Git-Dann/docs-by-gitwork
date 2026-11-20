/**
 * One course request on the client's share page. It used to check only the link token, and
 * built the whole wiki (5,000+ requests) to find one row; now it asks the same as the rest of
 * the page (src/server/wiki-course-request-access.ts) and checks the row belongs to this client.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { updateCourseRequest, deleteCourseRequest } from "@/server/wiki";
import { assertCourseRequestRate, resolveCourseRequestAccess } from "@/server/wiki-course-request-access";

const patchSchema = z.object({
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
  courseName: z.string().min(1).optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

type Ctx = { params: Promise<{ token: string; id: string }> };

async function ownRow(req: NextRequest, token: string, id: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  await assertCourseRequestRate(req);
  const access = await resolveCourseRequestAccess(req, token);
  if (!access.ok) return access;
  const row = await prisma.clientCourseRequest.findFirst({ where: { id, wikiId: access.wikiId }, select: { id: true } });
  return row ? { ok: true } : { ok: false, status: 404, message: "Not found" };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { token, id } = await params;
    const own = await ownRow(req, token, id);
    if (!own.ok) return apiError(own.message, own.status);
    const body = patchSchema.parse(await req.json());
    return apiOk(await updateCourseRequest(id, body));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { token, id } = await params;
    const own = await ownRow(req, token, id);
    if (!own.ok) return apiError(own.message, own.status);
    await deleteCourseRequest(id);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
