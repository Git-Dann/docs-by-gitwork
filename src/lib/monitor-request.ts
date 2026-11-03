/**
 * Pure rules for how an HTTP monitor calls its target, and for reading two locations' results
 * as one. No I/O: the connector (src/server/wiki-monitors/http.ts), the second-location probe
 * route and the UI share these.
 */

export const MAX_HEADERS = 20;
export const MAX_HEADER_VALUE = 4000;
export const MAX_BODY = 20_000;

/**
 * Headers a check may not set. The HTTP client owns framing and routing (Host, lengths,
 * connection handling); letting a monitor set them breaks requests or smuggles them elsewhere.
 */
const BLOCKED = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "expect",
  "proxy-authorization",
  "proxy-connection",
]);

const NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * "Name: value" per line → a header map, or a sentence saying what's wrong. Blank lines are
 * ignored. Values keep everything after the first colon, so "Authorization: Bearer a:b" works.
 */
export function parseHeaderLines(text: string): { headers: Record<string, string>; error: string | null } {
  const headers: Record<string, string> = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const at = line.indexOf(":");
    if (at <= 0) return { headers: {}, error: `"${line.slice(0, 40)}" isn't a header. Use "Name: value".` };
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (!NAME_RE.test(name)) return { headers: {}, error: `"${name}" isn't a valid header name.` };
    if (BLOCKED.has(name.toLowerCase())) return { headers: {}, error: `${name} is set by Foundry and can't be changed.` };
    if (/[\r\n]/.test(value)) return { headers: {}, error: `${name} has a line break in its value.` };
    if (value.length > MAX_HEADER_VALUE) return { headers: {}, error: `${name} is too long.` };
    headers[name] = value;
  }
  if (Object.keys(headers).length > MAX_HEADERS) return { headers: {}, error: `Up to ${MAX_HEADERS} headers.` };
  return { headers, error: null };
}

/** A stored header map, checked again on read: anything that wouldn't pass now is dropped. */
export function cleanHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if (!NAME_RE.test(name) || BLOCKED.has(name.toLowerCase())) continue;
    if (/[\r\n]/.test(value) || value.length > MAX_HEADER_VALUE) continue;
    out[name] = value;
    if (Object.keys(out).length >= MAX_HEADERS) break;
  }
  return out;
}

/** "Basic …" for a username and password — what the UI's sign-in helper writes. */
export function basicAuthValue(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}

// ─── Two locations ────────────────────────────────────────────────────────────

export interface ProbeOutcome {
  status: "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
}

export interface RemoteOutcome extends ProbeOutcome {
  /** Where the second check ran, e.g. "Vercel iad1". */
  location: string;
}

/**
 * The result to record when Foundry's own server and a second location disagree.
 *
 * - Not DOWN locally → the local result stands (the second location is only asked on failure).
 * - Second location unavailable → the local DOWN stands. "Couldn't ask" is not "it's up".
 * - Both failed → DOWN, confirmed.
 * - Only Foundry's server failed → DEGRADED, never DOWN. The site answered someone, so it isn't
 *   an outage; a network problem between Foundry and the site is still worth showing, so it is
 *   amber rather than a silent UP. DEGRADED doesn't page and counts as up in uptime.
 */
export function combineLocations(local: ProbeOutcome, remote: RemoteOutcome | null): ProbeOutcome & { note: string | null } {
  if (local.status !== "DOWN") return { ...local, note: null };
  if (!remote || remote.status === "UNKNOWN") return { ...local, note: null };
  if (remote.status === "DOWN") {
    return { ...local, note: `Also failed from ${remote.location}`, error: `${local.error ?? "Failed"} · also failed from ${remote.location}` };
  }
  const answered = remote.latencyMs != null ? ` in ${remote.latencyMs}ms` : "";
  return {
    status: "DEGRADED",
    latencyMs: remote.latencyMs,
    statusCode: remote.statusCode,
    error: `Foundry's server couldn't reach it (${local.error ?? "failed"}), but ${remote.location} did${answered}. Probably a network problem between Foundry and the site, not an outage.`,
    note: `Reached from ${remote.location}`,
  };
}

/**
 * The form/API field: undefined keeps what's saved, null or blank clears, text is parsed.
 * Returns the map to store, or an error sentence.
 */
export function headersField(
  raw: string | null | undefined,
): { value: Record<string, string> | null | undefined; error: string | null } {
  if (raw === undefined) return { value: undefined, error: null };
  if (raw === null || !raw.trim()) return { value: null, error: null };
  const { headers, error } = parseHeaderLines(raw);
  return error ? { value: undefined, error } : { value: headers, error: null };
}
