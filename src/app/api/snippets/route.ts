/**
 * GET  /api/snippets   — list the workspace's saved content snippets
 * POST /api/snippets    — save a section as a reusable snippet (gated by docs.manage)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { createSnippet, listSnippets } from "@/server/snippets";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sectionKey: z.string().trim().min(1).max(80),
  data: z.unknown(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const workspaceId = user?.workspaceId ?? (await ensureBaseRecords()).workspace.id;
    return apiOk({ snippets: await listSnippets(workspaceId) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDocs, "save snippets");
    const workspaceId = user?.workspaceId ?? (await ensureBaseRecords()).workspace.id;
    const body = createSchema.parse(await request.json());
    if (body.data === undefined) return apiError("Snippet data is required.", 400);
    const snippet = await createSnippet({
      workspaceId,
      name: body.name,
      sectionKey: body.sectionKey,
      data: body.data,
      createdById: user?.id ?? null,
    });
    return apiOk({ snippet }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
