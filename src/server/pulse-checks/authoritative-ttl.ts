// ─────────────────────────────────────────────────────────────────────────────
// DNS TTL, ASKED OF THE DOMAIN'S OWN NAME SERVERS.
//
// A public resolver reports how long ITS cached copy has left, which is only a lower
// bound on the TTL the domain publishes. That is why `dns_ttl_healthy` was withheld:
// a TTL that is too long could never be established from a recursive answer. The
// zone's authoritative name servers answer with the configured TTL itself, so they
// are asked directly.
//
// A long TTL on the record a site is served from means a change of host (a failover,
// a migration, an emergency move off a provider) takes that long to reach everyone.
// Over a day is the point most DNS guidance draws the line. The near-zero side is
// `dns_ttl_optimized`.
// ─────────────────────────────────────────────────────────────────────────────

import { createSocket } from "node:dgram";
import { Resolver } from "node:dns/promises";
import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES } from "./categories";

export const LONG_TTL_SECONDS = 86_400;
const TIMEOUT_MS = 3_000;

export type AuthoritativeTtl =
  /** `record` is A for an address, CNAME when the name points at another host (its own TTL governs a change of target). */
  | { kind: "ttl"; ttl: number; record: "A" | "CNAME"; server: string; zone: string }
  | { kind: "unknown"; reason: string };

export interface DnsAnswer { type: number; ttl: number }

/** Build a one-question DNS query (RFC 1035 §4.1) with recursion NOT desired. */
export function buildQuery(id: number, name: string, type = 1): Buffer {
  const labels = name.replace(/\.$/, "").split(".").map((l) => {
    const b = Buffer.from(l, "ascii");
    return Buffer.concat([Buffer.from([b.length]), b]);
  });
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0000, 2); // standard query, RD=0
  header.writeUInt16BE(1, 4); // QDCOUNT
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(type, 0);
  tail.writeUInt16BE(1, 2); // IN
  return Buffer.concat([header, ...labels, Buffer.from([0]), tail]);
}

function skipName(buf: Buffer, offset: number): number {
  for (let i = 0; i < 128; i++) {
    const len = buf[offset];
    if (len === undefined) throw new Error("truncated name");
    if ((len & 0xc0) === 0xc0) return offset + 2; // compression pointer
    if (len === 0) return offset + 1;
    offset += len + 1;
  }
  throw new Error("name too long");
}

/** Parse a response's answer section: each record's type and TTL. */
export function parseAnswers(buf: Buffer, id: number): { rcode: number; truncated: boolean; answers: DnsAnswer[] } {
  if (buf.length < 12 || buf.readUInt16BE(0) !== id) throw new Error("not our answer");
  const flags = buf.readUInt16BE(2);
  const qd = buf.readUInt16BE(4);
  const an = buf.readUInt16BE(6);
  let o = 12;
  for (let i = 0; i < qd; i++) o = skipName(buf, o) + 4;
  const answers: DnsAnswer[] = [];
  for (let i = 0; i < an; i++) {
    o = skipName(buf, o);
    const type = buf.readUInt16BE(o);
    const ttl = buf.readUInt32BE(o + 4);
    const rdlen = buf.readUInt16BE(o + 8);
    answers.push({ type, ttl });
    o += 10 + rdlen;
  }
  return { rcode: flags & 0x0f, truncated: Boolean(flags & 0x0200), answers };
}

/** One UDP query to one server. Node's resolver hides a CNAME's TTL, so the packet is read directly. */
function queryServer(server: string, name: string): Promise<{ rcode: number; truncated: boolean; answers: DnsAnswer[] }> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 0xffff);
    const socket = createSocket("udp4");
    const timer = setTimeout(() => { socket.close(); reject(new Error("timeout")); }, TIMEOUT_MS);
    socket.on("error", (e) => { clearTimeout(timer); socket.close(); reject(e); });
    socket.on("message", (msg) => {
      try {
        const parsed = parseAnswers(msg, id);
        clearTimeout(timer);
        socket.close();
        resolve(parsed);
      } catch {
        // someone else's packet: keep waiting
      }
    });
    socket.send(buildQuery(id, name), 53, server);
  });
}

