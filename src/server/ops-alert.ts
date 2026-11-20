/**
 * Telling Gitwork that the platform itself needs a look: a scheduled job has stopped, the disk
 * is filling, a backup failed, a server error happened (CLAUDE.md §144).
 *
 * Goes to Gitwork's admins in Foundry (in-app + push, event `system.ops_alert`) and, when
 * `SLACK_OPS_WEBHOOK_URL` is set on the server, to that Slack channel too. The Slack post is the
 * one that still arrives if nobody has Foundry open. Never throws: an alert that fails must not
 * fail the job that raised it.
 */

import { dispatchNotification } from "@/server/notifications";
import { requestWorkspaceId } from "@/server/workspaces/scope";

export interface OpsAlert {
  /** Groups repeats of the same alert in the notification feed. */
  key: string;
  title: string;
  body?: string;
  /** "problem" posts red, "resolved" posts green. */
  level?: "problem" | "resolved";
}

/** Post a plain line to the ops Slack webhook, if one is set. Exported for error alerts. */
export async function postOpsWebhook(text: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const url = env.SLACK_OPS_WEBHOOK_URL?.trim();
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.warn(`[ops-alert] Slack webhook failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function sendOpsAlert(alert: OpsAlert): Promise<void> {
  const icon = alert.level === "resolved" ? "✅" : "🔴";
  await postOpsWebhook(`${icon} *${alert.title}*${alert.body ? `\n${alert.body}` : ""}`);
  try {
    // Gitwork's own workspace: the platform's admins are its admins.
    const workspaceId = await requestWorkspaceId(null);
    dispatchNotification({
      event: "system.ops_alert",
      workspaceId,
      title: alert.title,
      body: alert.body ?? null,
      actionUrl: "/app",
      target: { kind: "admins" },
      groupKey: `system.ops_alert:${alert.key}`,
      count: 1,
    });
  } catch (err) {
    console.error("[ops-alert] could not notify admins", err);
  }
}
