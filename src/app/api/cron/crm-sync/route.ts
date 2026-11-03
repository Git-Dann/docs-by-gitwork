import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { listLeadsForScheduledSync } from "@/server/crm/service";
import { syncLeadCrm } from "@/server/crm/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/crm-sync  (host cron on the VPS — see docs/vps-crons.md)
 *
 * Syncs every lead with CRM automation on. Sequential on purpose: each lead reads the opted-in
 * mailboxes, and fanning out would multiply concurrent Gmail calls per person. A lead whose
 * sync is already running is skipped by its claim, not queued.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const ids = await listLeadsForScheduledSync();
    const summary = { leads: ids.length, synced: 0, moved: 0, suggested: 0, actions: 0, withErrors: 0, busy: 0 };
    for (const id of ids) {
      try {
        const r = await syncLeadCrm(id, { canComputeAi: true });
        if (r.status === "busy") summary.busy += 1;
        if (r.status !== "synced") continue;
        summary.synced += 1;
        if (r.moved) summary.moved += 1;
        summary.suggested += r.suggested;
        summary.actions += r.actionsProposed;
        if (r.errors.length) summary.withErrors += 1;
      } catch (err) {
        summary.withErrors += 1;
        console.error("[cron/crm-sync] lead failed", { id, error: (err as Error).message });
      }
    }
    return apiOk(summary);
  } catch (error) {
    return fromError(error);
  }
}
