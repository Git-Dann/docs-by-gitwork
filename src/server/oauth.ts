// Foundry's OAuth 2.1 authorization-server helpers.
//
// Issues + validates the opaque tokens that gate /api/mcp. Tokens are stored
// as SHA-256 hashes so a database leak does not yield usable credentials.
// The plaintext token is returned to the client exactly once (at issuance).
//
// Scopes are coarse today: a single "mcp" scope grants the MCP route, then
// the route applies the user's existing FEATURE_PERMISSIONS via can*() helpers.
// We can split granular scopes later without a schema change.
//
// Caller responsibilities:
//   • /api/oauth/authorize → createAuthCode(...) after consent
//   • /api/oauth/token (code flow) → consumeAuthCode + issueTokens
//   • /api/oauth/token (refresh) → rotateRefreshToken
//   • /api/oauth/revoke → revokeToken
//   • /api/mcp → validateAccessToken(req) on every call

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { OAuthClient, User } from "@prisma/client";
import { recordAuditEntry } from "@/server/audit-log";

// ── constants ──────────────────────────────────────────────────────────────

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const AUTH_CODE_TTL_SECONDS = 60; // RFC 6749 §4.1.2 recommends ≤10 min; 60s is plenty for Claude.

export const SUPPORTED_SCOPES = ["mcp"] as const;
export type Scope = (typeof SUPPORTED_SCOPES)[number];

const ACCESS_PREFIX = "foundry_at_";
const REFRESH_PREFIX = "foundry_rt_";
const AUTH_CODE_PREFIX = "foundry_ac_";

// ── hashing & secrets ──────────────────────────────────────────────────────

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

/** Constant-time hex string equality. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// ── PKCE (RFC 7636) ────────────────────────────────────────────────────────

/**
 * Verify a PKCE code_verifier against a stored code_challenge.
 * We only accept S256; plain is rejected at the authorize endpoint.
 */
export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method !== "S256") return false;
  // RFC 7636 §4.1: 43–128 chars, unreserved set. Cheap sanity check.
  if (verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9._~-]+$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return computed === challenge;
}

// ── scope helpers ──────────────────────────────────────────────────────────

export function parseScope(raw: string | null | undefined): Scope[] {
  if (!raw) return ["mcp"]; // default
  const parts = raw.split(/\s+/).filter(Boolean);
  const valid = parts.filter((p): p is Scope => (SUPPORTED_SCOPES as readonly string[]).includes(p));
  return valid.length ? Array.from(new Set(valid)) : ["mcp"];
}

export function formatScope(scopes: readonly Scope[]): string {
  return scopes.join(" ");
}

// ── client lookup ──────────────────────────────────────────────────────────

export async function findClientById(clientId: string): Promise<OAuthClient | null> {
  return prisma.oAuthClient.findUnique({ where: { id: clientId } });
}

export function isAllowedRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

// ── authorization codes ────────────────────────────────────────────────────

export type IssuedCode = {
  /** The plaintext code to return in the redirect — never stored. */
  code: string;
  /** When the code expires (also persisted on the row). */
  expiresAt: Date;
};

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<IssuedCode> {
  const code = randomToken(AUTH_CODE_PREFIX);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);
  await prisma.oAuthAuthCode.create({
    data: {
      codeHash: sha256Hex(code),
      oauthClientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      expiresAt,
    },
  });
  return { code, expiresAt };
}

/**
 * Validate a code on token exchange and mark it used in one transaction.
 * Throws on any mismatch — caller maps to invalid_grant.
 */
export async function consumeAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ userId: string; scope: string }> {
  const codeHash = sha256Hex(input.code);

  // Single-use enforcement: update returns 0 rows if the code is already used
  // or doesn't match. We then re-fetch to produce a precise error if needed.
  const row = await prisma.oAuthAuthCode.findUnique({ where: { codeHash } });
  if (!row) throw new OAuthError("invalid_grant", "Unknown authorization code.");
  if (row.usedAt) throw new OAuthError("invalid_grant", "Authorization code already used.");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthError("invalid_grant", "Authorization code expired.");
  }
  if (row.oauthClientId !== input.clientId) {
    throw new OAuthError("invalid_grant", "Code was issued to a different client.");
  }
  if (row.redirectUri !== input.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri mismatch.");
  }
  if (!verifyPkce(input.codeVerifier, row.codeChallenge, row.codeChallengeMethod)) {
    throw new OAuthError("invalid_grant", "PKCE verifier failed.");
  }

  // Mark used. If another concurrent request beats us to it the row's
  // updatedAt is unchanged on the second update — but the usedAt guard above
  // still catches replay on the slower request.
  const { count } = await prisma.oAuthAuthCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw new OAuthError("invalid_grant", "Authorization code already used.");

  return { userId: row.userId, scope: row.scope };
}

