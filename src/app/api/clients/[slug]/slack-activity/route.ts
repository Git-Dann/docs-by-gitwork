import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { resolveAiConfig, completeText, type WorkspaceAiFields } from "@/server/ai-provider";
import { getSlackBotToken } from "@/server/slack/client";

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

const SLACK_API = "https://slack.com/api";

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
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);

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

    const auth = { Authorization: `Bearer ${token}` };

    // 1. Channel history — cached for 2 min so multiple teammates viewing the
    //    same client page share one Slack response per cache window.
    const historyRes = await fetch(
      `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=40`,
      { headers: auth, next: { revalidate: 120 } },
    );
    const history = (await historyRes.json()) as {
      ok: boolean;
      error?: string;
      messages?: Array<{ type: string; subtype?: string; text?: string; ts: string; user?: string; bot_id?: string }>;
    };

    if (!history.ok) {
      // Most common: the bot hasn't been invited to the channel.
      const reason = history.error === "not_in_channel" ? "not_in_channel" : "slack_error";
      return notConfigured(reason);
    }

    const raw = (history.messages ?? []).filter(
      (m) => m.type === "message" && !m.subtype && (m.text ?? "").trim().length > 0,
    );

    // 2. Resolve display names — for authors AND anyone @-mentioned in the
    //    message bodies, so we can render mentions as "@Name".
    const mentionIds = new Set<string>();
    for (const m of raw) {
      for (const match of (m.text ?? "").matchAll(/<@([A-Z0-9]+)/g)) {
        mentionIds.add(match[1]);
      }
    }
    const userIds = [...new Set([
      ...(raw.map((m) => m.user).filter(Boolean) as string[]),
      ...mentionIds,
    ])];
    const nameById = new Map<string, string>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          // Display names change rarely — cache for 1 hour per user.
          const res = await fetch(`${SLACK_API}/users.info?user=${uid}`, { headers: auth, next: { revalidate: 3600 } });
          const data = (await res.json()) as {
            ok: boolean;
            user?: {
              name?: string; // the @username handle
              real_name?: string;
              profile?: { display_name?: string; real_name?: string };
            };
          };
          if (data.ok && data.user) {
            // Friendliest first: Slack display name → full name → @username handle.
            const name =
              data.user.profile?.display_name?.trim() ||
              data.user.profile?.real_name?.trim() ||
              data.user.real_name?.trim() ||
              data.user.name?.trim();
            if (name) nameById.set(uid, name);
          }
        } catch {
          /* leave unresolved */
        }
      }),
    );

    // 3. Channel name (best-effort).
    let channelName: string | null = client?.name ?? null;
    try {
      // Channel name changes very rarely — cache for 1 hour.
      const infoRes = await fetch(
        `${SLACK_API}/conversations.info?channel=${encodeURIComponent(channelId)}`,
        { headers: auth, next: { revalidate: 3600 } },
      );
      const info = (await infoRes.json()) as { ok: boolean; channel?: { name?: string } };
      if (info.ok && info.channel?.name) channelName = `#${info.channel.name}`;
    } catch {
      /* keep fallback */
    }

    const messages: SlackMessage[] = raw
      .map((m) => ({
        id: m.ts,
        author: (m.user && nameById.get(m.user)) || (m.bot_id ? "Bot" : "Teammate"),
        text: formatSlackText(m.text ?? "", nameById),
        ts: new Date(Math.floor(Number(m.ts) * 1000)).toISOString(),
      }))
      // Oldest → newest reads naturally for a summary.
      .reverse();

    // Devs active in the channel — resolved names, generic placeholders dropped.
    // The app shows these and focuses its on-device summary on "who did what".
    const participants = [...new Set(
      messages.map((m) => m.author).filter((a) => a !== "Bot" && a !== "Teammate"),
    )];

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
      compute: async () => {
        const summary = await summarise(
          messages,
          channelName ?? client?.name ?? "this project",
          ws,
        );
        return { response: { summary }, modelUsed: ws.aiProvider };
      },
    });

    return apiOk({
      configured: true,
      channelName,
      summary: cacheResult.response.summary,
      generatedAt: cacheResult.cachedAt ?? new Date().toISOString(),
      cached: cacheResult.cached,
      reason: "ok",
      participants,
      messages,
    });
  } catch (error) {
    return fromError(error);
  }
}

/// Turns Slack's mrkdwn tokens into readable text:
/// <@U123> → @Name, <#C123|name> → #name, <url|label> → label, and unescapes
/// &amp;/&lt;/&gt;. Used for the message bodies the app displays.
function formatSlackText(text: string, names: Map<string, string>): string {
  let t = text;
  // User mentions: <@U123> or <@U123|fallback>
  t = t.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, fb: string) =>
    "@" + (names.get(id) || fb || "someone"));
  // Channels: <#C123|name> or <#C123>
  t = t.replace(/<#[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, name: string) => "#" + (name || "channel"));
  // Subteam / group mentions: <!subteam^S123|@group>
  t = t.replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, label: string) => label || "@group");
  // Special mentions: <!here> <!channel> <!everyone>
  t = t.replace(/<!(here|channel|everyone)>/g, (_m, k: string) => "@" + k);
  // Links: <https://x|label> or <https://x>
  t = t.replace(/<((?:https?|mailto):[^>|]+)(?:\|([^>]+))?>/g, (_m, url: string, label: string) => label || url);
  // Unescape Slack HTML entities.
  t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return t;
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
    });
  } catch {
    return null;
  }
}
