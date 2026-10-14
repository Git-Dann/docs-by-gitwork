/**
 * wiki-bigwedge-import.ts — pull course requests from the Big Wedge Golf backend
 * API into the Wedge wiki's Course Requests tracker.
 *
 * Big Wedge users submit course requests in-app; they land on the Big Wedge API
 * (https://apiv1.bigwedgegolf.com/api/v1/course-requests/, DRF-paginated, JWT bearer).
 * Foundry logs in for itself on each run — see bigwedge-api-auth.ts. Run hourly by
 * src/server/wedge-course-feed.ts; this file is the fetch + write, that one the schedule.
 *
 * One API request can carry several courses (`courses[]`, 1–10) under a shared
 * `country`, so we flatten to one tracker row per course. De-duped by externalRef
 * (bigwedge:<requestId>:<i>), so it is safe to re-run over an overlapping window.
 */

import { prisma } from "@/lib/prisma";
import { addCourseRequest, type CourseRequestRecord } from "@/server/wiki";
import { getJson } from "@/server/support-analytics/types";
// ⚠️ The shared resolver — this file used to carry its own copy, which read the stored token
// WITHOUT decrypting it and so sent `enc:{…}` as the bearer once secrets were encrypted.
import { resolveBigWedgeApi } from "@/server/wiki-bigwedge-sync";
import { isDuplicateFeedRow } from "@/lib/wedge-course-feed-status";

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
    submittedAt: string | null;
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
        submittedAt: r.created_at ?? null,
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

  // Dedupe against existing rows on this wiki — see isDuplicateFeedRow for why a name
  // match only counts against rows from another source, and only before the email feed ended.
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId: workspaceClientId },
    select: { courseRequests: { select: { courseName: true, externalRef: true, status: true, source: true } } },
  });
  const existing = wiki?.courseRequests ?? [];
  const refs = new Set(existing.map((r) => r.externalRef).filter((x): x is string => !!x));
  const namesFromOtherSources = new Set(
    existing
      .filter((r) => r.status !== "REJECTED" && r.source !== "bigwedge-api")
      .map((r) => r.courseName.trim().toLowerCase())
      .filter(Boolean),
  );

  const created: CourseRequestRecord[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (isDuplicateFeedRow(row, { refs, namesFromOtherSources })) {
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
    refs.add(row.externalRef);
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
