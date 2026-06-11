/**
 * wiki-bigwedge-sync.ts — re-fetch course requests from the Big Wedge API and
 * mark any that have been actioned on their side (action_taken: true) as ADDED
 * in the Foundry tracker.
 *
 * The Big Wedge team sets action_taken = true on a request once they've added the
 * course to their database. We already capture this on initial import, but don't
 * re-check it for existing records. This sync closes that gap.
 *
 * Matching is exact: externalRef = "bigwedge:{requestId}:{courseItemId}" → we
 * extract the requestId and check action_taken on the live API. No fuzzy matching.
 */

import { prisma } from "@/lib/prisma";
import { getJson } from "@/server/support-analytics/types";

const DEFAULT_BASE = "https://apiv1.bigwedgegolf.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 100; // safety cap — 10,000 requests max

interface BwRequest {
  id?: string | number;
  action_taken?: boolean;
  [k: string]: unknown;
}
interface BwPage {
  data?: BwRequest[];
  meta?: { pagination?: { next?: string | null } };
  results?: BwRequest[];
  next?: string | null;
}

async function resolveBigWedgeApi(
  workspaceClientId: string,
): Promise<{ baseUrl: string; apiToken: string } | { error: string }> {
  const support =
    (await prisma.supportClient.findFirst({
      where: { workspaceClientId },
      select: { id: true },
    })) ??
    (await (async () => {
      const wc = await prisma.workspaceClient.findUnique({
        where: { id: workspaceClientId },
        select: { workspaceId: true, name: true, slug: true },
      });
      if (!wc) return null;
      return prisma.supportClient.findFirst({
        where: {
          workspaceId: wc.workspaceId,
          OR: [
            { slug: wc.slug },
            { name: { contains: wc.name, mode: "insensitive" } },
            { name: { contains: "wedge", mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
    })());

  if (!support) return { error: "No Care support client found for this wiki." };

  const conn = await prisma.accountConnection.findFirst({
    where: { clientId: support.id, source: "ANALYTICS" },
    select: { scraperConfig: true },
  });
  if (!conn) return { error: "No Analytics API connector. Add the Big Wedge admin JWT in Care → Connectors." };
  const cfg = (conn.scraperConfig ?? {}) as { baseUrl?: string; apiToken?: string };
  if (!cfg.apiToken) return { error: "The Analytics connector has no API token." };
  return { baseUrl: (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, ""), apiToken: cfg.apiToken };
}

export interface BigWedgeSyncResult {
  baseUrl: string;
  /** Total requests fetched from the Big Wedge API this run. */
  totalFetched: number;
  /** How many of those have action_taken = true on their side. */
  actionTakenCount: number;
  /** Our NEW/SENT records that match an action_taken request. */
  toMarkCount: number;
  /** Actually updated (0 in dryRun). */
  markedCount: number;
  /** Up to 10 records that were/would be marked ADDED. */
  sample: Array<{ courseName: string; country: string | null; externalRef: string }>;
  dryRun: boolean;
  errors: string[];
}

export async function syncBigWedgeStatus(
  workspaceClientId: string,
  opts: { dryRun?: boolean; apiToken?: string },
): Promise<BigWedgeSyncResult | { error: string }> {
  let api: { baseUrl: string; apiToken: string };
  if (opts.apiToken) {
    api = { baseUrl: DEFAULT_BASE, apiToken: opts.apiToken };
  } else {
    const resolved = await resolveBigWedgeApi(workspaceClientId);
    if ("error" in resolved) return resolved;
    api = resolved;
  }

  const dryRun = opts.dryRun ?? true;
  const errors: string[] = [];

  // ── Fetch all course requests from Big Wedge, build action_taken lookup ──────
  const actionTakenIds = new Set<string>();
  let url: string | null =
    `${api.baseUrl}/api/v1/course-requests/?ordering=-created_at&page_size=${PAGE_SIZE}&page=1`;
  let totalFetched = 0;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    let data: BwPage;
    try {
      data = await getJson<BwPage>(url, api.apiToken);
    } catch (err) {
      errors.push(`Fetch failed (page ${page + 1}): ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    const results =
      data.data ?? data.results ?? (Array.isArray(data) ? (data as unknown as BwRequest[]) : []);
    totalFetched += results.length;

    for (const r of results) {
      if (r.action_taken && r.id != null) {
        actionTakenIds.add(String(r.id));
      }
    }

    url = data.meta?.pagination?.next ?? data.next ?? null;
  }

  // ── Find our NEW/SENT records that have a bigwedge externalRef ───────────────
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: {
      courseRequests: {
        where: {
          status: { in: ["NEW", "SENT"] },
          externalRef: { startsWith: "bigwedge:" },
        },
        select: { id: true, courseName: true, country: true, externalRef: true },
      },
    },
  });

  const candidates = wiki?.courseRequests ?? [];

  // Match: externalRef = "bigwedge:{requestId}:{courseItemId}" → extract requestId
  const toMark = candidates.filter((r) => {
    if (!r.externalRef) return false;
    const parts = r.externalRef.split(":");
    // parts[0] = "bigwedge", parts[1] = requestId, parts[2] = courseItemId
    const requestId = parts[1];
    return requestId && actionTakenIds.has(requestId);
  });

  const sample = toMark.slice(0, 10).map((r) => ({
    courseName: r.courseName,
    country: r.country,
    externalRef: r.externalRef ?? "",
  }));

  if (dryRun) {
    return {
      baseUrl: api.baseUrl,
      totalFetched,
      actionTakenCount: actionTakenIds.size,
      toMarkCount: toMark.length,
      markedCount: 0,
      sample,
      dryRun: true,
      errors,
    };
  }

  // ── Update matched records to ADDED ──────────────────────────────────────────
  const ids = toMark.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.clientCourseRequest.updateMany({
      where: { id: { in: ids } },
      data: { status: "ADDED" },
    });
  }

  return {
    baseUrl: api.baseUrl,
    totalFetched,
    actionTakenCount: actionTakenIds.size,
    toMarkCount: toMark.length,
    markedCount: ids.length,
    sample,
    dryRun: false,
    errors,
  };
}
