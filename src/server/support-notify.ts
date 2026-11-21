import { prisma } from "@/lib/prisma";
import { getClientQueueSummaries } from "@/server/support";
import { formatAge, LONG_WAIT_HOURS } from "@/lib/care-alerts";

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
 * The morning Care digest, to `channelRoutes["care.digest"]`.
 *
 * ⚠️ It used to count `status: { in: ["NEW","OPEN"] }` and call it "conversations needing
 * action" — the pre-§42.4 metric, with no wait dimension at all, and the exact thing §42.13
 * criticised the HQ tile for. An open conversation we answered yesterday is not work; a
 * conversation a customer has been waiting on for three days is. So the digest reports
 * **awaiting a reply**, the longest wait, and anything past Care's own threshold.
 *
 * It also now names a client whose channel has stopped delivering, because that client's queue
 * reads as calm whether or not it is, and a morning digest is exactly where someone would notice.
 *
 * Silent on a clear morning: the early return moved from "nothing is open" (which was almost
 * never true, and never meaningful) to "nobody is waiting and nothing is broken".
 *
 * ⚠️ The channel key stays `care.digest`, not a declared notification event. This posts a
 * workspace summary rather than alerting a person, and renaming the key would orphan the route
 * someone has already configured.
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

    /*
     * One read for every figure. `getClientQueueSummaries` is already scoped to support-desk
     * clients — an ingest-only client's mail is harvested, not answered, so naming it in a digest
     * about who needs a human would be reporting a golf-course importer's backlog as a support
     * queue — and it already carries `oldestAwaitingAt` and `connectorsFailing` per client, so
     * the digest cannot disagree with Care home about who is worst off.
     */
    const summaries = await getClientQueueSummaries(workspaceId);
    const ids = Object.keys(summaries);
    if (ids.length === 0) return;

    const clients = await prisma.supportClient.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, name: true },
    });
    const names = new Map(clients.map((c) => [c.id, c.name]));

    const rows = ids
      .map((id) => ({ id, name: names.get(id) ?? id, ...summaries[id] }))
      .filter((r) => r.awaiting > 0 || r.connectorsFailing > 0)
      .sort((a, b) => b.awaiting - a.awaiting);

    const totalAwaiting = rows.reduce((n, r) => n + r.awaiting, 0);
    const broken = rows.filter((r) => r.connectorsFailing > 0);
    const stale = rows.filter(
      (r) => r.oldestAwaitingAt !== null && Date.now() - new Date(r.oldestAwaitingAt).getTime() >= LONG_WAIT_HOURS * 3600_000,
    );

    // A clear morning says nothing. Nobody waiting and nothing broken is not news.
    if (totalAwaiting === 0 && broken.length === 0) return;

    const lines: string[] = [];
    lines.push(
      totalAwaiting > 0
        ? `📬  *Care* · ${totalAwaiting} customer${totalAwaiting !== 1 ? "s" : ""} waiting on a reply across ${rows.filter((r) => r.awaiting > 0).length} client${rows.filter((r) => r.awaiting > 0).length !== 1 ? "s" : ""}`
        : "📬  *Care* · nobody waiting, but a channel has stopped delivering",
    );

    for (const r of rows) {
      const bits: string[] = [];
      if (r.awaiting > 0) bits.push(`${r.awaiting} waiting`);
      if (r.oldestAwaitingAt) bits.push(`longest ${formatAge(r.oldestAwaitingAt)}`);
      if (r.urgent > 0) bits.push(`${r.urgent} urgent`);
      if (r.connectorsFailing > 0) {
        bits.push(`⚠️ ${r.connectorsFailing} channel${r.connectorsFailing !== 1 ? "s" : ""} not delivering`);
      }
      lines.push(`  • ${r.name}: ${bits.join(" · ")}`);
    }

    if (stale.length > 0) {
      const worst = stale[0];
      lines.push(
        `⏳  ${stale.length} client${stale.length !== 1 ? "s have" : " has"} someone waiting over ${LONG_WAIT_HOURS}h — longest is ${worst.name}, ${formatAge(worst.oldestAwaitingAt as string)}`,
      );
    }
    if (broken.length > 0) {
      lines.push(`🔌  ${broken.map((b) => b.name).join(", ")}: mail is not arriving, so the queue reads quiet whether or not it is`);
    }

    lines.push("Open → https://foundry.gitwork.co.uk/app/care");

    await postSlack(botToken, channel, lines.join("\n"));
  } catch {
    // Never throw — digest failures must not affect anything else.
  }
}
