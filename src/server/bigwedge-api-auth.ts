/**
 * How Foundry authenticates to the Big Wedge app API (apiv1.bigwedgegolf.com).
 *
 * ⚠️ WHY THIS EXISTS. Course requests stopped reaching Foundry in August 2026 and had
 * been "fixed" by hand more than once. Every fix was a pasted admin JWT on the Care
 * "Analytics API" connector — and an access JWT expires, so each fix quietly lapsed and
 * the pull went silent again. (The import also read that token WITHOUT decrypting it,
 * so once secrets were encrypted at rest it sent `enc:{…}` as the bearer.)
 *
 * So Foundry now logs in for itself on every run: `POST /api/v1/auth/login/` with a
 * service account's email + password returns a fresh access token, which never has the
 * chance to expire between runs. Precedence:
 *
 *   1. env `BIGWEDGE_API_EMAIL` + `BIGWEDGE_API_PASSWORD` — synced into the VPS .env by
 *      deploy.yml from GitHub Actions secrets, so setting or rotating them needs no SSH.
 *   2. the Analytics connector's stored `apiToken` — still honoured, but checked for
 *      expiry first, so an expired one is REPORTED as expired rather than failing as a
 *      bare 401 that reads like "Big Wedge is down".
 *
 * Every failure is returned as a sentence that names the fix. A pull that cannot log in
 * must say so — never look like "no golfer asked for a course" (CLAUDE.md §35).
 */
import { prisma } from "@/lib/prisma";
import { decryptScraperConfig } from "@/server/support-scraper-config";

export const BIGWEDGE_DEFAULT_BASE = "https://apiv1.bigwedgegolf.com";

export type BigWedgeAccess =
  | { ok: true; baseUrl: string; token: string; via: "login" | "stored-token" }
  | { ok: false; error: string };

/** The Care "Analytics API" connector for the client — base URL and any stored token. */
async function findConnector(
  workspaceClientId: string,
): Promise<{ baseUrl?: string; apiToken?: string } | null> {
  // Linked Care record first; the name fallback is the one resolveBigWedgeApi always used,
  // kept so a Care client that was never linked to its Portal client still resolves.
  const support =
    (await prisma.supportClient.findFirst({ where: { workspaceClientId }, select: { id: true } })) ??
    (await (async () => {
      const wc = await prisma.workspaceClient.findUnique({
        where: { id: workspaceClientId },
        select: { workspaceId: true, name: true, slug: true },
      });
      if (!wc) return null;
      return prisma.supportClient.findFirst({
        where: {
          workspaceId: wc.workspaceId,
          OR: [{ slug: wc.slug }, { name: { contains: wc.name, mode: "insensitive" } }],
        },
        select: { id: true },
      });
    })());
  if (!support) return null;
  const conn = await prisma.accountConnection.findFirst({
    where: { clientId: support.id, source: "ANALYTICS" },
    orderBy: { createdAt: "desc" },
    select: { scraperConfig: true },
  });
  if (!conn) return null;
  return (decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}) as {
    baseUrl?: string;
    apiToken?: string;
  };
}

/** The `exp` of a JWT, or null when the value is not a readable JWT. Never verifies. */
export function jwtExpiry(token: string): Date | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.exp === "number" ? new Date(json.exp * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Pull the access token out of a login response. Big Wedge wraps responses in
 * `{ status, data }`; the schema documents a bare `{ access, refresh }`. Accept both.
 */
export function accessFromLoginResponse(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { access?: unknown; data?: { access?: unknown } };
  const token = typeof o.access === "string" ? o.access : typeof o.data?.access === "string" ? o.data.access : null;
  return token && token.length > 10 ? token : null;
}

async function login(baseUrl: string, email: string, password: string): Promise<string | { error: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Foundry/1.0" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { error: `Could not reach the Big Wedge API to log in (${err instanceof Error ? err.message : String(err)}).` };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // Their error envelope carries a readable message; surface it, never the password.
    const msg =
      (json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : null) ?? `HTTP ${res.status}`;
    return {
      error: `Big Wedge rejected Foundry's login (${msg}). Check BIGWEDGE_API_EMAIL / BIGWEDGE_API_PASSWORD.`,
    };
  }
  const token = accessFromLoginResponse(json);
  return token ?? { error: "Big Wedge accepted the login but returned no access token." };
}

export async function resolveBigWedgeAccess(
  workspaceClientId: string,
  now: Date = new Date(),
): Promise<BigWedgeAccess> {
  const connector = await findConnector(workspaceClientId);
  const baseUrl = (process.env.BIGWEDGE_API_URL?.trim() || connector?.baseUrl || BIGWEDGE_DEFAULT_BASE).replace(
    /\/$/,
    "",
  );

  const email = process.env.BIGWEDGE_API_EMAIL?.trim();
  const password = process.env.BIGWEDGE_API_PASSWORD?.trim();
  if (email && password) {
    const result = await login(baseUrl, email, password);
    return typeof result === "string"
      ? { ok: true, baseUrl, token: result, via: "login" }
      : { ok: false, error: result.error };
  }

  const stored = connector?.apiToken?.trim();
  if (stored) {
    const exp = jwtExpiry(stored);
    if (exp && exp.getTime() <= now.getTime()) {
      return {
        ok: false,
        error: `The Big Wedge token stored on the Analytics connector expired on ${exp.toISOString().slice(0, 10)}. Set BIGWEDGE_API_EMAIL and BIGWEDGE_API_PASSWORD so Foundry logs in for itself and this cannot expire again.`,
      };
    }
    return { ok: true, baseUrl, token: stored, via: "stored-token" };
  }

  return {
    ok: false,
    error:
      "Foundry has no way to log in to the Big Wedge API. Set BIGWEDGE_API_EMAIL and BIGWEDGE_API_PASSWORD (a Big Wedge admin account) in the deploy secrets.",
  };
}
