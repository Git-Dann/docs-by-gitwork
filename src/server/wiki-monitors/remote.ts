// The second check location. When a monitor fails from Foundry's own server, the same check is
// run from somewhere else before anyone is told: a site that only Foundry can't reach is a
// network problem between us, not an outage (combineLocations in src/lib/monitor-request.ts).
//
// The other location is this same app deployed elsewhere (Vercel, a different network and
// region), answering POST /api/monitor-probe. Configured by two env vars on the VPS:
//   MONITOR_REMOTE_PROBE_URL  e.g. https://foundry-by-gitwork.vercel.app/api/monitor-probe
//   MONITOR_PROBE_SECRET      shared with the other deployment
// Unset → no second opinion, and checks behave exactly as before.

import { timingSafeEqual } from "node:crypto";
import type { WikiMonitor } from "@prisma/client";
import type { RemoteOutcome } from "@/lib/monitor-request";
import { httpSpecFor, type HttpProbeSpec } from "./http";

const REMOTE_TIMEOUT_MS = 25_000;

export type RemoteProbeRequest =
  | ({ type: "HTTP" } & HttpProbeSpec)
  | { type: "TCP"; target: string };

export function remoteProbeConfigured(): boolean {
  return !!process.env.MONITOR_REMOTE_PROBE_URL && !!process.env.MONITOR_PROBE_SECRET;
}

/** Constant-time check of the shared secret on the receiving side. */
export function probeSecretMatches(header: string | null): boolean {
  const secret = process.env.MONITOR_PROBE_SECRET;
  if (!secret || !header) return false;
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Where this deployment is, for the answer it gives. */
export function probeLocation(): string {
  if (process.env.MONITOR_PROBE_LOCATION) return process.env.MONITOR_PROBE_LOCATION;
  if (process.env.VERCEL_REGION) return `a second location (Vercel ${process.env.VERCEL_REGION})`;
  return "a second location";
}

export function remoteRequestFor(monitor: WikiMonitor): RemoteProbeRequest | null {
  if (monitor.type === "HTTP") return { type: "HTTP", ...httpSpecFor(monitor) };
  if (monitor.type === "TCP") return { type: "TCP", target: monitor.target };
  return null; // a heartbeat has nothing to fetch
}

/**
 * Ask the second location. Null when it isn't configured, doesn't answer, or answers nonsense —
 * the caller then keeps its own result. Never throws.
 */
export async function remoteProbe(monitor: WikiMonitor): Promise<RemoteOutcome | null> {
  if (!remoteProbeConfigured()) return null;
  const request = remoteRequestFor(monitor);
  if (!request) return null;
  try {
    const res = await fetch(process.env.MONITOR_REMOTE_PROBE_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.MONITOR_PROBE_SECRET}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Partial<RemoteOutcome> } & Partial<RemoteOutcome>;
    const r = (json.data ?? json) as Partial<RemoteOutcome>;
    if (r.status !== "UP" && r.status !== "DEGRADED" && r.status !== "DOWN") return null;
    return {
      status: r.status,
      latencyMs: typeof r.latencyMs === "number" ? r.latencyMs : null,
      statusCode: typeof r.statusCode === "number" ? r.statusCode : null,
      error: typeof r.error === "string" ? r.error : null,
      location: typeof r.location === "string" && r.location ? r.location.slice(0, 80) : "a second location",
    };
  } catch (err) {
    console.warn("[wiki-monitors] second location didn't answer", err instanceof Error ? err.message : err);
    return null;
  }
}