// ── token issuance ─────────────────────────────────────────────────────────

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  scope: string;
};

/**
 * Issue a fresh access + refresh pair and (re)open an McpConnection for the
 * user/client. Used after a code exchange OR a refresh rotation. Always
 * revokes any pre-existing live tokens for this (user, client) pair — keeps
 * the per-connection invariant simple.
 */
export async function issueTokens(input: {
  clientId: string;
  userId: string;
  workspaceId: string;
  scope: string;
  /** Optional human label (defaults to client.clientName). */
  label?: string;
}): Promise<IssuedTokens> {
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const accessToken = randomToken(ACCESS_PREFIX);
  const refreshToken = randomToken(REFRESH_PREFIX);

  await prisma.$transaction(async (tx) => {
    // Revoke any live tokens for this (user, client). Re-auth always
    // supersedes previous sessions so the UI shows one row, not many.
    await tx.oAuthToken.updateMany({
      where: {
        oauthClientId: input.clientId,
        userId: input.userId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    const access = await tx.oAuthToken.create({
      data: {
        tokenHash: sha256Hex(accessToken),
        type: "ACCESS",
        oauthClientId: input.clientId,
        userId: input.userId,
        scope: input.scope,
        expiresAt: accessExpiresAt,
      },
    });

    await tx.oAuthToken.create({
      data: {
        tokenHash: sha256Hex(refreshToken),
        type: "REFRESH",
        oauthClientId: input.clientId,
        userId: input.userId,
        scope: input.scope,
        expiresAt: refreshExpiresAt,
        parentTokenId: access.id,
      },
    });

    // Upsert the user-facing connection row.
    const client = await tx.oAuthClient.findUniqueOrThrow({
      where: { id: input.clientId },
    });
    await tx.mcpConnection.upsert({
      where: {
        userId_oauthClientId: { userId: input.userId, oauthClientId: input.clientId },
      },
      create: {
        userId: input.userId,
        oauthClientId: input.clientId,
        workspaceId: input.workspaceId,
        label: input.label ?? client.clientName,
      },
      update: {
        label: input.label ?? client.clientName,
        revokedAt: null,
        connectedAt: now,
        lastUsedAt: null,
      },
    });
  });

  // Audit the connection (fire-and-forget — never block issuance).
  recordAuditEntry({
    workspaceId: input.workspaceId,
    actorId: input.userId,
    action: "integration.mcp.connected",
    target: `oauthClient:${input.clientId}`,
    metadata: { scope: input.scope },
  }).catch(() => undefined);

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExpiresAt,
    refreshTokenExpiresAt: refreshExpiresAt,
    scope: input.scope,
  };
}

/**
 * Rotate a refresh token: validate the presented value, revoke it (and its
 * paired access token), issue a fresh pair. Returns the new tokens or throws.
 */
export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  workspaceId: string;
}): Promise<IssuedTokens> {
  const tokenHash = sha256Hex(input.refreshToken);
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash } });
  if (!row) throw new OAuthError("invalid_grant", "Unknown refresh token.");
  if (row.type !== "REFRESH") throw new OAuthError("invalid_grant", "Not a refresh token.");
  if (row.revokedAt) throw new OAuthError("invalid_grant", "Refresh token revoked.");
  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthError("invalid_grant", "Refresh token expired.");
  }
  if (row.oauthClientId !== input.clientId) {
    throw new OAuthError("invalid_grant", "Refresh token does not match client.");
  }

  return issueTokens({
    clientId: row.oauthClientId,
    userId: row.userId,
    workspaceId: input.workspaceId,
    scope: row.scope,
  });
}

// ── token validation (used by /api/mcp) ────────────────────────────────────

