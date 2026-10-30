/** POST /api/staff/[id]/documents/request — ask someone for a document ({ type, note? }). HR only. */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { requestDocument } from "@/server/hr/documents";

export const dynamic = "force-dynamic";

const schema = z.object({ type: z.string().max(40), note: z.string().max(1000).nullable().optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await requestDocument(user, id, schema.parse(await request.json())), { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
