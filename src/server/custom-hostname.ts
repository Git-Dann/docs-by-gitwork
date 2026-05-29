/**
 * Branded subdomains for public share URLs (P5.19).
 *
 * One workspace can attach one custom hostname (e.g. `docs.acme.com`) to its public share
 * surface. Verification is a TXT-record challenge: we mint a random token, the operator adds
 * `foundry-verify={token}` as a TXT record at `_foundry.{hostname}`, and we look it up.
 *
 * Once verified, share links generated via `publicShareUrl()` substitute the workspace's
 * hostname for the default Vercel domain. The middleware (in `src/middleware.ts`) also rewrites
 * incoming requests on the custom hostname to the internal `/docs/[token]` route.
 *
 * This module is the single source of truth for both the API routes and the share-URL helper.
 */

import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { prisma } from "@/lib/prisma";

const TXT_PREFIX = "_foundry";

/** Strict hostname validation — labels of 1–63 chars, total ≤253, at least one dot. */
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isValidHostname(hostname: string): boolean {
  return HOSTNAME_RE.test(hostname);
}

export function mintVerificationToken(): string {
  // 16 bytes → 26-ish base64url chars — small enough for a TXT record, plenty of entropy.
  return randomBytes(16).toString("base64url");
}

/** Returns the TXT record name + value the operator needs to add at their DNS host. */
export function dnsInstructions(hostname: string, token: string): {
  recordName: string;
  recordType: "TXT";
  recordValue: string;
} {
  return {
    recordName: `${TXT_PREFIX}.${hostname}`,
    recordType: "TXT",
    recordValue: `foundry-verify=${token}`,
  };
}

/**
 * Look up the TXT record at `_foundry.{hostname}` and check whether any returned chunk matches
 * `foundry-verify={token}`. Returns true on match, false on any failure (NXDOMAIN, no records,
 * mismatch, transient DNS error — caller can re-try).
 */
export async function verifyHostnameDns(hostname: string, token: string): Promise<boolean> {
  const expected = `foundry-verify=${token}`;
  try {
    const records = await dns.resolveTxt(`${TXT_PREFIX}.${hostname}`);
    // `resolveTxt` returns string[][] — outer = each record, inner = string chunks joined by DNS.
    return records.some((chunks) => chunks.join("").trim() === expected);
  } catch {
    return false;
  }
}

/**
 * Resolve a workspace by its verified custom hostname. Used by middleware to map an incoming
 * Host header to the workspace its docs belong to. Returns null for unverified hostnames.
 */
export async function findWorkspaceByVerifiedHostname(hostname: string) {
  if (!isValidHostname(hostname)) return null;
  const ws = await prisma.workspace.findFirst({
    where: { customHostname: hostname.toLowerCase(), customHostnameVerified: true },
    select: { id: true, slug: true, customHostname: true },
  });
  return ws;
}

/**
 * Build the public share URL for a doc. When the workspace has a verified custom hostname,
 * returns `https://{custom}/{token}`. Otherwise returns the default `{baseUrl}/docs/{token}`.
 */
export function publicShareUrl({
  baseUrl,
  shareToken,
  customHostname,
  customHostnameVerified,
}: {
  baseUrl: string;
  shareToken: string;
  customHostname: string | null;
  customHostnameVerified: boolean;
}): string {
  if (customHostname && customHostnameVerified) {
    return `https://${customHostname}/${shareToken}`;
  }
  return `${baseUrl.replace(/\/$/, "")}/docs/${shareToken}`;
}
