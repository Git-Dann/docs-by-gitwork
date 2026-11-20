import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { addCourseRequest, deleteCourseRequests, listAllCourseRequests, setCourseRequestsStatus } from "@/server/wiki";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { workspaceIdForRequest } from "@/server/workspaces/scope";
import { assertClientWriter } from "@/server/client-write-access";
import { requireClientIdForSlug } from "@/server/clients-scope";

const bodySchema = z.object({
  courseName: z.string().min(1),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
});

/** The wiki's course requests, for the Course Requests section (the wiki itself leaves them out). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    return apiOk(await listAllCourseRequests(await requireClientIdForSlug(slug, req)));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const workspaceId = await workspaceIdForRequest(req);
    const client = await prisma.workspaceClient.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!client) return apiError("Client not found", 404);

    const body = bodySchema.parse(await req.json());
    const request = await addCourseRequest(client.id, body);
    return apiOk(request);
  } catch (err) {
    return fromError(err);
  }
}

const batchSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(10_000),
  status: z.enum(["NEW", "SENT", "ADDED", "REJECTED"]).optional(),
});


/** PATCH { ids, status }: set many requests' status in one write. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await requireClientIdForSlug(slug, req);
    const body = batchSchema.parse(await req.json());
    if (!body.status) return apiError("status is required", 400);
    return apiOk({ updated: await setCourseRequestsStatus(clientId, body.ids, body.status) });
  } catch (err) {
    return fromError(err);
  }
}

/** DELETE { ids }: delete many requests in one write. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    await assertClientWriter(req, slug);
    const clientId = await requireClientIdForSlug(slug, req);
    const body = batchSchema.parse(await req.json());
    return apiOk({ deleted: await deleteCourseRequests(clientId, body.ids) });
  } catch (err) {
    return fromError(err);
  }
}
