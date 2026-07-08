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

/** The deployed Big Wedge course backend (Vercel). Non-secret; override with env. */
const DEFAULT_COURSE_API_URL = "https://wedge-course-backend.vercel.app";

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

  const baseUrl = (envUrl || (connectorOk ? connector.baseUrl : "") || DEFAULT_COURSE_API_URL).replace(/\/$/, "");

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

// ── Integrations catalogue (connectors that feed / enrich the course data) ──────

/** Backend `run_job` accepts only these job keys (POST /api/v1/jobs/run/). */
type JobKey =
  | "osm"
  | "wikidata"
  | "google_places"
  | "postcodes_io"
  | "nominatim"
  | "england_golf"
  | "usga"
  | "seed_osm";

interface IntegrationDef {
  /** Source key as it appears in /sources + /cron-status. */
  key: string;
  label: string;
  type: "paid" | "open" | "free";
  provides: string[];
  needsKey: boolean;
  /** Manual-trigger job key, or null when it only runs on the backend's cron. */
  jobKey: JobKey | null;
  role: "spine" | "enrichment" | "seed";
}

/** The connectors, in display order. golfapi.io is the paid spine; the rest enrich. */
export const INTEGRATION_CATALOG: IntegrationDef[] = [
  { key: "golfapi.io", label: "golfapi.io", type: "paid", provides: ["GPS", "Tees", "Par", "Holes", "Coordinates"], needsKey: true, jobKey: null, role: "spine" },
  { key: "openstreetmap", label: "OpenStreetMap", type: "open", provides: ["Coordinates", "GPS"], needsKey: false, jobKey: "osm", role: "enrichment" },
  { key: "wikidata", label: "Wikidata / Wikipedia", type: "open", provides: ["Architect", "Year opened", "Wikipedia"], needsKey: false, jobKey: "wikidata", role: "enrichment" },
  { key: "wikipedia", label: "Wikipedia", type: "open", provides: ["Descriptions", "Images"], needsKey: false, jobKey: null, role: "enrichment" },
  { key: "wikimedia_commons", label: "Wikimedia Commons", type: "open", provides: ["Images"], needsKey: false, jobKey: null, role: "enrichment" },
  { key: "google_places", label: "Google Places", type: "free", provides: ["Website", "Phone", "Rating", "Hours"], needsKey: false, jobKey: "google_places", role: "enrichment" },
  { key: "nominatim", label: "Nominatim", type: "open", provides: ["Coordinates"], needsKey: false, jobKey: "nominatim", role: "enrichment" },
  { key: "photon", label: "Photon (Komoot)", type: "open", provides: ["Coordinates"], needsKey: false, jobKey: null, role: "enrichment" },
  { key: "dbpedia", label: "DBpedia", type: "open", provides: ["Architect", "Year opened", "Description"], needsKey: false, jobKey: null, role: "enrichment" },
  { key: "elevation", label: "Open-Elevation", type: "open", provides: ["Elevation"], needsKey: false, jobKey: null, role: "enrichment" },
  { key: "postcodes_io", label: "Postcodes.io", type: "open", provides: ["Postcodes"], needsKey: false, jobKey: "postcodes_io", role: "enrichment" },
  { key: "england_golf", label: "England Golf", type: "free", provides: ["SSS", "Par"], needsKey: true, jobKey: "england_golf", role: "enrichment" },
  { key: "usga_ghin", label: "USGA / GHIN", type: "free", provides: ["Course rating", "Slope"], needsKey: true, jobKey: "usga", role: "enrichment" },
  { key: "yelp", label: "Yelp Fusion", type: "free", provides: ["Ratings", "Reviews", "Photos"], needsKey: true, jobKey: null, role: "enrichment" },
  { key: "here_geocoding", label: "HERE Geocoding", type: "free", provides: ["Geocoding"], needsKey: true, jobKey: null, role: "enrichment" },
  { key: "opencage", label: "OpenCage", type: "free", provides: ["Geocoding", "Timezone"], needsKey: true, jobKey: null, role: "enrichment" },
  { key: "golfcourseapi", label: "GolfCourseAPI.com", type: "free", provides: ["Par", "Yardage", "Slope"], needsKey: true, jobKey: null, role: "enrichment" },
  { key: "openstreetmap_seed", label: "OSM Course Seeder", type: "open", provides: ["Net-new courses"], needsKey: false, jobKey: "seed_osm", role: "seed" },
  { key: "driving_ranges", label: "OSM Driving Ranges", type: "open", provides: ["Ranges", "Mini golf"], needsKey: false, jobKey: null, role: "seed" },
];

