/**
 * GET  /api/documents/[id]/versions  — list versions, newest first (id, version, changelog, dated)
 * POST /api/documents/[id]/versions  — { version, changelog? } creates a snapshot + bumps Document.version
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { createDocumentVersion, listDocumentVersions } from "@/server/document-versions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createSchema = z.object({
  version: z.string().min(1).max(40),
  changelog: z.string().max(2000).optional(),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const versions = await listDocumentVersions(id);
    return apiOk({ versions });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { user } = await ensureBaseRecords();
    const body = createSchema.parse(await request.json());

    const snapshot = await createDocumentVersion({
      documentId: id,
      version: body.version,
      changelog: body.changelog,
      createdById: user.id,
    });

    return apiOk({ version: snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
