/**
 * POST /api/staff/[id]/documents/link — attach a file already in Google Drive by its link
 * ({ type, title?, link, expiresOn?, visibility? }). HR only; only drive/docs.google.com.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addDocumentLink } from "@/server/hr/documents";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    type: z.string().max(40),
    title: z.string().max(400).nullable().optional(),
    link: z.string().max(2048),
    expiresOn: z.string().max(20).nullable().optional(),
    visibility: z.string().max(20).nullable().optional(),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await addDocumentLink(user, id, schema.parse(await request.json())), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
