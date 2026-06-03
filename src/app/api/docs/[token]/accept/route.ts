/**
 * POST /api/docs/[token]/accept
 *
 * Public, token-gated. The in-page conversion event: a client accepts (or declines) the document
 * straight from /docs/[token]. Flips the document status to ACCEPTED / DECLINED, stamps the
 * timestamp (first action wins), records the actor's name/email/note on metadata.acceptance for
 * the audit trail, and fires the matching Slack alert. This is the signal win-rate is computed
 * from.
 *
 * Not for documents out for e-signature — those convert through /sign/[token]. This is the
 * lightweight "looks good, let's go" path for proposals shared as a web link.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { notifyDocumentEvent } from "@/server/slack-notify";

const acceptSchema = z.object({
  action: z.enum(["accept", "decline"]),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(160).optional(),
  note: z.string().trim().max(2000).optional(),
});

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) return apiError("Bad token", 400);

    const doc = await prisma.document.findFirst({
      where: { shareToken: token, isShared: true, archivedAt: null },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        documentType: true,
        status: true,
        acceptedAt: true,
        declinedAt: true,
        metadata: true,
      },
    });
    if (!doc) return apiError("Not shared", 404);

    const payload = acceptSchema.parse(await request.json());
    const now = new Date();
    const isAccept = payload.action === "accept";

    const metadata = {
      ...((doc.metadata as Record<string, unknown> | null) ?? {}),
      acceptance: {
        action: payload.action,
        name: payload.name ?? null,
        email: payload.email ?? null,
        note: payload.note ?? null,
        at: now.toISOString(),
      },
    };

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: isAccept ? "ACCEPTED" : "DECLINED",
        // First action of each kind wins, so the audit timestamp is stable on re-clicks.
        ...(isAccept ? { acceptedAt: doc.acceptedAt ?? now } : { declinedAt: doc.declinedAt ?? now }),
        metadata: metadata as object,
      },
    });

    const who = payload.name || payload.email || "Client";
    void notifyDocumentEvent({
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      documentTitle: doc.title,
      documentType: doc.documentType,
      kind: isAccept ? "DOC_ACCEPTED" : "DOC_DECLINED",
      detail: `${who} ${isAccept ? "accepted" : "declined"}${payload.note ? ` — “${payload.note.slice(0, 120)}”` : ""}`,
    });

    return apiOk({ ok: true, status: isAccept ? "ACCEPTED" : "DECLINED" });
  } catch (error) {
    return fromError(error);
  }
}
