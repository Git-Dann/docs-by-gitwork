import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { purgeClientRecord } from "@/server/clients";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const bodySchema = z.object({ confirmName: z.string().trim().min(1) });

/**
 * DELETE /api/clients/{slug}/permanent — { confirmName } — PERMANENTLY delete an already-deleted
 * client and everything that belongs to it. Irreversible, so: Super Admin only, a real signed-in
 * identity (never an API key, so the audit log names a person), only for a client that is already
 * in Deleted, and the name typed back to confirm.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuthedUser(request);
    assertSuperAdmin(user);
    const { slug } = await context.params;
    const { confirmName } = bodySchema.parse(await request.json());
    const result = await purgeClientRecord(slug, confirmName, user);
    if (result === "not_found") return apiError("No deleted client by that name — delete it first", 404);
    if (result === "name_mismatch") return apiError("The name you typed doesn't match this client", 400);
    return apiOk({ purged: true });
  } catch (error) {
    return fromError(error);
  }
}
