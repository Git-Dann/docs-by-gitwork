/**
 * POST /api/sign/[token]/regenerate
 *
 * Regenerates a single-use accessToken for a signer and resets their firstViewedAt timestamp.
 * Called when launching a new email / mailto link for a signer whose previous link was used.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { findSignerByToken, regenerateSignerToken } from "@/server/signatures";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const found = await findSignerByToken(token);
    if (!found) return apiError("Unknown signing link.", 404);

    const updated = await regenerateSignerToken(found.signer.id);
    return apiOk({ ok: true, newToken: updated.accessToken });
  } catch (error) {
    return fromError(error);
  }
}
