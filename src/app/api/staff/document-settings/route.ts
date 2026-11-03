/**
 * GET   /api/staff/document-settings — this business's HR document settings.
 * PATCH /api/staff/document-settings — { selfUploadTypes, driveEnabled }. HR only.
 * Off by default: HR adds documents, and nothing is copied to Drive until it's turned on.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getDocumentSettings, updateDocumentSettings } from "@/server/hr/documents";

export const dynamic = "force-dynamic";

const schema = z.object({ selfUploadTypes: z.array(z.string().max(40)).max(20), driveEnabled: z.boolean() }).strict();

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await getDocumentSettings(user));
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    return apiOk(await updateDocumentSettings(user, schema.parse(await request.json())));
  } catch (error) {
    return fromError(error);
  }
}
