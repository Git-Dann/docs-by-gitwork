/**
 * GET /api/documents/[id]/versions/[versionId] — fetch a single frozen version snapshot.
 *
 * Returns the full sections + cost + timeline JSON arrays so the client can render the
 * historical doc state side-by-side with the current one.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getDocumentVersion } from "@/server/document-versions";
import { requireDocumentInWorkspace, requireRowOfDocument } from "@/server/documents-scope";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id, versionId } = await context.params;
    await requireDocumentInWorkspace(id, await getEffectiveUserOrNull(request));
    await requireRowOfDocument("version", versionId, id);
    const version = await getDocumentVersion(versionId);
    if (!version) return apiError("Version not found", 404);
    return apiOk({ version });
  } catch (error) {
    return fromError(error);
  }
}
