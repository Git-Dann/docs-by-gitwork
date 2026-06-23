/**
 * POST /api/sign/[token]/sign
 *
 * Public signer endpoint — accepts a captured signature for the signer identified by `token`.
 * Token is the authentication primitive; no workspace session required.
 *
 * Body:
 *   {
 *     method: "DRAWN" | "TYPED",
 *     payload: string,                // PNG data URL for DRAWN, the typed string for TYPED
 *     signedName: string,              // Name typed in the consent box (for audit)
 *     fontKey?: string                 // Optional, ignored when method=DRAWN
 *   }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { findSignerByToken, submitSignature } from "@/server/signatures";
import { notifyDocumentEvent } from "@/server/slack-notify";
import { dispatchNotification } from "@/server/notifications";

interface RouteContext {
  params: Promise<{ token: string }>;
}

const signSchema = z.object({
  method: z.enum(["DRAWN", "TYPED"]),
  payload: z.string().min(1).max(500_000), // 500 KB cap on the data URL
  signedName: z.string().min(1).max(200),
  fontKey: z.string().max(64).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = signSchema.parse(await request.json());

    const found = await findSignerByToken(token);
    if (!found) return apiError("Unknown or revoked signing link.", 404);
    if (found.gate) {
      const message =
        found.gate === "EXPIRED"
          ? "This signing link has expired."
          : found.gate === "REVOKED"
            ? "This signing link was revoked."
            : found.gate === "DECLINED"
              ? "This request has been declined."
              : found.gate === "COMPLETED"
                ? "This document has already been completed."
                : "This signing link is not active.";
      return apiError(message, 410);
    }
    if (found.signer.status === "SIGNED") {
      // Idempotent — already signed. Return the current state without writing a new event.
      return apiOk({ signer: found.signer, alreadySigned: true });
    }

    // Capture client IP + UA for the audit log. Next.js headers() is a no-op outside route
    // handlers; here we read from request.headers which works the same in app router.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const updated = await submitSignature(
      {
        signerId: found.signer.id,
        method: body.method,
        payload: body.payload,
        signedName: body.signedName,
        fontKey: body.fontKey,
      },
      { ip, userAgent },
    );

    const doc = found.signer.request.document;
    void notifyDocumentEvent({
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      documentTitle: doc.title,
      documentType: doc.documentType,
      kind: "DOC_SIGNED",
      detail: `${found.signer.name} (${found.signer.role || "signer"}) signed`,
    });
    if (updated.status === "COMPLETED") {
      void notifyDocumentEvent({
        workspaceId: doc.workspaceId,
        documentId: doc.id,
        documentTitle: doc.title,
        documentType: doc.documentType,
        kind: "DOC_COMPLETED",
        detail: `All ${updated.signers.length} signer${updated.signers.length === 1 ? "" : "s"} signed`,
      });
      // In-app bell for the team's doc managers — one notification at the fully-signed moment.
      dispatchNotification({
        event: "docs.signed",
        workspaceId: doc.workspaceId,
        target: { kind: "permission", permission: "docs.manage" },
        title: `"${doc.title}" was fully signed`,
        actionUrl: `/app/docs/${doc.id}`,
        groupKey: `docs.signed:${doc.id}`,
      });
    }

    return apiOk({ request: updated });
  } catch (error) {
    return fromError(error);
  }
}
