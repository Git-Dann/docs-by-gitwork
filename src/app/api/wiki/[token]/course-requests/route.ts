/**
 * The client's share page reads its course requests here (the wiki carries only counts), and
 * changes many at once: one write, scoped to this client. Access: src/server/wiki-course-request-access.ts.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteCourseRequests, listAllCourseRequests, setCourseRequestsStatus } from "@/server/wiki";
import { assertCourseRequestRate, resolveCourseRequestAccess } from "@/server/wiki-course-request-access";

type Ctx = { params: Promise<{ token: string }> };

const batchSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(10_000),
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
});

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    await assertCourseRequestRate(req);
    const access = await resolveCourseRequestAccess(req, token);
    if (!access.ok) return apiError(access.message, access.status);
    return apiOk(await listAllCourseRequests(access.clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    await assertCourseRequestRate(req);
    const access = await resolveCourseRequestAccess(req, token);
    if (!access.ok) return apiError(access.message, access.status);
    const body = batchSchema.parse(await req.json());
    if (!body.status) return apiError("status is required", 400);
    return apiOk({ updated: await setCourseRequestsStatus(access.clientId, body.ids, body.status) });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    await assertCourseRequestRate(req);
    const access = await resolveCourseRequestAccess(req, token);
    if (!access.ok) return apiError(access.message, access.status);
    const body = batchSchema.parse(await req.json());
    return apiOk({ deleted: await deleteCourseRequests(access.clientId, body.ids) });
  } catch (err) {
    return fromError(err);
  }
}
