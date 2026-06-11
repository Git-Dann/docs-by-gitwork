/**
 * wiki-bigwedge-sync.ts — cross-reference course requests against the Big Wedge
 * courses database and mark any that already exist there as ADDED.
 *
 * Two matching signals are combined:
 *   1. Course-name match — fetch all 18k+ courses, normalise names, check our
 *      tracked requests against the set. Handles the common case where Big Wedge
 *      added the course without ever setting action_taken.
 *   2. action_taken flag — re-fetch course requests; any with action_taken=true
 *      are also marked ADDED (belt-and-braces).
 */

import { prisma } from "@/lib/prisma";
import { getJson } from "@/server/support-analytics/types";
import { decryptScraperConfig } from "@/server/support";

const DEFAULT_BASE = "https://apiv1.bigwedgegolf.com";
const PAGE_SIZE = 100;
const MAX_COURSE_PAGES = 200; // 20,000 courses max
const MAX_REQUEST_PAGES = 100; // 10,000 requests max

// ── Normalise a course/club name for fuzzy matching ──────────────────────────
function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(
      /\b(golf club|golf course|golf resort|golf links|country club|golf & country club|golf and country club|golf)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// ── Big Wedge API types ───────────────────────────────────────────────────────
interface BwCourse {
  name?: string;
  club?: { name?: string; country?: string };
}
interface BwCoursePage {
  count?: number;
  next?: string | null;
  results?: BwCourse[];
}

interface BwRequest {
  id?: string | number;
  action_taken?: boolean;
  [k: string]: unknown;
}
interface BwRequestPage {
  data?: BwRequest[];
  meta?: { pagination?: { next?: string | null } };
  results?: BwRequest[];
  next?: string | null;
}

// ── Resolve API credentials from the Care Analytics connector ────────────────
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
    return {
      error: "No Analytics API connector. Add the Big Wedge admin JWT in Care → Connectors.",
    };
  const cfg = (
    decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}
  ) as { baseUrl?: string; apiToken?: string };
  if (!cfg.apiToken) return { error: "The Analytics connector has no API token." };
  return { baseUrl: (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, ""), apiToken: cfg.apiToken };
}

// ── Fetch all course names from the Big Wedge courses endpoint ───────────────
async function fetchCourseNameSet(
  api: { baseUrl: string; apiToken: string },
  errors: string[],
): Promise<{ nameSet: Set<string>; totalCourses: number }> {
  const nameSet = new Set<string>();
  let url: string | null = `${api.baseUrl}/api/v1/courses/?page_size=${PAGE_SIZE}`;
  let totalCourses = 0;

  for (let page = 0; page < MAX_COURSE_PAGES && url; page++) {
    let data: BwCoursePage;
    try {
      data = await getJson<BwCoursePage>(url, api.apiToken);
    } catch (err) {
      errors.push(
        `Courses fetch failed (page ${page + 1}): ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }

    if (page === 0) totalCourses = data.count ?? 0;

    for (const c of data.results ?? []) {
      if (c.name) {
        nameSet.add(norm(c.name));
        // Also index the club name — our requests often use the club name
        if (c.club?.name) nameSet.add(norm(c.club.name));
      }
    }

    url = data.next ?? null;
  }

  return { nameSet, totalCourses };
}

export interface BigWedgeSyncResult {
  baseUrl: string;
  totalCourses: number;
  totalRequestsFetched: number;
  /** Matched by course-name lookup against the courses database. */
  nameMatchCount: number;
  /** Matched by action_taken=true on the course-requests endpoint. */
  actionTakenCount: number;
  /** Combined unique records to mark ADDED. */
  toMarkCount: number;
  markedCount: number;
  /** Up to 20 records that were/would be marked ADDED. */
  sample: Array<{ courseName: string; country: string | null; matchedBy: "name" | "action_taken" }>;
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

  // ── 1. Fetch all courses → normalised name set ───────────────────────────
  const { nameSet, totalCourses } = await fetchCourseNameSet(api, errors);

  // ── 2. Fetch course-requests → action_taken lookup ───────────────────────
  const actionTakenIds = new Set<string>();
  let reqUrl: string | null =
    `${api.baseUrl}/api/v1/course-requests/?ordering=-created_at&page_size=${PAGE_SIZE}&page=1`;
  let totalRequestsFetched = 0;

  for (let page = 0; page < MAX_REQUEST_PAGES && reqUrl; page++) {
    let data: BwRequestPage;
    try {
      data = await getJson<BwRequestPage>(reqUrl, api.apiToken);
    } catch (err) {
      errors.push(
        `Requests fetch failed (page ${page + 1}): ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }
    const results =
      data.data ??
      data.results ??
      (Array.isArray(data) ? (data as unknown as BwRequest[]) : []);
    totalRequestsFetched += results.length;
    for (const r of results) {
      if (r.action_taken && r.id != null) actionTakenIds.add(String(r.id));
    }
    reqUrl = data.meta?.pagination?.next ?? data.next ?? null;
  }

  // ── 3. Load our tracked NEW/SENT records ─────────────────────────────────
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: {
      courseRequests: {
        where: { status: { in: ["NEW", "SENT"] } },
        select: { id: true, courseName: true, country: true, externalRef: true },
      },
    },
  });
  const candidates = wiki?.courseRequests ?? [];

  // ── 4. Match ─────────────────────────────────────────────────────────────
  const toMarkMap = new Map<string, { courseName: string; country: string | null; matchedBy: "name" | "action_taken" }>();

  for (const r of candidates) {
    const normalised = norm(r.courseName);
    if (normalised && nameSet.has(normalised)) {
      toMarkMap.set(r.id, { courseName: r.courseName, country: r.country, matchedBy: "name" });
    }
  }

  // action_taken signal — only applies to records imported via the API (have externalRef)
  for (const r of candidates) {
    if (!r.externalRef) continue;
    const requestId = r.externalRef.split(":")[1];
    if (requestId && actionTakenIds.has(requestId) && !toMarkMap.has(r.id)) {
      toMarkMap.set(r.id, { courseName: r.courseName, country: r.country, matchedBy: "action_taken" });
    }
  }

  const toMark = [...toMarkMap.entries()].map(([id, meta]) => ({ id, ...meta }));
  const nameMatchCount = toMark.filter((r) => r.matchedBy === "name").length;
  const actionTakenMatchCount = toMark.filter((r) => r.matchedBy === "action_taken").length;

  const sample = toMark.slice(0, 20).map((r) => ({
    courseName: r.courseName,
    country: r.country,
    matchedBy: r.matchedBy,
  }));

  if (dryRun) {
    return {
      baseUrl: api.baseUrl,
      totalCourses,
      totalRequestsFetched,
      nameMatchCount,
      actionTakenCount: actionTakenMatchCount,
      toMarkCount: toMark.length,
      markedCount: 0,
      sample,
      dryRun: true,
      errors,
    };
  }

  // ── 5. Write ─────────────────────────────────────────────────────────────
  const ids = toMark.map((r) => r.id);
  if (ids.length > 0) {
    await prisma.clientCourseRequest.updateMany({
      where: { id: { in: ids } },
      data: { status: "ADDED" },
    });
  }

  return {
    baseUrl: api.baseUrl,
    totalCourses,
    totalRequestsFetched,
    nameMatchCount,
    actionTakenCount: actionTakenMatchCount,
    toMarkCount: toMark.length,
    markedCount: ids.length,
    sample,
    dryRun: false,
    errors,
  };
}
