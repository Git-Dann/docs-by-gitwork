/**
 * bigwedge-course-api.ts — READ-ONLY reader for the Big Wedge course-data backend
 * (github.com/Git-Dann/wedge-course-backend). Pulls the platform's own aggregate
 * endpoints (`/api/v1/stats/`, `/sources/`, `/activity/`) and surfaces them inside
 * the Foundry Golf Data console.
 *
 * NON-NEGOTIABLE: this module only ever GETs. It never writes to the course
 * backend or anywhere else — the console is a viewer.
 *
 * Auth — the course backend issues short-lived (12h) JWTs, so a stored static
 * token would expire. Precedence, in order:
 *   1. env `WEDGE_COURSE_API_USER` + `WEDGE_COURSE_API_PASSWORD` → Foundry mints a
 *      FRESH access token per pull via `POST /api/v1/auth/token/` (never expires out).
 *   2. the Big Wedge admin JWT from the Care → Connectors "Analytics API" connector.
 *   3. no token (works only if the backend runs with `REQUIRE_AUTH=false`).
 * Base URL: env `WEDGE_COURSE_API_URL` wins, else the connector's base URL.
 */

import { getJson } from "@/server/support-analytics/types";
import { resolveBigWedgeApi } from "@/server/wiki-bigwedge-sync";

/** Mint a fresh access token from username/password. Returns null on failure. */
async function mintCourseToken(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Foundry/1.0" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access?: string };
    return json.access ?? null;
  } catch {
    return null;
  }
}

/** Resolve { baseUrl, token } for the course backend per the precedence above. */
async function resolveCourseApi(
  workspaceClientId: string,
): Promise<{ baseUrl: string; token?: string } | { error: string }> {
  const envUrl = process.env.WEDGE_COURSE_API_URL?.trim();
  const envUser = process.env.WEDGE_COURSE_API_USER?.trim();
  const envPass = process.env.WEDGE_COURSE_API_PASSWORD?.trim();

  // Connector is optional when an env URL is configured.
  const connector = await resolveBigWedgeApi(workspaceClientId);
  const connectorOk = !("error" in connector);

  const baseUrl = (envUrl || (connectorOk ? connector.baseUrl : "")).replace(/\/$/, "");
  if (!baseUrl) {
    return { error: "error" in connector ? connector.error : "No course backend URL configured." };
  }

  // 1) mint from env creds
  if (envUser && envPass) {
    const token = await mintCourseToken(baseUrl, envUser, envPass);
    if (token) return { baseUrl, token };
    return { error: `Login to ${baseUrl}/api/v1/auth/token/ failed (check WEDGE_COURSE_API_USER/PASSWORD).` };
  }
  // 2) static connector token, or 3) no token (open backend)
  return { baseUrl, token: connectorOk ? connector.apiToken : undefined };
}

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

export async function getCourseBackendData(workspaceClientId: string): Promise<CourseBackendData> {
  const resolved = await resolveCourseApi(workspaceClientId);
  if ("error" in resolved) {
    return { connected: false, baseUrl: null, error: resolved.error, stats: null, sources: null, activity: [] };
  }

  const { baseUrl, token } = resolved;

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
