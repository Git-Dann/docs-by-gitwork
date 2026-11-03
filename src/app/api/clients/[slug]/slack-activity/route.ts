import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import { getEffectiveUserOrNull, canComputeAiFor } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { resolveAiConfig, completeText, type WorkspaceAiFields } from "@/server/ai-provider";
import { getSlackBotToken } from "@/server/slack/client";
import { readSlackChannel } from "@/server/slack-channel-updates";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type SlackMessage = {
  id: string;
  author: string;
  text: string;
  ts: string; // ISO8601 — converted from Slack's epoch ts
};


/**
 * GET /api/clients/{slug}/slack-activity
 *
 * Pulls the client's linked Slack channel via the workspace bot token (same
 * mechanism as the meeting-summary integration) and returns an AI-summarised
 * digest of what the devs have posted — plus the raw recent messages.
 *
 * Polled by the Portal mobile app (~30 min) and on pull-to-refresh. Never
 * throws to the client; any misconfiguration returns `configured:false` with a
 * `reason` the app can surface.
 *
 * Response:
 *   { configured, channelName, summary, generatedAt, reason, messages[] }
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    await assertClientAccessBySlug(user, slug);
    // Any teammate with client access sees the cached digest; only AI-generation holders
    // (admins by default) pay to refresh it when the channel ticks forward.
    const canCompute = canComputeAiFor(user);

    const [client, ws] = await Promise.all([
      prisma.workspaceClient.findFirst({
        where: { slug, workspaceId: workspace.id },
        // Prefer the new dual-channel internal field; fall back to the legacy single-channel
        // field during the Phase-3 → Phase-4 deprecation window.
        select: { slackChannelId: true, slackInternalChannelId: true, name: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspace.id },
        select: {
          slackBotToken: true,
          slackBotTokenEncrypted: true,
          aiProvider: true,
          anthropicApiKey: true,
          platformAiKeysAllowed: true,
          anthropicModel: true,
          openaiApiKey: true,
          openaiModel: true,
          geminiApiKey: true,
          geminiModel: true,
          localLlmUrl: true,
          localLlmModel: true,
        },
      }),
    ]);

    if (!ws) return notConfigured("no_token");
    const channelId =
      (client?.slackInternalChannelId ?? client?.slackChannelId ?? "").trim() || undefined;
    const token = getSlackBotToken(ws);

    if (!token) return notConfigured("no_token");
    if (!channelId) return notConfigured("no_channel");

    const read = await readSlackChannel({
      botToken: token,
      channelId,
      fallbackName: client?.name ?? null,
    });
    if (!read.ok) return notConfigured(read.reason);
    const { channelName, messages, participants } = read;

    if (messages.length === 0) {
      return apiOk({
        configured: true,
        channelName,
        summary: null,
        generatedAt: null,
        reason: "empty",
        participants: [] as string[],
        messages: [],
      });
    }

    // 4. AI summary of the recent updates — workspace-cached so every Gitwork teammate
    //    polling this client's page reuses the same digest until new messages arrive.
    //    Cache key: per-channel. Invalidation: hash of recent message IDs — when the
    //    Slack channel ticks forward, the hash changes and we regenerate.
    const inputsHash = hashInputs({
      channelId,
      messageIds: messages.map((m) => m.id),
      // Include the resolved channel label so a rename forces a refresh too.
      channelLabel: channelName ?? client?.name ?? "this project",
    });

    const cacheResult = await cachedOrCompute<{ summary: string | null }>({
      workspaceId: workspace.id,
      cacheKey: `slack-activity:${channelId}`,
      inputsHash,
      canCompute,
      compute: async () => {
        const summary = await summarise(
          messages,
          channelName ?? client?.name ?? "this project",
          ws,
          { module: "SLACK", workspaceId: workspace.id, userId: user?.id, operation: "slackActivitySummary" },
        );
        return { response: { summary }, modelUsed: ws.aiProvider };
      },
    });

    return apiOk({
      configured: true,
      channelName,
      // Viewer without the AI gate + no cached digest → no summary, but the raw messages
      // still render. Reason "stale" tells the client it's cache-only, not an error.
      summary: cacheResult?.response.summary ?? null,
      generatedAt: cacheResult?.cachedAt ?? null,
      cached: cacheResult?.cached ?? false,
      reason: cacheResult ? "ok" : "stale",
      participants,
      messages,
    });
  } catch (error) {
    return fromError(error);
  }
}

function notConfigured(reason: string) {
  return apiOk({
    configured: false,
    channelName: null,
    summary: null,
    generatedAt: null,
    reason,
    participants: [] as string[],
    messages: [] as SlackMessage[],
  });
}

/** Concise digest of recent dev updates. Returns null if AI isn't configured. */
async function summarise(
  messages: SlackMessage[],
  channelLabel: string,
  ws: WorkspaceAiFields,
  usageContext?: {
    module: "SLACK";
    workspaceId: string;
    userId?: string | null;
    operation?: string | null;
  },
): Promise<string | null> {
  const config = resolveAiConfig(ws);
  if (!config.apiKey) return null;

  const transcript = messages
    .slice(-40)
    .map((m) => `${m.author}: ${m.text}`)
    .join("\n");

  const system = `You summarise a development team's Slack channel for an agency project lead.
Produce a tight digest of what the devs have posted recently — British English, no filler.
Format as 2–5 short bullet points starting with "•". Lead with progress/shipped, then in-progress, then any blockers or asks for the client. If there's nothing substantive, reply exactly: "No significant updates."`;

  try {
    return await completeText({
      config,
      system,
      user: `Channel: ${channelLabel}\nRecent messages (oldest first):\n${transcript}`,
      maxTokens: 400,
      tier: "light",
      usageContext,
    });
  } catch {
    return null;
  }
}
