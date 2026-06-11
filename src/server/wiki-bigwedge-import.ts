/**
 * wiki-bigwedge-import.ts — pull course requests from the Big Wedge Golf backend
 * API into the Wedge wiki's Course Requests tracker.
 *
 * Big Wedge users submit course requests in-app; they land on the Big Wedge API
 * (https://apiv1.bigwedgegolf.com/api/v1/course-requests/, DRF-paginated, admin
 * JWT bearer auth). Foundry already stores that admin JWT on the client's Care
 * "Analytics API" connector (scraperConfig.apiToken) — we reuse it here.
 *
 * One API request can carry several courses (`courses[]`, 1–10) under a shared
 * `country`, so we flatten to one tracker row per course. De-duped by externalRef
 * (bigwedge:<requestId>:<i>) and by course name (against non-rejected rows), so it
 * sits alongside the Gmail-imported requests and is safe to re-run for new ones.
 */

import { prisma } from "@/lib/prisma";
import { addCourseRequest, type CourseRequestRecord } from "@/server/wiki";
import { getJson } from "@/server/support-analytics/types";

const DEFAULT_BASE = "https://apiv1.bigwedgegolf.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 40;

interface BwCourse {
  id?: number | string;
  course_name?: string;
  name?: string;
  additional_details?: string | null;
}
interface BwRequest {
  id?: number | string;
  country?: string | null;
  action_taken?: boolean;
  created_at?: string;
  updated_at?: string;
  /** Actual field name in the Big Wedge API. */
  course_items?: BwCourse[];
  /** Tolerate alternative shape. */
  courses?: BwCourse[];
  [k: string]: unknown;
}
/** Big Wedge API wraps paginated responses in { data, meta.pagination } */
interface BwPage {
  // Big Wedge envelope shape
  data?: BwRequest[];
  meta?: { pagination?: { count?: number; next?: string | null } };
  // Standard DRF shape (fallback)
  count?: number;
  next?: string | null;
  results?: BwRequest[];
}

export interface BigWedgeImportResult {
  baseUrl: string;
  since: string;
  totalFetched: number;
  inWindow: number;
  created: CourseRequestRecord[];
  createdCount: number;
  skipped: number;
  dryRun: boolean;
  /** First raw API request object — surfaced on dryRun to confirm the live shape. */
  rawSample?: unknown;
  /** How the first in-window request flattens to tracker rows (dryRun aid). */
  mappedSample?: Array<{ courseName: string; country: string | null; status: string; externalRef: string }>;
  errors: string[];
}

/** Resolve the Big Wedge API base URL + admin token from the Care analytics connector. */
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
  if (!conn) {
    return { error: "No Analytics API connector on this client. Add the Big Wedge admin JWT in Care → Connectors." };
  }
  const cfg = (conn.scraperConfig ?? {}) as { baseUrl?: string; apiToken?: string };
  if (!cfg.apiToken) {
    return { error: "The Analytics connector has no API token. Paste the Big Wedge admin JWT in Care → Connectors." };
  }
  return { baseUrl: (cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, ""), apiToken: cfg.apiToken };
}

function courseName(c: BwCourse): string {
  return (c.course_name ?? c.name ?? "").toString().trim();
}

/**
 * Import Big Wedge course requests created on/after `since` (YYYY-MM-DD) into the
 * tracker. dryRun (default) reports counts + a sample of the live shape, writing
 * nothing.
 */
