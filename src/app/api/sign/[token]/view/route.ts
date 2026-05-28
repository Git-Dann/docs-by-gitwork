/**
 * POST /api/sign/[token]/view
 *
 * Records a SIGNER_VIEWED audit event. Called once per signing-page load. Idempotent for
 * subsequent loads (we keep `firstViewedAt` stable but always append the event row).
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { findSignerByToken, recordSignerView } from "@/server/signatures";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const found = await findSignerByToken(token);
    if (!found) return apiError("Unknown signing link.", 404);
    if (found.gate) return apiOk({ ignored: true, gate: found.gate });

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    await recordSignerView(found.signer.id, { ip, userAgent });
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
