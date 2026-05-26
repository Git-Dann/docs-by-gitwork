import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { RawIngestItem } from "@/server/care-agents/types";
import type { AgentContext } from "@/server/care-agents/types";

interface GmailScraperConfig {
  query?: string;
  intakeAddress?: string;
}

// Pure fetcher — returns raw items, does NOT write to DB
export async function fetchGmail(ctx: AgentContext): Promise<RawIngestItem[]> {
  const { connection, workspace } = ctx;

  let gmailAuth: Parameters<typeof google.gmail>[0]["auth"];

  if (workspace.googleOAuthRefreshToken) {
    // OAuth path — user connected via "Sign in with Google"
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars not configured");
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: workspace.googleOAuthRefreshToken });
    gmailAuth = oauth2Client as Parameters<typeof google.gmail>[0]["auth"];
  } else if (workspace.googleServiceAccountJson) {
    // Service account fallback — domain-wide delegation
    const credentials = JSON.parse(workspace.googleServiceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    });
    const authClient = await auth.getClient();
    if (workspace.googleSubjectEmail && "subject" in authClient) {
      (authClient as { subject?: string }).subject = workspace.googleSubjectEmail;
    }
    gmailAuth = authClient as Parameters<typeof google.gmail>[0]["auth"];
  } else {
    throw new Error("Gmail not connected — go to Settings → Google Workspace and click Connect Gmail");
  }

  const gmail = google.gmail({ version: "v1", auth: gmailAuth });
  const config = (connection.scraperConfig ?? {}) as GmailScraperConfig;
  const query = config.query ?? (config.intakeAddress ? `to:${config.intakeAddress}` : "");

  const lastSyncedAt = connection.lastSyncedAt;
  const afterSeconds = lastSyncedAt
    ? Math.floor(lastSyncedAt.getTime() / 1000)
    : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

  const fullQuery = [query, `after:${afterSeconds}`].filter(Boolean).join(" ");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: fullQuery,
    maxResults: 100,
  });

  const messageItems = listRes.data.messages ?? [];
  const results: RawIngestItem[] = [];
  const threadsSeen = new Set<string>();

  for (const item of messageItems) {
    if (!item.id || !item.threadId) continue;
    if (threadsSeen.has(item.threadId)) continue;
    threadsSeen.add(item.threadId);

    try {
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
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const from = headers.find((h) => h.name === "From")?.value ?? "unknown";
      const dateStr = headers.find((h) => h.name === "Date")?.value;
      const receivedAt = dateStr ? new Date(dateStr) : new Date();
      const customerLabel = from.replace(/<[^>]+>/, "").trim() || from;

      // Fetch bodies for all messages in thread
      const threadItems: RawIngestItem["threadItems"] = [];
      let rawBody = "";

      for (const msg of threadMessages) {
        if (!msg.id) continue;
        try {
          const msgRes = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
          const body = extractGmailBody(msgRes.data);
          const msgHeaders = msg.payload?.headers ?? [];
          const msgFrom = msgHeaders.find((h) => h.name === "From")?.value ?? "";
          const isOutbound = workspace.googleSubjectEmail
            ? msgFrom.includes(workspace.googleSubjectEmail)
            : false;

          threadItems.push({
            id: msg.id,
            authorLabel: msgFrom.replace(/<[^>]+>/, "").trim() || msgFrom,
            body: body.slice(0, 4000),
            createdAt: msg.internalDate ? new Date(parseInt(msg.internalDate)) : new Date(),
            isOutbound,
          });

          if (!isOutbound) rawBody += body.slice(0, 2000) + "\n\n";
        } catch {
          // skip individual message errors
        }
      }

      results.push({
        externalId: item.threadId,
        customerLabel,
        rawSubject: subject,
        rawBody: rawBody.trim().slice(0, 4000),
        receivedAt,
        threadItems,
      });
    } catch {
      // skip thread errors
    }
  }

  return results;
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
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64(part.body.data);
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

  if (payload.parts) return extractFromParts(payload.parts);
  if (payload.body?.data) return decodeBase64(payload.body.data);
  return "";
}

// Legacy compatibility — keep old function name but delegate to agent orchestrator
export async function syncGmail(ctx: AgentContext): Promise<{ created: number; skipped: number; errors: string[] }> {
  const items = await fetchGmail(ctx);
  await prisma.accountConnection.update({ where: { id: ctx.connection.id }, data: { lastSyncedAt: new Date(), health: "CONNECTED" } });
  return { created: items.length, skipped: 0, errors: [] };
}