/** The parent zones of a hostname, nearest first: a.b.example.co.uk → b.example.co.uk, example.co.uk, co.uk. */
export function zoneCandidates(hostname: string): string[] {
  const labels = hostname.replace(/\.$/, "").toLowerCase().split(".");
  const out: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) out.push(labels.slice(i).join("."));
  return out;
}

function resolver(servers?: string[]): Resolver {
  const r = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
  if (servers) r.setServers(servers);
  return r;
}

/** Ask the domain's own name servers for the A record's configured TTL. */
export async function lookupAuthoritativeTtl(hostname: string): Promise<AuthoritativeTtl> {
  const recursive = resolver();
  let zone: string | null = null;
  let nameServers: string[] = [];
  for (const candidate of zoneCandidates(hostname)) {
    try {
      const ns = await recursive.resolveNs(candidate);
      if (ns.length > 0) { zone = candidate; nameServers = ns; break; }
    } catch {
      // No NS at this label (an ordinary subdomain); try the parent.
    }
  }
  if (!zone) return { kind: "unknown", reason: "the domain's name servers could not be found" };

  for (const ns of nameServers.slice(0, 3)) {
    let ips: string[] = [];
    try { ips = await recursive.resolve4(ns); } catch { continue; }
    if (ips.length === 0) continue;
    try {
      const reply = await queryServer(ips[0], hostname);
      if (reply.rcode !== 0 || reply.truncated) continue;
      // The first record answers the name itself: its address, or the CNAME it points at.
      const first = reply.answers.find((r) => r.type === 1 || r.type === 5);
      if (first) return { kind: "ttl", ttl: first.ttl, record: first.type === 5 ? "CNAME" : "A", server: ns, zone };
    } catch {
      // fall through to the next name server
    }
  }
  return { kind: "unknown", reason: "none of the domain's name servers answered" };
}

function human(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? "" : "s"}`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hour${seconds === 3_600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} seconds`;
}

/** The check, from an authoritative lookup. Pure. */
export function dnsTtlHealthyCheck(hostname: string, result: AuthoritativeTtl): PulseScanCheckInput {
  const base = { category: CATEGORIES.INFRASTRUCTURE, checkKey: "dns_ttl_healthy", label: "DNS TTL lets a change of host take effect within a day" };
  if (result.kind === "unknown") {
    return { ...base, status: "INCONCLUSIVE", confidence: "LOW", detail: `Not assessed: ${result.reason}, so the TTL ${hostname} publishes could not be read.` };
  }
  const where = `${result.server}, a name server for ${result.zone}`;
  if (result.ttl > LONG_TTL_SECONDS) {
    return {
      ...base, status: "WARN", confidence: "HIGH", evidenceStrength: "VERIFIED", evidence: `${hostname} ${result.record} TTL ${result.ttl} (from ${result.server})`,
      detail: `${hostname}'s ${result.record === "CNAME" ? "CNAME" : "address"} record has a TTL of ${human(result.ttl)} (${result.ttl} seconds, from ${where}). If you ever need to move the site, in a failover or a migration, resolvers may keep sending visitors to the old address for that long. Lower it to an hour or less, or at least a day before any planned move.`,
    };
  }
  return {
    ...base, status: "PASS", confidence: "HIGH", evidenceStrength: "VERIFIED", evidence: `${hostname} ${result.record} TTL ${result.ttl} (from ${result.server})`,
    detail: `${hostname}'s ${result.record === "CNAME" ? "CNAME" : "address"} record has a TTL of ${human(result.ttl)} (from ${where}), so a change of host reaches everyone within that time.`,
  };
}
