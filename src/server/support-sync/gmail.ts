import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { SyncContext, SyncResult } from "./types";

interface GmailScraperConfig {
  query?: string;
  intakeAddress?: string;
}

export async function syncGmail(ctx: SyncContext): Promise<SyncResult> {
  const { connection, client, workspace } = ctx;
  const result: SyncResult = { created: 0, skipped: 0, errors: [] };

  if (!workspace.googleServiceAccountJson) {
    throw new Error("Google service account not configured in Settings → Integrations");
  }

  const credentials = JSON.parse(workspace.googleServiceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  });

  if (workspace.googleSubjectEmail) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).subject = workspace.googleSubjectEmail;
  }

  const gmail = google.gmail({ version: "v1", auth });
  const config = (connection.scraperConfig ?? {}) as GmailScraperConfig;
  const query = config.query ?? (config.intakeAddress ? `to:${config.intakeAddress}` : "");

  const lastSyncedAt = connection.lastSyncedAt;
  const afterSeconds = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000); // default: last 7 days

  const fullQuery = [query, `after:${afterSeconds}`].filter(Boolean).join(" ");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: fullQuery,
    maxResults: 50,
  });

  const messageItems = listRes.data.messages ?? [];
  const threadsSeen = new Set<string>();

  for (const item of messageItems) {
    if (!item.id || !item.threadId) continue;
    if (threadsSeen.has(item.threadId)) continue;
    threadsSeen.add(item.threadId);

    try {
      // Check if conversation exists for this thread
      const existing = await prisma.supportConversation.findFirst({
        where: { clientId: client.id, externalId: item.threadId },
        include: { messages: { select: { externalId: true } } },
      });

      // Fetch full thread
      const threadRes = await gmail.users.threads.get({
        userId: "me",
        id: item.threadId,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const threadMessages = threadRes.data.messages ?? [];
      if (threadMessages.length === 0) continue;

      const firstMsg = threadMessages[0];
      const headers = firstMsg.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const from =
        headers.find((h) => h.name === "From")?.value ?? "unknown@unknown.com";
      const dateStr = headers.find((h) => h.name === "Date")?.value;
      const receivedAt = dateStr ? new Date(dateStr) : new Date();

      const customerLabel = from.replace(/<[^>]+>/, "").trim() || from;

      let conversationId: string;

      if (!existing) {
        const conv = await prisma.supportConversation.create({
          data: {
            clientId: client.id,
            source: "GMAIL",
            externalId: item.threadId,
            customerLabel,
            subject,
            preview: subject,
            receivedAt,
            unread: true,
            tags: [],
            sentiment: "NEUTRAL",
          },
        });
        conversationId = conv.id;
        result.created++;
      } else {
        conversationId = existing.id;
        result.skipped++;
      }

      // Add any new messages in this thread
      const existingMsgIds = new Set(
        existing?.messages.map((m) => m.externalId).filter(Boolean) ?? [],
      );

      for (const msg of threadMessages) {
        if (!msg.id || existingMsgIds.has(msg.id)) continue;

        // Fetch full message body
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const body = extractGmailBody(msgRes.data);
        const msgHeaders = msg.payload?.headers ?? [];
        const msgFrom = msgHeaders.find((h) => h.name === "From")?.value ?? "";

        const isOutbound = workspace.googleSubjectEmail
          ? msgFrom.includes(workspace.googleSubjectEmail)
          : false;

        await prisma.supportMessage.create({
          data: {
            conversationId,
            externalId: msg.id,
            direction: isOutbound ? "outbound" : "inbound",
            authorLabel: msgFrom.replace(/<[^>]+>/, "").trim() || msgFrom,
            body: body.slice(0, 4000),
            createdAt: msg.internalDate
              ? new Date(parseInt(msg.internalDate))
              : new Date(),
          },
        });
      }
    } catch (err) {
      result.errors.push(
        `Thread ${item.threadId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Update sync cursor
  await prisma.accountConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), health: "CONNECTED" },
  });

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGmailBody(msg: { payload?: any }): string {
  const payload = msg.payload;
  if (!payload) return "";

  function decodeBase64(data: string): string {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function extractFromParts(parts: any[]): string {
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const part of parts) {
      if (part.parts) {
        const found = extractFromParts(part.parts);
        if (found) return found;
      }
    }
    return "";
  }

  if (payload.parts) {
    return extractFromParts(payload.parts);
  }

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  return "";
}
