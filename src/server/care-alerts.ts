import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { getClientQueueSummaries, SUPPORT_DESK_CLIENT } from "@/server/support";
import { connectorAlertWords, waitAlert, waitAlertWords } from "@/lib/care-alerts";

/**
 * Care saying something when a desk has stopped working.
 *
 * Two alerts, both of which Care already had every number for and neither of which existed:
 * a customer waiting past `LONG_WAIT_HOURS`, and a channel that has stopped delivering.
 *
 * ⚠️ Both latch, so they fire ONCE per outage. A desk that pages someone every time a worker
 * runs gets muted, and a muted alert is worse than no alert because it looks like cover. The
 * rules are pure and tested in `src/lib/care-alerts.ts`; this file is the part that talks to the
 * database and the dispatcher.
 */

/**
 * Raise or clear the "a customer has waited too long" alert for every desk client in a workspace.
 *
 * Reads `getClientQueueSummaries`, which already returns `oldestAwaitingAt` per client from a
 * `_min` groupBy — the same figure Care home and the HQ tile show, so the alert and the screen
 * cannot disagree about who is worst off.
 */
export async function runCareWaitAlerts(workspaceId: string, now = new Date()): Promise<{ raised: number; cleared: number }> {
  const summaries = await getClientQueueSummaries(workspaceId);
  const ids = Object.keys(summaries);
  if (ids.length === 0) return { raised: 0, cleared: 0 };

  const clients = await prisma.supportClient.findMany({
    where: { workspaceId, ...SUPPORT_DESK_CLIENT, id: { in: ids } },
    select: { id: true, name: true, waitAlertedAt: true },
  });

  let raised = 0;
  let cleared = 0;

  for (const client of clients) {
    const alert = waitAlert({
      oldestAwaitingAt: summaries[client.id]?.oldestAwaitingAt ?? null,
      alertedAt: client.waitAlertedAt,
      now,
    });
    if (!alert) continue;

    const words = waitAlertWords(alert, client.name);
    dispatchNotification({
      event: "care.waiting_too_long",
      workspaceId,
      title: words.title,
      body: words.body,
      actionUrl: `/app/care?client=${client.id}`,
      // Whoever may run Care, rather than every admin: this is a desk to work, not news.
      target: { kind: "permission", permission: "support.manage" },
      groupKey: `care.waiting_too_long:${client.id}`,
    });

    /*
     * ⚠️ The latch moves AFTER the dispatch, and `dispatchNotification` is fire-and-forget, so
     * this is "we have said it" rather than "it was delivered". That is the honest limit of a
     * void-returning dispatcher; the alternative — latching first — would lose the alert
     * entirely if the send failed, which is the failure that matters.
     */
    await prisma.supportClient.update({
      where: { id: client.id },
      data: { waitAlertedAt: alert.kind === "waiting_too_long" ? now : null },
    }).catch(() => {});

    if (alert.kind === "waiting_too_long") raised++;
    else cleared++;
  }

  return { raised, cleared };
}

/**
 * Tell people a channel has stopped delivering, or started again.
 *
 * Called from the sync with the transition `care-connector-health.ts` already computes — the
 * latch is the health column itself, so there is nothing extra to store and no way for the badge
 * and the alert to disagree.
 */
export function notifyConnectorHealth(input: {
  workspaceId: string;
  clientId: string;
  clientName: string;
  label: string;
  recovered: boolean;
  reason?: string | null;
}): void {
  const words = connectorAlertWords(input);
  dispatchNotification({
    event: "care.connector_failing",
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    title: words.title,
    body: words.body,
    actionUrl: `/app/care?client=${input.clientId}&section=settings`,
    target: { kind: "admins" },
    groupKey: `care.connector_failing:${input.clientId}`,
  });
}

/**
 * Every workspace's desks, for the every-minute jobs worker.
 *
 * ⚠️ Deliberately NOT on the 10:00 `care-digest` cron. The threshold is 24 hours, so a
 * once-a-day check would report a breach up to a day after it happened — the alert would
 * routinely arrive when the wait was already two days old. It needs no crontab line of its own
 * either: the worker runs every minute and the latch does the throttling, the same shape
 * `sendHrDigests()` uses.
 */
export async function runDueCareWaitAlerts(): Promise<{ workspaces: number; raised: number; cleared: number }> {
  const { forEachWorkspace } = await import("@/server/workspaces/for-each");
  let raised = 0;
  let cleared = 0;
  const runs = await forEachWorkspace(
    { where: { supportClients: { some: {} } }, select: { id: true } },
    async (ws) => {
      const out = await runCareWaitAlerts(ws.id);
      raised += out.raised;
      cleared += out.cleared;
    },
  );
  return { workspaces: runs.length, raised, cleared };
}