export interface CourseIntegration extends IntegrationDef {
  /** Courses attributed to this source (from /sources), or null if not tracked. */
  coverage: number | null;
  lastRun: {
    recordsAffected: number;
    skipped: number;
    errors: number;
    eventType: string;
    triggeredBy: string;
    createdAt: string;
  } | null;
  status: "active" | "needs-key" | "idle";
}

export interface CourseIntegrationsData {
  connected: boolean;
  baseUrl: string | null;
  error: string | null;
  total: number;
  integrations: CourseIntegration[];
}

interface CronEvent {
  records_affected: number;
  skipped: number;
  errors: number;
  event_type: string;
  triggered_by: string;
  created_at: string;
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

/** Read-only monitor of all connectors: coverage (/sources) + last run (/cron-status). */
export async function getCourseIntegrations(workspaceClientId: string): Promise<CourseIntegrationsData> {
  const resolved = await resolveCourseApi(workspaceClientId);
  if ("error" in resolved) {
    return { connected: false, baseUrl: null, error: resolved.error, total: 0, integrations: [] };
  }
  const { baseUrl, token } = resolved;

  let sources: Record<string, number> | null = null;
  try {
    sources = await getJson<Record<string, number>>(`${baseUrl}/api/v1/sources/`, token);
  } catch (err) {
    return {
      connected: false,
      baseUrl,
      error: err instanceof Error ? err.message : String(err),
      total: 0,
      integrations: [],
    };
  }
  const cron: Record<string, CronEvent> = await getJson<Record<string, CronEvent>>(
    `${baseUrl}/api/v1/cron-status/`,
    token,
  ).catch(() => ({}));

  // Seeders report per-region in cron-status (osm_seed_uk, …); fold them into the
  // single OSM-seed card by taking the most recent regional run.
  const seedKeys = Object.keys(cron).filter((k) => k.startsWith("osm_seed"));
  const latestSeed = seedKeys
    .map((k) => cron[k])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

  const integrations: CourseIntegration[] = INTEGRATION_CATALOG.map((def) => {
    const coverage = sources && def.key in sources ? sources[def.key] : null;
    let ev: CronEvent | undefined = cron[def.key];
    if (!ev && def.key === "openstreetmap_seed") ev = latestSeed;
    if (!ev && def.key === "driving_ranges") ev = cron["driving_ranges_seed"];

    const lastRun = ev
      ? {
          recordsAffected: ev.records_affected ?? 0,
          skipped: ev.skipped ?? 0,
          errors: ev.errors ?? 0,
          eventType: ev.event_type ?? "enrichment",
          triggeredBy: ev.triggered_by ?? "system",
          createdAt: ev.created_at,
        }
      : null;

    const status: CourseIntegration["status"] =
      lastRun ? "active" : def.needsKey ? "needs-key" : "idle";

    return { ...def, coverage, lastRun, status };
  });

  return {
    connected: true,
    baseUrl,
    error: null,
    total: sources?._total ?? 0,
    integrations,
  };
}

export interface RunJobResult {
  ok: boolean;
  job: string;
  enriched?: number;
  skipped?: number;
  errors?: number;
  seeded?: number;
  detail?: string;
}

/** Trigger an enrichment/seed job on the backend (writes to the COURSE backend, not Foundry). */
export async function runCourseJob(
  workspaceClientId: string,
  job: string,
  batch = 50,
): Promise<RunJobResult> {
  const allowed = INTEGRATION_CATALOG.some((d) => d.jobKey === job);
  if (!allowed) return { ok: false, job, detail: `Job "${job}" is not runnable.` };

  const resolved = await resolveCourseApi(workspaceClientId);
  if ("error" in resolved) return { ok: false, job, detail: resolved.error };
  const { baseUrl, token } = resolved;

  try {
    const res = await fetch(`${baseUrl}/api/v1/jobs/run/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Foundry/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ job, batch }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, job, detail: String(data.detail ?? `HTTP ${res.status}`) };
    }
    return {
      ok: true,
      job,
      enriched: typeof data.enriched === "number" ? data.enriched : undefined,
      skipped: typeof data.skipped === "number" ? data.skipped : undefined,
      errors: typeof data.errors === "number" ? data.errors : undefined,
      seeded: typeof data.seeded === "number" ? data.seeded : undefined,
    };
  } catch (err) {
    return { ok: false, job, detail: err instanceof Error ? err.message : String(err) };
  }
}
