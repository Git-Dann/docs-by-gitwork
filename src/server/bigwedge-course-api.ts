/**
 * bigwedge-course-api.ts — READ-ONLY reader for the Big Wedge course-data backend
 * (github.com/Git-Dann/wedge-course-backend). Pulls the platform's own aggregate
 * endpoints (`/api/v1/stats/`, `/sources/`, `/activity/`) and surfaces them inside
 * the Foundry Golf Data console.
 *
 * NON-NEGOTIABLE: this module only ever GETs. It never writes to the course
 * backend or anywhere else — the console is a viewer.
 *
 * Auth reuses the Big Wedge admin JWT from the Care → Connectors "Analytics API"
 * connector (same token the course-request sync uses). The course backend is a
 * separate service from the main app API, so its base URL can be overridden with
 * `WEDGE_COURSE_API_URL` (env); otherwise it falls back to the connector base URL.
 */

import { getJson } from "@/server/support-analytics/types";
import { resolveBigWedgeApi } from "@/server/wiki-bigwedge-sync";

export interface CourseBackendStats {
  courses: number;
  clubs: number;
  with_gps: number;
  gps_points: number;
  holes: number;
  tees: number;
  countries: number;
  missing_gps: number;
  missing_tees: number;
  with_image: number;
  with_description: number;
  with_architect: number;
  with_year: number;
  with_rating: number;
  complete: number;
  by_country: Array<{ country: string; count: number; gps: number }>;
  hole_distribution: Record<string, number>;
}

export interface CourseBackendActivity {
  id: number;
  source: string;
  event_type: string;
  records_affected: number;
  skipped: number;
  errors: number;
  triggered_by: string;
  created_at: string;
}

export interface CourseBackendData {
  connected: boolean;
  baseUrl: string | null;
  error: string | null;
  stats: CourseBackendStats | null;
  /** Per-source course counts (golfapi.io, openstreetmap, …) + `_total`. */
  sources: Record<string, number> | null;
  activity: CourseBackendActivity[];
}

function courseApiBaseUrl(connectorBaseUrl: string): string {
  const override = process.env.WEDGE_COURSE_API_URL?.trim();
  return (override || connectorBaseUrl).replace(/\/$/, "");
}

export async function getCourseBackendData(workspaceClientId: string): Promise<CourseBackendData> {
  const resolved = await resolveBigWedgeApi(workspaceClientId);
  if ("error" in resolved) {
    return { connected: false, baseUrl: null, error: resolved.error, stats: null, sources: null, activity: [] };
  }

  const baseUrl = courseApiBaseUrl(resolved.baseUrl);
  const token = resolved.apiToken;

  // Stats is the primary signal — if it fails, we're not connected. Sources +
  // activity are best-effort (older backends may not expose them).
  let stats: CourseBackendStats | null = null;
  try {
    stats = await getJson<CourseBackendStats>(`${baseUrl}/api/v1/stats/`, token);
  } catch (err) {
    return {
      connected: false,
      baseUrl,
      error: err instanceof Error ? err.message : String(err),
      stats: null,
      sources: null,
      activity: [],
    };
  }

  const [sources, activity] = await Promise.all([
    getJson<Record<string, number>>(`${baseUrl}/api/v1/sources/`, token).catch(() => null),
    getJson<CourseBackendActivity[]>(`${baseUrl}/api/v1/activity/?limit=20`, token).catch(() => []),
  ]);

  return {
    connected: true,
    baseUrl,
    error: null,
    stats,
    sources,
    activity: Array.isArray(activity) ? activity.slice(0, 20) : [],
  };
}
