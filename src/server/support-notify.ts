import { prisma } from "@/lib/prisma";
import { SUPPORT_DESK_CLIENT } from "@/server/support";

async function postSlack(botToken: string, channel: string, text: string): Promise<void> {
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
    });
  } catch {
    // Best-effort — never throw out of a digest post.
  }
}

/**
 * Posts a Care ticket summary digest to the Slack channel configured as
 * `channelRoutes["care.digest"]`. No-op if the token or channel isn't configured.
 */
export async function postCareDigest(workspaceId: string): Promise<void> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { slackBotToken: true, channelRoutes: true },
    });
    const botToken = ws?.slackBotToken?.trim();
    const routes = (ws?.channelRoutes as Record<string, string> | null) ?? {};
    const channel = routes["care.digest"];
    if (!botToken || !channel) return;

    // Support-desk clients only: an ingest-only client's mail is harvested, not answered, so
    // naming it in a digest about who needs a human would be reporting a golf-course importer's
    // backlog as a support queue.
    const clients = await prisma.supportClient.findMany({
      where: { workspaceId, ...SUPPORT_DESK_CLIENT },
      select: { id: true, name: true },
    });

    if (clients.length === 0) return;

    const clientIds = clients.map((c) => c.id);

    // Conversations needing a human (NEW or OPEN) are the unit of triage now.
    const [openRows, urgentCount] = await Promise.all([
      prisma.supportConversation.groupBy({
        by: ["clientId"],
        where: { clientId: { in: clientIds }, status: { in: ["NEW", "OPEN"] } },
        _count: { _all: true },
      }),
      prisma.supportConversation.count({
        where: { clientId: { in: clientIds }, status: { in: ["NEW", "OPEN"] }, priority: "URGENT" },
      }),
    ]);

    const totalOpen = openRows.reduce((s, r) => s + r._count._all, 0);
    if (totalOpen === 0) return; // nothing to report

    const clientCount = openRows.length;
    const lines: string[] = [];
    lines.push(`📬  *Care update* · ${totalOpen} conversation${totalOpen !== 1 ? "s" : ""} needing action across ${clientCount} client${clientCount !== 1 ? "s" : ""}`);

    const clientMap = new Map(clients.map((c) => [c.id, c.name]));
    for (const row of openRows.sort((a, b) => b._count._all - a._count._all)) {
      const name = clientMap.get(row.clientId) ?? row.clientId;
      lines.push(`  • ${name}: ${row._count._all}`);
    }

    if (urgentCount > 0) lines.push(`⚠️  ${urgentCount} urgent`);
    lines.push(`Review → https://foundry.gitwork.co.uk/app/care`);

    await postSlack(botToken, channel, lines.join("\n"));
  } catch {
    // Never throw — digest failures must not affect anything else.
  }
}
