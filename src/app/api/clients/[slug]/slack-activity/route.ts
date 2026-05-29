import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type SlackMessage = {
  id: string;
  author: string;
  text: string;
  ts: string; // ISO8601 — already converted from Slack's epoch ts
};

const SLACK_API = "https://slack.com/api";

/**
 * GET /api/clients/{slug}/slack-activity
 *
 * Read-only timeline of recent messages in the client's linked Slack channel —
 * "what updates the devs have posted". Pulls via the workspace's Slack bot
 * token (same mechanism as the meeting-summary integration). Never throws to
 * the client: any misconfiguration or Slack error returns `configured: false`.
 *
 * Response: { configured, channelName, messages: SlackMessage[] }
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { slug } = await context.params;

    const [client, ws] = await Promise.all([
      prisma.workspaceClient.findFirst({
        where: { slug, workspaceId: workspace.id },
        select: { slackChannelId: true, name: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspace.id },
        select: { slackBotToken: true },
      }),
    ]);

    const channelId = client?.slackChannelId?.trim();
    const token = ws?.slackBotToken?.trim();

    if (!channelId || !token) {
      return apiOk({
        configured: false,
        channelName: null,
        messages: [] as SlackMessage[],
      });
    }

    const auth = { Authorization: `Bearer ${token}` };

    // 1. Recent channel history.
    const historyRes = await fetch(
      `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&limit=20`,
      { headers: auth, cache: "no-store" },
    );
    const history = (await historyRes.json()) as {
      ok: boolean;
      error?: string;
      messages?: Array<{ type: string; subtype?: string; text?: string; ts: string; user?: string; bot_id?: string }>;
    };

    if (!history.ok || !history.messages) {
      return apiOk({
        configured: false,
        channelName: null,
        messages: [] as SlackMessage[],
        reason: history.error ?? "slack_history_failed",
      });
    }

    // Keep human messages with text (drop joins/leaves/system subtypes).
    const raw = history.messages.filter(
      (m) => m.type === "message" && !m.subtype && (m.text ?? "").trim().length > 0,
    );

    // 2. Resolve author display names (bounded — one channel page).
    const userIds = [...new Set(raw.map((m) => m.user).filter(Boolean) as string[])];
    const nameById = new Map<string, string>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const res = await fetch(`${SLACK_API}/users.info?user=${uid}`, {
            headers: auth,
            cache: "no-store",
          });
          const data = (await res.json()) as {
            ok: boolean;
            user?: { real_name?: string; profile?: { display_name?: string; real_name?: string } };
          };
          if (data.ok && data.user) {
            const name =
              data.user.profile?.display_name?.trim() ||
              data.user.profile?.real_name?.trim() ||
              data.user.real_name?.trim();
            if (name) nameById.set(uid, name);
          }
        } catch {
          // leave unresolved → "Teammate"
        }
      }),
    );

    // 3. Optional channel name.
    let channelName: string | null = client?.name ?? null;
    try {
      const infoRes = await fetch(
        `${SLACK_API}/conversations.info?channel=${encodeURIComponent(channelId)}`,
        { headers: auth, cache: "no-store" },
      );
      const info = (await infoRes.json()) as { ok: boolean; channel?: { name?: string } };
      if (info.ok && info.channel?.name) channelName = `#${info.channel.name}`;
    } catch {
      // keep fallback
    }

    const messages: SlackMessage[] = raw.map((m) => ({
      id: m.ts,
      author: (m.user && nameById.get(m.user)) || (m.bot_id ? "Bot" : "Teammate"),
      text: m.text ?? "",
      ts: new Date(Math.floor(Number(m.ts) * 1000)).toISOString(),
    }));

    return apiOk({ configured: true, channelName, messages });
  } catch (error) {
    return fromError(error);
  }
}