export async function importBigWedgeCourseRequests(
  workspaceClientId: string,
  opts: { since: string; dryRun?: boolean; apiToken?: string },
): Promise<BigWedgeImportResult | { error: string }> {
  let api: { baseUrl: string; apiToken: string };
  if (opts.apiToken) {
    api = { baseUrl: DEFAULT_BASE, apiToken: opts.apiToken };
  } else {
    const resolved = await resolveBigWedgeApi(workspaceClientId);
    if ("error" in resolved) return resolved;
    api = resolved;
  }

  const dryRun = opts.dryRun ?? true;
  const sinceMs = new Date(`${opts.since}T00:00:00Z`).getTime();
  const errors: string[] = [];

  // Newest-first so we can stop paging once we pass the `since` cutoff.
  let url: string | null =
    `${api.baseUrl}/api/v1/course-requests/?ordering=-created_at&page_size=${PAGE_SIZE}&page=1`;
  const fetched: BwRequest[] = [];
  let totalFetched = 0;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    let data: BwPage;
    try {
      data = await getJson<BwPage>(url, api.apiToken);
    } catch (err) {
      errors.push(`Fetch failed (page ${page + 1}): ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    // Handle both Big Wedge envelope shape (data/meta.pagination) and plain DRF (results/next)
    const results =
      data.data ?? data.results ?? (Array.isArray(data) ? (data as unknown as BwRequest[]) : []);
    totalFetched += results.length;
    fetched.push(...results);

    // Stop early once the oldest row on this page predates the window.
    const oldest = results[results.length - 1]?.created_at;
    if (oldest && new Date(oldest).getTime() < sinceMs) break;
    url = data.meta?.pagination?.next ?? data.next ?? null;
  }

  // Filter to the window (tolerate missing created_at by keeping it).
  const inWindowReqs = fetched.filter((r) => {
    if (!r.created_at) return true;
    return new Date(r.created_at).getTime() >= sinceMs;
  });

  // Flatten each request into one row per course.
  interface Row {
    courseName: string;
    country: string | null;
    notes: string;
    status: "NEW" | "ADDED";
    externalRef: string;
  }
  const rows: Row[] = [];
  for (const r of inWindowReqs) {
    const reqId = r.id ?? "?";
    // course_items is the actual API field; fall back to courses for forward compat
    const courses =
      (Array.isArray(r.course_items) && r.course_items.length ? r.course_items : null) ??
      (Array.isArray(r.courses) && r.courses.length ? r.courses : null) ??
      [{ course_name: "" }];
    courses.forEach((c, i) => {
      const name = courseName(c);
      if (!name) return;
      const submitted = r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
      const detail = (c.additional_details ?? "").toString().trim();
      const notes =
        `Via Big Wedge API${submitted ? ` (submitted ${submitted})` : ""}` + (detail ? `:\n${detail}` : "");
      rows.push({
        courseName: name,
        country: (r.country ?? "").toString().trim() || null,
        notes,
        // action_taken on their side → already handled → ADDED; else NEW.
        status: r.action_taken ? "ADDED" : "NEW",
        externalRef: `bigwedge:${reqId}:${c.id ?? i}`,
      });
    });
  }

  const mappedSample = rows.slice(0, 5).map((r) => ({
    courseName: r.courseName,
    country: r.country,
    status: r.status,
    externalRef: r.externalRef,
  }));

  if (dryRun) {
    return {
      baseUrl: api.baseUrl,
      since: opts.since,
      totalFetched,
      inWindow: inWindowReqs.length,
      created: [],
      createdCount: 0,
      skipped: 0,
      dryRun: true,
      rawSample: fetched[0] ?? null,
      mappedSample,
      errors,
    };
  }

  // Dedupe against existing rows on this wiki.
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: { courseRequests: { select: { courseName: true, externalRef: true, status: true } } },
  });
  const seenRefs = new Set((wiki?.courseRequests ?? []).map((r) => r.externalRef).filter((x): x is string => !!x));
  const seenNames = new Set(
    (wiki?.courseRequests ?? [])
      .filter((r) => r.status !== "REJECTED")
      .map((r) => r.courseName.trim().toLowerCase())
      .filter(Boolean),
  );

  const created: CourseRequestRecord[] = [];
  let skipped = 0;
  for (const row of rows) {
    const nameKey = row.courseName.toLowerCase();
    if (seenRefs.has(row.externalRef) || seenNames.has(nameKey)) {
      skipped++;
      continue;
    }
    created.push(
      await addCourseRequest(workspaceClientId, {
        courseName: row.courseName,
        country: row.country,
        notes: row.notes,
        status: row.status,
        source: "bigwedge-api",
        externalRef: row.externalRef,
      }),
    );
    seenRefs.add(row.externalRef);
    seenNames.add(nameKey);
  }

  return {
    baseUrl: api.baseUrl,
    since: opts.since,
    totalFetched,
    inWindow: inWindowReqs.length,
    created,
    createdCount: created.length,
    skipped,
    dryRun: false,
    rawSample: fetched[0] ?? null,
    mappedSample,
    errors,
  };
}
