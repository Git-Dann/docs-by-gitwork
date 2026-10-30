/**
 * GET /api/staff/documents/[docId]/file — download one document. Always an attachment,
 * with nosniff and a sandboxing CSP (the Launchpad response). A download by anyone but the
 * person is written to the HR access log.
 */

import { fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { openDocument } from "@/server/hr/documents";
import { launchpadFileResponse } from "@/server/launchpad-files-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { docId } = await params;
    return launchpadFileResponse(await openDocument(user, docId));
  } catch (error) {
    return fromError(error);
  }
}
