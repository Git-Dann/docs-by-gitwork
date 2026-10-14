/**
 * The scheduled Big Wedge course-request feed — run hourly by
 * GET /api/cron/wedge-course-feed.
 *
 * ⚠️ Why this exists. Course requests used to reach Foundry two ways, and both died
 * silently: Big Wedge's app stopped emailing "New Feedback" to the mailbox Care reads
 * (last one 4 Aug 2026), and the API import only ever ran when someone pressed a button,
 * with a pasted token that had expired. The client noticed before we did — twice.
 *
 * So this pulls straight from Big Wedge's own course-requests API on a schedule, and —
 * the part that actually ends the cycle — RECORDS the outcome on the wiki
 * (`ClientWiki.courseFeedStatus`), shows it on the Course Requests page, and notifies
 * admins the moment it goes from working to broken. A dead feed is no longer
 * indistinguishable from "no golfer asked for anything".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COURSE_REQUESTS_SLUGS } from "@/lib/wiki-sections";
import {
  feedSince,
  nextFeedStatus,
  parseFeedStatus,
  type CourseFeedStatus,
} from "@/lib/wedge-course-feed-status";
import { importBigWedgeCourseRequests } from "@/server/wiki-bigwedge-import";
import { syncBigWedgeStatus } from "@/server/wiki-bigwedge-sync";
import { dispatchNotification } from "@/server/notifications";

/** The status pass walks every request, so it runs about daily, not hourly. */
const STATUS_SYNC_EVERY_MS = 20 * 3_600_000;

export interface CourseFeedRunResult {
  slug: string;
  ok: boolean;
  created: number;
  marked: number | null;
  error: string | null;
}

export async function runWedgeCourseFeed(workspaceId: string, now: Date = new Date()): Promise<CourseFeedRunResult[]> {
  const results: CourseFeedRunResult[] = [];
  for (const slug of COURSE_REQUESTS_SLUGS) {
    const client = await prisma.workspaceClient.findFirst({
      where: { workspaceId, slug },
      select: { id: true, name: true, slug: true, wiki: { select: { id: true, courseFeedStatus: true } } },
    });
    if (!client?.wiki) {
      results.push({ slug, ok: false, created: 0, marked: null, error: "No wiki for this client." });
      continue;
    }
    results.push({ ...(await runOne(workspaceId, client, client.wiki, now)), slug });
  }
  return results;
}

async function runOne(
  workspaceId: string,
  client: { id: string; name: string; slug: string },
  wiki: { id: string; courseFeedStatus: Prisma.JsonValue | null },
  now: Date,
): Promise<Omit<CourseFeedRunResult, "slug">> {
  const prev = parseFeedStatus(wiki.courseFeedStatus);
  const outcome = await pull(client.id, feedSince(prev));

  let status = nextFeedStatus(prev, outcome.ok ? { ok: true, created: outcome.created } : outcome, now);

  // Mark requests Big Wedge has already actioned — only when the pull itself worked,
  // since it uses the same login; a failure here is logged, never fails the feed.
  let marked: number | null = null;
  const lastSync = status.lastStatusSyncAt ? new Date(status.lastStatusSyncAt).getTime() : 0;
  if (outcome.ok && now.getTime() - lastSync >= STATUS_SYNC_EVERY_MS) {
    try {
      const sync = await syncBigWedgeStatus(client.id, { dryRun: false });
      if ("error" in sync || sync.errors.length > 0) {
        console.error(`[wedge-course-feed] ${client.name}: status sync`, "error" in sync ? sync.error : sync.errors);
      } else {
        marked = sync.markedCount;
        status = { ...status, lastStatusSyncAt: now.toISOString() };
      }
    } catch (err) {
      console.error(`[wedge-course-feed] ${client.name}: status sync threw`, err);
    }
  }

  await prisma.clientWiki.update({
    where: { id: wiki.id },
    data: { courseFeedStatus: status as unknown as Prisma.InputJsonValue },
  });

  if (!outcome.ok) {
    console.error(`[wedge-course-feed] ${client.name}: ${outcome.error}`);
    if (!prev?.failingSince) notifyFailing(workspaceId, client.name, client.slug, status);
  }

  return {
    ok: outcome.ok,
    created: outcome.ok ? outcome.created : 0,
    marked,
    error: outcome.ok ? null : outcome.error,
  };
}

async function pull(
  workspaceClientId: string,
  since: string,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    const result = await importBigWedgeCourseRequests(workspaceClientId, { since, dryRun: false });
    if ("error" in result) return { ok: false, error: result.error };
    // A page that failed to fetch means the window was not fully read — so the run is a
    // failure (lastSuccessAt does not advance and the next run re-reads the window),
    // even though anything on the pages that DID arrive was written.
    if (result.errors.length > 0) return { ok: false, error: result.errors[0] };
    return { ok: true, created: result.createdCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Once per outage — the transition from working to failing, never every hourly retry. */
function notifyFailing(workspaceId: string, clientName: string, slug: string, status: CourseFeedStatus) {
  try {
    dispatchNotification({
      event: "clients.feed_failing",
      workspaceId,
      title: `${clientName} course requests have stopped arriving`,
      body: status.lastError,
      actionUrl: `/app/portal/${slug}/wiki#course-requests`,
      target: { kind: "admins" },
      groupKey: `clients.feed_failing:${clientName}`,
      count: 1,
    });
  } catch (err) {
    console.error("[wedge-course-feed] could not notify admins", err);
  }
}
