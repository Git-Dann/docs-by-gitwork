/**
 * SSRF / URL safety guard for the public Pulse lite scanner.
 *
 * Every scanner path is untrusted, including authenticated staff scans,
 * competitors, monitors and browser agents. A saved or redirected target can
 * point at cloud metadata, localhost or a private service. This module is the
 * mandatory gate and pinned transport for all of them.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

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
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // deprecated 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return false;
}

/** True for any IPv6 address that must never be reachable from a public scan. */
function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  // Publicly scannable IPv6 is global-unicast 2000::/3. Everything else is
  // loopback, unspecified, mapped/translated, local, multicast, documentation,
  // transition space or reserved. Fail closed on those ranges.
  const first = Number.parseInt(addr.split(":", 1)[0] || "0", 16);
  if (!Number.isFinite(first) || (first & 0xe000) !== 0x2000) return true;
  if (addr.startsWith("2001:db8:")) return true; // documentation
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
export type UrlLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

const systemLookup: UrlLookup = async (hostname) => lookup(hostname, { all: true });

export async function assertScannableUrl(
  raw: string,
  resolve: UrlLookup = systemLookup,
): Promise<{ url: string; hostname: string; addresses: string[] }> {
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

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname) throw new UrlNotScannableError("That doesn't look like a valid URL.");
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new UrlNotScannableError("That host can't be scanned.");
  }

  // If the host is an IP literal, check it directly. Otherwise resolve every
  // answer and reject if any of them is private (basic DNS-rebinding defence).
  let approvedAddresses: string[];
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new UrlNotScannableError("That address can't be scanned.");
    approvedAddresses = [hostname];
  } else {
    let addresses: { address: string }[];
    try {
      addresses = await resolve(hostname);
    } catch {
      throw new UrlNotScannableError("Couldn't resolve that domain — check the URL and try again.");
    }
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      throw new UrlNotScannableError("That host resolves to a private address and can't be scanned.");
    }
    approvedAddresses = addresses.map((a) => a.address);
  }

  return {
    url: parsed.toString(),
    hostname,
    addresses: approvedAddresses,
  };
}

export interface ScannableRequestDependencies {
  lookup?: UrlLookup;
  request?: (
    url: string,
    init: RequestInit,
    approvedAddresses: readonly string[],
  ) => Promise<Response>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function pinnedRequest(
  url: string,
  init: RequestInit,
  approvedAddresses: readonly string[],
): Promise<Response> {
  const approved = approvedAddresses.map((address) => ({
    address,
    family: isIP(address) as 4 | 6,
  }));
  if (approved.length === 0) throw new UrlNotScannableError("That host has no approved public address.");

  // Pin Undici's connection lookup to the exact addresses approved above. This
  // closes the DNS-rebinding gap between validation and connection while keeping
  // the original hostname for TLS SNI and Host header validation.
  const cacheKey = approved.map((candidate) => `${candidate.family}:${candidate.address}`).sort().join(",");
  const dispatcher = getPinnedAgent(cacheKey, approved);

  return undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    redirect: "manual",
    dispatcher,
  }) as unknown as Promise<Response>;
}

const PINNED_AGENT_TTL_MS = 30_000;
const pinnedAgents = new Map<string, { agent: Agent; expiresAt: number }>();

type ApprovedAddress = { address: string; family: 4 | 6 };

function pinnedLookupResult(
  approved: ReadonlyArray<ApprovedAddress>,
  options: number | { family?: number | "IPv4" | "IPv6"; all?: boolean },
): ApprovedAddress | ApprovedAddress[] {
  const requestedFamily = typeof options === "number" ? options : options?.family;
  const wantedFamily = requestedFamily === "IPv4" ? 4 : requestedFamily === "IPv6" ? 6 : requestedFamily;
  const matching = approved.filter((candidate) => !wantedFamily || candidate.family === wantedFamily);
  const candidates = matching.length > 0 ? matching : [...approved];
  return typeof options === "object" && options?.all ? candidates : candidates[0];
}

/** Test seam for Node's overloaded DNS callback shape. */
export const pinnedLookupResultForTest = pinnedLookupResult;

