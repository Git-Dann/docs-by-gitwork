/**
 * SSRF / URL safety guard for the public Pulse lite scanner.
 *
 * The internal scanner fetches arbitrary user-supplied URLs server-side, which is
 * fine behind auth (internal team only). The moment we expose scanning to the
 * public, an attacker could point us at internal services — cloud metadata
 * endpoints (169.254.169.254), localhost, private LAN ranges, etc. This module
 * is the hard gate that prevents that.
 *
 * Used by the public lite-scan path (required) and defensively at internal scan
 * creation (belt-and-braces).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Error carrying an HTTP status so `fromError` maps it to the right response. */
export class UrlNotScannableError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UrlNotScannableError";
    this.status = status;
  }
}

/** Parse a dotted-quad IPv4 string into its four octets, or null if malformed. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets as [number, number, number, number];
}

/** True for any IPv4 address that must never be reachable from a public scan. */
function isPrivateIpv4(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return true; // unparseable → treat as unsafe
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 special-use
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return false;
}

/** True for any IPv6 address that must never be reachable from a public scan. */
function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible → check the embedded IPv4
  const mapped = addr.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true; // not a valid IP → unsafe
}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home.arpa"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback", "metadata.google.internal"]);

/**
 * Validate that a user-supplied target is safe to fetch from our servers.
 * Normalises the URL (adds https:// if missing), enforces http/https, rejects
 * embedded credentials, and resolves the hostname — rejecting if it (or any of
 * its DNS answers) points at a private/reserved/loopback/link-local address.
 *
 * @returns the normalised URL string + hostname on success.
 * @throws  {UrlNotScannableError} (status 400) on any unsafe input.
 */
export async function assertScannableUrl(raw: string): Promise<{ url: string; hostname: string }> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new UrlNotScannableError("Enter a URL to scan.");

  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new UrlNotScannableError("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlNotScannableError("Only http and https URLs can be scanned.");
  }
  if (parsed.username || parsed.password) {
    throw new UrlNotScannableError("URLs with embedded credentials are not allowed.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) throw new UrlNotScannableError("That doesn't look like a valid URL.");
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new UrlNotScannableError("That host can't be scanned.");
  }

  // If the host is an IP literal, check it directly. Otherwise resolve every
  // answer and reject if any of them is private (basic DNS-rebinding defence).
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new UrlNotScannableError("That address can't be scanned.");
  } else {
    let addresses: { address: string }[];
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new UrlNotScannableError("Couldn't resolve that domain — check the URL and try again.");
    }
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      throw new UrlNotScannableError("That host resolves to a private address and can't be scanned.");
    }
  }

  return { url: parsed.toString(), hostname };
}

/**
 * Bare-hostname variant of the SSRF guard — for non-URL probes (e.g. a TCP
 * monitor's host:port). Rejects blocked/loopback/private-resolving hosts.
 * @throws {UrlNotScannableError} (status 400) on any unsafe host.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = (hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) throw new UrlNotScannableError("Enter a host.");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UrlNotScannableError("That host can't be monitored.");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UrlNotScannableError("That address can't be monitored.");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UrlNotScannableError("Couldn't resolve that host — check it and try again.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UrlNotScannableError("That host resolves to a private address and can't be monitored.");
  }
}
