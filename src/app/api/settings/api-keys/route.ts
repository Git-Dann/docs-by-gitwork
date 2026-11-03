/**
 * Workspace API keys — Settings → Developer (multi-tenant Phase 2). Admins and Super Admins of
 * the caller's own workspace. A key can't be used to mint more keys: create/revoke need a person.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { presentsApiKey } from "@/lib/api-key-token";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { createApiKey, listApiKeys } from "@/server/api-keys";
import { recordAuditEntry } from "@/server/audit-log";

export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string().trim().min(1, "Give the key a name").max(80) }).strict();

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertAtLeastAdmin(user);
    return apiOk({ keys: await listApiKeys(user.workspaceId) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (presentsApiKey(request)) return apiError("API keys are created by a person, not by another key.", 403);
    const user = await requireAuthedUser(request);
    assertAtLeastAdmin(user);
    const { name } = createSchema.parse(await request.json());
    const { key, token } = await createApiKey({ workspaceId: user.workspaceId, createdById: user.id, name });
    recordAuditEntry({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "api_key.created",
      target: `workspaceApiKey.${key.id}`,
      metadata: { name: key.name },
    });
    return apiOk({ key, token }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
