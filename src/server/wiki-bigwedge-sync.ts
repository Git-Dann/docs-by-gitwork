/**
 * wiki-bigwedge-sync.ts — re-fetch course requests from the Big Wedge API and
 * mark any with action_taken=true as ADDED in the Foundry tracker.
 *
 * The one-time full course-name cross-reference has been run (136 matched, June 2026).
 * Going forward this is a fast check: only scans the course-requests endpoint.
 */

import { prisma } from "@/lib/prisma";
import { getJson } from "@/server/support-analytics/types";
import { decryptScraperConfig } from "@/server/support";

const DEFAULT_BASE = "https://apiv1.bigwedgegolf.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

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
    orderBy: { createdAt: "desc" },
    select: { scraperConfig: true },
  });
  if (!conn)
    return { error: "No Analytics API connector. Add the Big Wedge admin JWT in Care → Connectors." };
  const cfg = (
    decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}
  ) as { baseUrl?: string; apiToken?: string };
  if (!cfg.apiToken) return { error: "The Analytics connector has no API token." };
  return { baseUrl: (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, ""), apiToken: cfg.apiToken };
}

export interface BigWedgeSyncResult {
  baseUrl: string;
  totalFetched: number;
  actionTakenCount: number;
  toMarkCount: number;
  markedCount: number;
  sample: Array<{ courseName: string; country: string | null }>;
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

  // Fetch course requests, collect action_taken IDs
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
      if (r.action_taken && r.id != null) actionTakenIds.add(String(r.id));
    }
    url = data.meta?.pagination?.next ?? data.next ?? null;
  }

  // Find our NEW/SENT records that match an action_taken request
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: {
      courseRequests: {
        where: { status: { in: ["NEW", "SENT"] }, externalRef: { startsWith: "bigwedge:" } },
        select: { id: true, courseName: true, country: true, externalRef: true },
      },
    },
  });

  const toMark = (wiki?.courseRequests ?? []).filter((r) => {
    const requestId = r.externalRef?.split(":")[1];
    return requestId && actionTakenIds.has(requestId);
  });

  const sample = toMark.slice(0, 20).map((r) => ({ courseName: r.courseName, country: r.country }));

  if (dryRun) {
    return { baseUrl: api.baseUrl, totalFetched, actionTakenCount: actionTakenIds.size, toMarkCount: toMark.length, markedCount: 0, sample, dryRun: true, errors };
  }

  const ids = toMark.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.clientCourseRequest.updateMany({ where: { id: { in: ids } }, data: { status: "ADDED" } });
  }

  return { baseUrl: api.baseUrl, totalFetched, actionTakenCount: actionTakenIds.size, toMarkCount: toMark.length, markedCount: ids.length, sample, dryRun: false, errors };
}
