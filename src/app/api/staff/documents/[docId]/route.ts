/**
 * PATCH  /api/staff/documents/[docId] — accept or send back someone's upload
 *        ({ review: "accept" | "reject", note? }) or change its title, expiry or who sees it.
 * DELETE /api/staff/documents/[docId] — delete it and its file; the Drive copy goes to the bin.
 * HR only. Every review and delete is in the HR access log.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteDocument, updateDocument } from "@/server/hr/documents";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    review: z.enum(["accept", "reject"]).optional(),
    note: z.string().max(1000).nullable().optional(),
    title: z.string().max(400).optional(),
    expiresOn: z.string().max(20).nullable().optional(),
    visibility: z.string().max(20).optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { docId } = await params;
    return apiOk(await updateDocument(user, docId, schema.parse(await request.json())));
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { docId } = await params;
    await deleteDocument(user, docId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
