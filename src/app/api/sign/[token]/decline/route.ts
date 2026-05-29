/**
 * POST /api/sign/[token]/decline
 *
 * Public signer endpoint — signer formally declines to sign. Body: { reason?: string }.
 * Flips both the signer and the parent SignatureRequest to DECLINED.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { declineSignature, findSignerByToken } from "@/server/signatures";
import { notifyDocumentEvent } from "@/server/slack-notify";

interface RouteContext {
  params: Promise<{ token: string }>;
}

const declineSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = declineSchema.parse(await request.json().catch(() => ({})));

    const found = await findSignerByToken(token);
    if (!found) return apiError("Unknown signing link.", 404);
    if (found.gate) return apiError("This signing link is no longer active.", 410);
    if (found.signer.status === "SIGNED") {
      return apiError("You have already signed. Contact Gitwork to amend.", 409);
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const updated = await declineSignature(found.signer.id, body.reason, { ip, userAgent });

    const doc = found.signer.request.document;
    void notifyDocumentEvent({
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      documentTitle: doc.title,
      documentType: doc.documentType,
      kind: "DOC_DECLINED",
      detail: `${found.signer.name} declined${body.reason ? `: ${body.reason.slice(0, 200)}` : ""}`,
    });

    return apiOk({ request: updated });
  } catch (error) {
    return fromError(error);
  }
}