function getPinnedAgent(cacheKey: string, approved: ReadonlyArray<ApprovedAddress>): Agent {
  const now = Date.now();
  for (const [key, entry] of pinnedAgents) {
    if (entry.expiresAt > now) continue;
    pinnedAgents.delete(key);
    void entry.agent.close();
  }
  const cached = pinnedAgents.get(cacheKey);
  if (cached) return cached.agent;

  const agent = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        const result = pinnedLookupResult(approved, options);
        if (Array.isArray(result)) {
          const allCallback = callback as unknown as (
            error: NodeJS.ErrnoException | null,
            addresses: ReadonlyArray<{ address: string; family: 4 | 6 }>,
          ) => void;
          allCallback(null, result);
          return;
        }
        callback(null, result.address, result.family);
      },
    },
  });
  pinnedAgents.set(cacheKey, { agent, expiresAt: now + PINNED_AGENT_TTL_MS });
  return agent;
}

/**
 * Fetch a user-controlled target without allowing DNS rebinding or unsafe
 * redirects. Every hop is resolved and approved, then the transport is pinned
 * to those exact answers. Redirects are bounded and followed manually.
 */
export async function fetchScannableUrl(
  raw: string,
  init: RequestInit = {},
  dependencies: ScannableRequestDependencies = {},
  options: {
    /**
     * Refuse to follow a redirect that leaves the origin the caller asked for.
     *
     * Off by default, because a scan legitimately follows a target across hosts and carries no
     * credentials while doing it. Callers that send an `Authorization` header MUST turn it on:
     * every hop is issued with the same `init`, so a target that 302s elsewhere would hand that
     * host the caller's bearer token. The SSRF guard does not help there — the attacker's host
     * is perfectly public.
     */
    sameOriginRedirectsOnly?: boolean;
  } = {},
): Promise<Response> {
  const resolve = dependencies.lookup ?? systemLookup;
  const request = dependencies.request ?? pinnedRequest;
  let current = raw;
  const startOrigin = (() => {
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  })();

  for (let hop = 0; hop <= 5; hop++) {
    const approved = await assertScannableUrl(current, resolve);
    const response = await request(
      approved.url,
      { ...init, redirect: "manual" },
      approved.addresses,
    );

    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel().catch(() => undefined);
    const next = new URL(location, approved.url).toString();
    if (options.sameOriginRedirectsOnly && startOrigin && new URL(next).origin !== startOrigin) {
      throw new UrlNotScannableError(
        `That endpoint redirected to a different host (${new URL(next).origin}). Refusing to follow it, because the request carries an API token.`,
      );
    }
    current = next;
  }

  throw new UrlNotScannableError("Too many redirects — the target could not be scanned safely.");
}

interface InterceptablePage {
  setRequestInterception(enabled: boolean): Promise<void>;
  on(event: "request", handler: (request: {
    url(): string;
    continue(): Promise<void>;
    abort(): Promise<void>;
  }) => void | Promise<void>): void;
}

/** Apply the same public-target rule to Chromium navigation and subresources. */
export async function guardBrowserRequests(page: InterceptablePage): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const requestUrl = request.url();
    if (/^(?:data|blob|about):/i.test(requestUrl)) {
      await request.continue().catch(() => undefined);
      return;
    }
    try {
      await assertScannableUrl(requestUrl);
      await request.continue();
    } catch {
      await request.abort().catch(() => undefined);
    }
  });
}

/**
 * Bare-hostname variant of the SSRF guard — for non-URL probes (e.g. a TCP
 * monitor's host:port). Rejects blocked/loopback/private-resolving hosts.
 * @throws {UrlNotScannableError} (status 400) on any unsafe host.
 */
export async function assertPublicHost(
  hostname: string,
  resolve: UrlLookup = systemLookup,
): Promise<{ hostname: string; addresses: string[] }> {
  const host = (hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) throw new UrlNotScannableError("Enter a host.");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UrlNotScannableError("That host can't be monitored.");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UrlNotScannableError("That address can't be monitored.");
    return { hostname: host, addresses: [host] };
  }
  let addresses: { address: string }[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new UrlNotScannableError("Couldn't resolve that host — check it and try again.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UrlNotScannableError("That host resolves to a private address and can't be monitored.");
  }
  return { hostname: host, addresses: addresses.map((candidate) => candidate.address) };
}
