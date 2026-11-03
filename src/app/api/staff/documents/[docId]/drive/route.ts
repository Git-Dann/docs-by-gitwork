/** POST /api/staff/documents/[docId]/drive — retry a failed Google Drive copy. HR only. */

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { retryDriveCopy } from "@/server/hr/documents";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { docId } = await params;
    await retryDriveCopy(user, docId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
