// DNS TTL, as far as it can be observed from outside.
//
// The old check was a hard-coded PASS that never resolved anything. A public resolver
// reports the time its CACHED copy has LEFT, which counts down from the configured TTL,
// so a reading is a lower bound: 300 seconds left proves the zone's TTL is at least 300.
// A low reading proves nothing (it may be a 3600-second record about to expire), so the
// only verdicts the evidence supports are PASS (comfortably above near-zero) and
// INCONCLUSIVE. Two independent resolvers are asked and the larger reading kept, which
// makes a misleadingly low reading from one ageing cache less likely.

import type { PulseScanCheckInput } from "@/types/pulse";
import type { CheckCategory } from "./categories";
import { fetchWithTimeout } from "./_types";

export type TtlObservation =
  | { ok: true; ttl: number | null; resolvers: number }
  | { ok: false; reason: string };

/** The near-zero line. Below a minute, every visit pays for a fresh lookup. */
export const NEAR_ZERO_TTL_SECONDS = 60;

const RESOLVERS = [
  (name: string) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=A`,
  (name: string) => `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=A`,
];

/** TTL of the first answer (the host's own A or CNAME record) from one resolver, or why not. */
async function readTtl(url: string): Promise<{ ok: true; ttl: number | null } | { ok: false; reason: string }> {
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/dns-json" } });
    if (!res.ok) return { ok: false, reason: `DNS resolver returned HTTP ${res.status}` };
    const json = await res.json() as { Status?: number; Answer?: { TTL?: number }[] };
    // NOERROR (0) and NXDOMAIN (3) are answers; anything else means the lookup did not complete.
    if (typeof json.Status === "number" && json.Status !== 0 && json.Status !== 3) {
      return { ok: false, reason: `DNS resolver returned rcode ${json.Status}` };
    }
    const ttl = json.Answer?.[0]?.TTL;
    return { ok: true, ttl: typeof ttl === "number" && Number.isFinite(ttl) ? ttl : null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "DNS lookup failed" };
  }
}

/** The larger remaining-TTL reading across the resolvers that answered. */
export async function observeDnsTtl(hostname: string): Promise<TtlObservation> {
  const readings = await Promise.all(RESOLVERS.map((build) => readTtl(build(hostname))));
  const answered = readings.filter((r): r is { ok: true; ttl: number | null } => r.ok);
  if (answered.length === 0) {
    const failed = readings.find((r): r is { ok: false; reason: string } => !r.ok);
    return { ok: false, reason: failed?.reason ?? "DNS lookup failed" };
  }
  const ttls = answered.map((r) => r.ttl).filter((t): t is number => t !== null);
  return { ok: true, ttl: ttls.length ? Math.max(...ttls) : null, resolvers: answered.length };
}

/** The verdict the observation supports for "DNS TTL not near-zero". */
export function dnsTtlVerdict(
  base: { category: CheckCategory; checkKey: string; label: string },
  hostname: string,
  obs: TtlObservation,
): PulseScanCheckInput {
  if (!obs.ok) {
    return { ...base, status: "INCONCLUSIVE", confidence: "LOW", detail: `The DNS lookup for ${hostname} did not complete (${obs.reason}), so its TTL could not be read.` };
  }
  if (obs.ttl === null) {
    return { ...base, status: "INCONCLUSIVE", confidence: "LOW", detail: `No address record for ${hostname} came back from the resolvers, so its TTL could not be read.` };
  }
  if (obs.ttl >= NEAR_ZERO_TTL_SECONDS) {
    return {
      ...base,
      status: "PASS",
      confidence: "HIGH",
      detail: `A public resolver's cached copy of ${hostname} had ${obs.ttl} seconds left, so the record's TTL is at least ${obs.ttl} seconds, well above the near-zero range where every visit pays for a fresh lookup.`,
    };
  }
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    confidenceReason: "A resolver reports the time its cached copy has left, not the TTL the zone sets.",
    detail: `A public resolver's cached copy of ${hostname} had only ${obs.ttl} seconds left. That is either a near-zero TTL or a longer one close to expiring, and the two cannot be told apart from outside. Check the TTL set in your DNS zone: 300 to 3600 seconds suits most production records.`,
  };
}
