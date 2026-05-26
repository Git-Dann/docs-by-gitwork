import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { fetchGmail } from "@/server/support-sync/gmail";
import { fetchDiscord } from "@/server/support-sync/discord";
import { fetchReddit } from "@/server/support-sync/reddit";
import { fetchYouTube } from "@/server/support-sync/youtube";
import { runIngestAgent } from "./ingest-agent";
import { triageConversation } from "./triage-agent";
import { generateDraftReply } from "./draft-agent";
import type { AgentContext, AgentRunResult, RawIngestItem } from "./types";
import type {
  ConversationSentiment as PrismaSentiment,
  SupportSource,
  SupportTicketPriority,
} from "@prisma/client";

export type { AgentContext, AgentRunResult };

// ─── Context builder ──────────────────────────────────────────────────────────

export async function buildAgentContext(connId: string): Promise<AgentContext> {
  const connection = await prisma.accountConnection.findUniqueOrThrow({
    where: { id: connId },
    include: {
      channelTokens: true,
      client: { select: { id: true, name: true, slug: true } },
    },
  });

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: {
      googleServiceAccountJson: true,
      googleSubjectEmail: true,
      googleOAuthRefreshToken: true,
      aiProvider: true,
      anthropicApiKey: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });

  return {
    connection,
    client: connection.client,
    workspace,
  };
}

// ─── Raw fetch dispatcher ─────────────────────────────────────────────────────

async function fetchRaw(ctx: AgentContext): Promise<RawIngestItem[]> {
  switch (ctx.connection.source) {
    case "GMAIL":
      return fetchGmail(ctx);
    case "DISCORD":
      return fetchDiscord(ctx);
    case "REDDIT":
      return fetchReddit(ctx);
    case "YOUTUBE":
      return fetchYouTube(ctx);
    case "INSTAGRAM":
      throw new Error("Instagram integration coming soon");
    case "CLICKUP":
      throw new Error("ClickUp integration coming soon");
    case "STRIPE":
      throw new Error("Stripe uses webhooks — configure at /api/webhooks/stripe");
    default:
      throw new Error(`Unknown source: ${ctx.connection.source}`);
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runCareAgents(ctx: AgentContext): Promise<AgentRunResult> {
  const result: AgentRunResult = {
    fetched: 0,
    ingested: 0,
    filtered: 0,
    ticketsCreated: 0,
    draftsGenerated: 0,
    errors: [],
  };

  try {
    // 1. Fetch raw data from source
    const rawItems = await fetchRaw(ctx);
    result.fetched = rawItems.length;

    if (rawItems.length === 0) {
      await markSynced(ctx.connection.id);
      return result;
    }

    // 2. AI ingest agent: filter + classify
    const ingested = await runIngestAgent(ctx, rawItems);
    result.ingested = ingested.length;
    result.filtered = rawItems.length - ingested.length;

    // 3. Create conversations + messages in DB
    const newConversationIds: string[] = [];

    for (const item of ingested) {
      try {
        const existing = await prisma.supportConversation.findFirst({
          where: { clientId: ctx.client.id, externalId: item.externalId },
        });

        if (existing) continue;

        const sentimentMap: Record<string, PrismaSentiment> = {
          positive: "POSITIVE",
          neutral: "NEUTRAL",
          negative: "NEGATIVE",
        };

        const conv = await prisma.supportConversation.create({
          data: {
            clientId: ctx.client.id,
            source: ctx.connection.source as SupportSource,
            externalId: item.externalId,
            customerLabel: item.customerLabel,
            subject: item.subject,
            preview: item.preview,
            receivedAt: item.receivedAt,
            unread: true,
            tags: [item.issueType],
            sentiment: sentimentMap[item.sentiment] ?? "NEUTRAL",
          },
        });

        // Create thread messages
        if (item.threadItems && item.threadItems.length > 0) {
          for (const msg of item.threadItems) {
            await prisma.supportMessage.create({
              data: {
                conversationId: conv.id,
                externalId: msg.id,
                direction: msg.isOutbound ? "outbound" : "inbound",
                authorLabel: msg.authorLabel,
                body: msg.body.slice(0, 4000),
                createdAt: msg.createdAt,
              },
            });
          }
        } else {
          // Single message from preview body
          await prisma.supportMessage.create({
            data: {
              conversationId: conv.id,
              externalId: `${item.externalId}:body`,
              direction: "inbound",
              authorLabel: item.customerLabel,
              body: item.preview,
              createdAt: item.receivedAt,
            },
          });
        }

        // Immediately create ticket if ingest agent flagged it
        if (item.createTicket && item.ticketTitle) {
          const priorityMap: Record<string, SupportTicketPriority> = {
            urgent: "URGENT",
            high: "HIGH",
            normal: "NORMAL",
            low: "LOW",
          };

          await prisma.supportTicket.create({
            data: {
              clientId: ctx.client.id,
              conversationId: conv.id,
              title: item.ticketTitle || item.subject,
              customerLabel: item.customerLabel,
              status: "OPEN",
              priority: priorityMap[item.priority] ?? "NORMAL",
              source: ctx.connection.source as SupportSource,
              issueType: item.issueType,
            },
          });
          result.ticketsCreated++;
        }

        newConversationIds.push(conv.id);
      } catch (err) {
        result.errors.push(
          `Conversation ${item.externalId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 4. Triage agent: enrich new conversations (refine classification + create tickets for missed ones)
    for (const convId of newConversationIds) {
      try {
        const { ticketId } = await triageConversation(ctx, convId);

        // 5. Draft agent: generate reply for conversations that have a ticket
        if (ticketId) {
          await generateDraftReply(ctx, convId, ticketId);
          result.draftsGenerated++;
        }
      } catch (err) {
        result.errors.push(
          `Triage ${convId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Log agent run to audit log
    await prisma.supportAuditLog.create({
      data: {
        clientId: ctx.client.id,
        actorId: "agent:orchestrator",
        action: "agent_sync_complete",
        target: ctx.connection.id,
        metadata: {
          source: ctx.connection.source,
          fetched: result.fetched,
          ingested: result.ingested,
          filtered: result.filtered,
          ticketsCreated: result.ticketsCreated,
          draftsGenerated: result.draftsGenerated,
        },
      },
    });

    await markSynced(ctx.connection.id, "CONNECTED");
  } catch (err) {
    await markSynced(ctx.connection.id, "ERROR");
    throw err;
  }

  return result;
}

async function markSynced(connId: string, health?: "CONNECTED" | "ERROR") {
  await prisma.accountConnection.update({
    where: { id: connId },
    data: {
      lastSyncedAt: new Date(),
      ...(health ? { health } : {}),
    },
  });
}