export type ValidatedToken = {
  tokenId: string;
  user: User;
  scope: string[];
  oauthClientId: string;
};

/**
 * Look up an opaque access token, check it's live, return the user.
 * Returns null on any failure (caller responds with 401). Stamps lastUsedAt.
 */
export async function validateAccessToken(token: string): Promise<ValidatedToken | null> {
  if (!token.startsWith(ACCESS_PREFIX)) return null;
  const tokenHash = sha256Hex(token);
  const row = await prisma.oAuthToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.type !== "ACCESS" || row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  // Best-effort lastUsedAt — failures here must not break the request.
  // Wrapped so a write contention spike on the token row doesn't surface.
  prisma.oAuthToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  prisma.mcpConnection
    .updateMany({
      where: { userId: row.userId, oauthClientId: row.oauthClientId },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    tokenId: row.id,
    user: row.user,
    scope: row.scope.split(/\s+/).filter(Boolean),
    oauthClientId: row.oauthClientId,
  };
}

// ── revocation (RFC 7009) ──────────────────────────────────────────────────

/**
 * Revoke a token by value. Per RFC 7009 the endpoint MUST treat unknown
 * tokens as success (privacy — don't reveal which tokens existed). So we
 * always return without error; this helper just does the best-effort write.
 */
export async function revokeTokenByValue(token: string): Promise<void> {
  if (
    !token.startsWith(ACCESS_PREFIX) &&
    !token.startsWith(REFRESH_PREFIX)
  ) {
    return;
  }
  const tokenHash = sha256Hex(token);
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash } });
  if (!row) return;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Revoke the presented token plus its sibling so the whole session dies.
    await tx.oAuthToken.updateMany({
      where: {
        OR: [
          { id: row.id },
          { id: row.parentTokenId ?? "__never__" },
          { parentTokenId: row.id },
        ],
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    // If no other live tokens remain for this connection, mark it revoked.
    const stillLive = await tx.oAuthToken.count({
      where: {
        userId: row.userId,
        oauthClientId: row.oauthClientId,
        revokedAt: null,
      },
    });
    if (stillLive === 0) {
      await tx.mcpConnection.updateMany({
        where: { userId: row.userId, oauthClientId: row.oauthClientId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
  });
}

/** Revoke every token for a connection. Used by the UI's per-connection Revoke. */
export async function revokeConnection(input: {
  userId: string;
  oauthClientId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.oAuthToken.updateMany({
      where: { userId: input.userId, oauthClientId: input.oauthClientId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.mcpConnection.updateMany({
      where: { userId: input.userId, oauthClientId: input.oauthClientId, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}

// ── errors ─────────────────────────────────────────────────────────────────

/**
 * OAuth-spec error. `code` maps to the standard error codes (invalid_request,
 * invalid_grant, invalid_client, unauthorized_client, unsupported_grant_type,
 * invalid_scope, …). Route handlers convert these to the 400/401 JSON shape
 * required by RFC 6749 §5.2.
 */
export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
}

// Re-export the constant-time helper for routes that need to compare token
// fragments outside the helpers (e.g. comparing client secrets if we ever
// support confidential clients).
export const _internal = { safeEqualHex };

// ── helper: workspace lookup for issuance ──────────────────────────────────

/** Look up the user's primary workspace for the connection row. Single-workspace today. */
export async function workspaceIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    select: { workspaceId: true },
    orderBy: { createdAt: "asc" },
  });
  return membership?.workspaceId ?? null;
}

// ── workspace-level enable gate ────────────────────────────────────────────

/**
 * Throws if no workspace has mcpEnabled. Foundry is single-workspace today;
 * the OAuth surface as a whole is governed by that one flag. When Foundry
 * goes multi-workspace, this check moves to per-(client, workspace) at
 * authorize/token time.
 */
export async function assertMcpEnabled(): Promise<void> {
  const live = await prisma.workspace.findFirst({
    where: { mcpEnabled: true },
    select: { id: true },
  });
  if (!live) {
    throw new OAuthError(
      "service_unavailable",
      "MCP is not enabled for this workspace. A Super Admin must enable it in Settings → MCP.",
      503,
    );
  }
}

// Convenience for tests / dev tooling — never used in prod request paths.
export const _testing = { sha256Hex, randomToken };
