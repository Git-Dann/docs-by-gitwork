import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-response";

// Public endpoint — authenticated by the per-connection webhookToken in scraperConfig.
// No API_KEY header required; the token in the URL is the secret.

interface WebhookPayload {
  externalId?: string;
  customerLabel?: string;
  subject?: string;
  body: string;
  receivedAt?: string;
  tags?: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // O(1) lookup by webhookToken stored inside scraperConfig JSON.
  // Handles both plaintext and enc:-prefixed tokens (enc: prefix is tried second).
  const plainConn = await prisma.accountConnection.findFirst({
    where: {
      source: "WEBHOOK",
      scraperConfig: { path: ["webhookToken"], equals: token },
    },
    include: { client: { select: { id: true } } },
  });

  // If no plaintext match, check encrypted tokens (enc: prefix).
  const { decryptScraperConfig } = await import("@/server/support");
  const conn = plainConn ?? await (async () => {
    const candidates = await prisma.accountConnection.findMany({
      where: { source: "WEBHOOK", scraperConfig: { path: ["webhookToken"], string_starts_with: "enc:" } },
      include: { client: { select: { id: true } } },
    });
    return candidates.find((c) => {
      const cfg = decryptScraperConfig(c.scraperConfig as Record<string, unknown> | null);
      return cfg?.webhookToken === token;
    }) ?? null;
  })();

  if (!conn) {
    return apiError("Invalid webhook token", 404);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json() as WebhookPayload;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const body = payload.body?.trim();
  if (!body) return apiError("body is required", 400);

  const now = new Date();
  const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : now;
  const externalId = payload.externalId?.trim() || `webhook:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const subject = payload.subject?.trim() || "Webhook message";
  const customerLabel = payload.customerLabel?.trim() || "anonymous";
  const tags = ["webhook", ...(payload.tags ?? [])];

  // Upsert conversation.
  let conv = await prisma.supportConversation.findFirst({
    where: { clientId: conn.client.id, source: "WEBHOOK", externalId },
  });

  if (!conv) {
    conv = await prisma.supportConversation.create({
      data: {
        clientId: conn.client.id,
        source: "WEBHOOK",
        externalId,
        customerLabel,
        subject,
        preview: body.slice(0, 150),
        receivedAt,
        unread: true,
        tags,
      },
    });
  }

  // Upsert message (idempotent on re-delivery).
  const msgExternalId = `${externalId}:msg`;
  const already = await prisma.supportMessage.findFirst({
    where: { conversationId: conv.id, externalId: msgExternalId },
    select: { id: true },
  });

  if (!already) {
    await prisma.supportMessage.create({
      data: {
        conversationId: conv.id,
        direction: "inbound",
        authorLabel: customerLabel,
        body: body.slice(0, 4000),
        externalId: msgExternalId,
        createdAt: receivedAt,
      },
    });

    await prisma.supportConversation.update({
      where: { id: conv.id },
      data: { unread: true, preview: body.slice(0, 150) },
    });

    await prisma.accountConnection.update({
      where: { id: conn.id },
      data: { lastSyncedAt: now },
    });
  }

  return NextResponse.json({ ok: true, conversationId: conv.id });
}
