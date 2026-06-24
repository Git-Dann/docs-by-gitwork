import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { ChannelAdapter, SyncResult, SyncContext, FilterReasons } from "./types";
import { normalizeKeywords, lookbackSeconds, extractGmailBodyText } from "./shared";

/**
 * Gmail uses the `run()` escape hatch: it owns its domain-wide-delegation auth and
 * thread-walk, writing conversations/messages directly. (Migrating it onto the shared
 * ingest core is a small follow-up — its read path maps cleanly to RawConversationItem.)
 */
async function runGmail(ctx: SyncContext): Promise<SyncResult> {
  const { workspace, connection, client } = ctx;

  if (!workspace.googleServiceAccountJson) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: ["Google service account not configured — paste the JSON in Settings → Google Workspace"] };
  }

  const config = (connection.scraperConfig ?? {}) as {
    query?: string;
    intakeAddress?: string;
    impersonateEmail?: string;
    keywords?: string[];
    excludeKeywords?: string[];
    lookbackDays?: number;
  };

  const impersonateEmail = config.impersonateEmail ?? workspace.googleSubjectEmail ?? null;
  if (!impersonateEmail) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: ["No inbox configured — set 'Inbox to read' on this Gmail connector"] };
  }

  let gmail: ReturnType<typeof google.gmail>;
  try {
    const credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      clientOptions: { subject: impersonateEmail },
    });
    const gmailAuth = (await auth.getClient()) as Parameters<typeof google.gmail>[0]["auth"];
    gmail = google.gmail({ version: "v1", auth: gmailAuth });
  } catch (err) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: [`Gmail auth failed: ${err instanceof Error ? err.message : String(err)}`] };
  }

  // Query is fully optional — leave blank to pull all mail since last sync.
  const queryBase = config.query?.trim() ?? "";
  const lastSyncedAt = connection.lastSyncedAt;
  // Subtract 10 min so incremental syncs overlap with the previous run — catches emails
  // that arrived just before the last sync completed. Upsert by externalId prevents duplicates.
  const afterSeconds = lastSyncedAt
    ? Math.floor((lastSyncedAt.getTime() - 10 * 60 * 1000) / 1000)
    : lookbackSeconds(config.lookbackDays, 30);

  // Include keywords flag/tag only; exclude keywords go into the API query for efficiency.
  const include = normalizeKeywords(config.keywords);
  const exclude = normalizeKeywords(config.excludeKeywords);
  const excludeClause = exclude.map((k) => `-"${k}"`).join(" ");
  const fullQuery = [queryBase, excludeClause, `after:${afterSeconds}`].filter(Boolean).join(" ");

  let ingested = 0;
  let filtered = 0;
  const reasons: FilterReasons = { duplicate: 0 };
  const errors: string[] = [];
  const newConversationIds: string[] = [];

  try {
    // Paginate through all matching messages (100/page, cap 500) so a busy inbox with many
    // non-support emails can't push support emails off the first page.
    const MAX_THREADS = 500;
    const allMessageItems: Array<{ id?: string | null; threadId?: string | null }> = [];
    let pageToken: string | undefined;
    do {
      const page = await gmail.users.messages.list({ userId: "me", q: fullQuery, maxResults: 100, pageToken });
      allMessageItems.push(...(page.data.messages ?? []));
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken && allMessageItems.length < MAX_THREADS);

    const fetched = allMessageItems.length;
    const threadsSeen = new Set<string>();

    for (const item of allMessageItems) {
      if (!item.id || !item.threadId) continue;
      if (threadsSeen.has(item.threadId)) { filtered++; reasons.duplicate = (reasons.duplicate ?? 0) + 1; continue; }
      threadsSeen.add(item.threadId);

      try {
        const threadRes = await gmail.users.threads.get({
          userId: "me",
          id: item.threadId,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });
        const threadMessages = threadRes.data.messages ?? [];
        if (threadMessages.length === 0) { filtered++; continue; }

        const firstMsg = threadMessages[0];
        const hdrs = firstMsg.payload?.headers ?? [];
        const subject = hdrs.find((h) => h.name === "Subject")?.value ?? "(no subject)";
        const from = hdrs.find((h) => h.name === "From")?.value ?? "unknown";
        const dateStr = hdrs.find((h) => h.name === "Date")?.value;
        const receivedAt = dateStr ? new Date(dateStr) : new Date();
        const customerLabel = from.replace(/<[^>]+>/g, "").trim() || from;

        let conv = await prisma.supportConversation.findFirst({
          where: { clientId: client.id, source: "GMAIL", externalId: item.threadId },
        });

        if (!conv) {
          const subjectLower = subject.toLowerCase();
          const matchedKws = include.filter((kw) => subjectLower.includes(kw.toLowerCase()));
          const gmailTags = ["gmail", ...matchedKws.map((k) => `kw:${k}`)];

          conv = await prisma.supportConversation.create({
            data: {
              clientId: client.id,
              source: "GMAIL",
              externalId: item.threadId,
              customerLabel,
              subject,
              preview: subject,
              receivedAt,
              unread: true,
              tags: gmailTags,
              // "Open in Gmail" → the thread in the impersonated mailbox's web UI.
              externalUrl: `https://mail.google.com/mail/u/0/#all/${item.threadId}`,
            },
          });
          newConversationIds.push(conv.id);
          ingested++;
        } else {
          filtered++;
          reasons.duplicate = (reasons.duplicate ?? 0) + 1;
        }

        for (const msg of threadMessages) {
          if (!msg.id) continue;
          const already = await prisma.supportMessage.findFirst({
            where: { conversationId: conv.id, externalId: msg.id },
            select: { id: true },
          });
          if (already) continue;

          try {
            const msgRes = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
            const body = extractGmailBodyText(msgRes.data);
            if (!body.trim()) continue;

            const msgHdrs = (msg.payload?.headers ?? []) as Array<{ name?: string | null; value?: string | null }>;
            const msgFrom = msgHdrs.find((h) => h.name === "From")?.value ?? "";
            const isOutbound = impersonateEmail ? msgFrom.includes(impersonateEmail) : false;

            await prisma.supportMessage.create({
              data: {
                conversationId: conv.id,
                direction: isOutbound ? "outbound" : "inbound",
                authorLabel: msgFrom.replace(/<[^>]+>/g, "").trim() || msgFrom,
                body: body.slice(0, 4000),
                externalId: msg.id,
                createdAt: msg.internalDate ? new Date(parseInt(msg.internalDate)) : receivedAt,
              },
            });
          } catch {
            // skip individual message errors
          }
        }
      } catch (err) {
        errors.push(`Thread ${item.threadId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await prisma.accountConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    return { fetched, ingested, filtered, filterReasons: reasons, errors, newConversationIds };
  } catch (err) {
    return { fetched: 0, ingested: 0, filtered: 0, errors: [`Gmail sync failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

export const gmailAdapter: ChannelAdapter = {
  key: "GMAIL",
  run: runGmail,
};

// Plaintext stub written by the old parser bug — these stored bodies need repairing.
const STUB_BODY = /please view this email in html/i;

export interface GmailBackfillResult {
  connectionId: string;
  impersonateEmail: string;
  conversations: number;
  messagesScanned: number;
  messagesUpdated: number;
  dryRun: boolean;
  samples: { conversationId: string; subject: string; after: string }[];
  errors: string[];
}

/**
 * One-off repair: re-fetch GMAIL messages whose stored body is the "view in HTML"
 * stub (the old extractGmailBodyText bug) and rewrite them with the fixed parser,
 * which now reads the HTML alternative. Idempotent — only touches stub bodies, so
 * re-running is a no-op once repaired. dryRun (default) reports without writing.
 */
export async function backfillGmailBodies(opts: {
  connectionId: string;
  dryRun?: boolean;
}): Promise<GmailBackfillResult> {
  const { connectionId, dryRun = true } = opts;
  const errors: string[] = [];
  const samples: { conversationId: string; subject: string; after: string }[] = [];

  const connection = await prisma.accountConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, source: true, scraperConfig: true, client: { select: { id: true, workspaceId: true } } },
  });
  if (!connection) throw new Error("Connection not found");
  if (connection.source !== "GMAIL") throw new Error(`Connection ${connectionId} is ${connection.source}, not GMAIL`);

  const workspace = await prisma.workspace.findUnique({
    where: { id: connection.client.workspaceId },
    select: { googleServiceAccountJson: true, googleSubjectEmail: true },
  });
  if (!workspace?.googleServiceAccountJson) throw new Error("Google service account not configured");

  const config = (connection.scraperConfig ?? {}) as { impersonateEmail?: string };
  const impersonateEmail = config.impersonateEmail ?? workspace.googleSubjectEmail ?? "";
  if (!impersonateEmail) throw new Error("No inbox configured on this Gmail connector");

  const credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    clientOptions: { subject: impersonateEmail },
  });
  const gmailAuth = (await auth.getClient()) as Parameters<typeof google.gmail>[0]["auth"];
  const gmail = google.gmail({ version: "v1", auth: gmailAuth });

  const convos = await prisma.supportConversation.findMany({
    where: { clientId: connection.client.id, source: "GMAIL" },
    select: {
      id: true,
      subject: true,
      messages: { select: { id: true, externalId: true, body: true }, orderBy: { createdAt: "asc" } },
    },
  });

  let messagesScanned = 0;
  let messagesUpdated = 0;

  for (const c of convos) {
    for (const m of c.messages) {
      // Only repair the broken stub bodies — leave correctly-parsed messages alone.
      if (!m.externalId || !STUB_BODY.test(m.body)) continue;
      messagesScanned++;
      try {
        const res = await gmail.users.messages.get({ userId: "me", id: m.externalId, format: "full" });
        const fixed = extractGmailBodyText(res.data).slice(0, 4000).trim();
        if (!fixed || STUB_BODY.test(fixed)) continue;
        if (!dryRun) {
          await prisma.supportMessage.update({ where: { id: m.id }, data: { body: fixed } });
        }
        messagesUpdated++;
        if (samples.length < 8) samples.push({ conversationId: c.id, subject: c.subject, after: fixed.slice(0, 200) });
      } catch (err) {
        errors.push(`msg ${m.externalId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    connectionId,
    impersonateEmail,
    conversations: convos.length,
    messagesScanned,
    messagesUpdated,
    dryRun,
    samples,
    errors,
  };
}
