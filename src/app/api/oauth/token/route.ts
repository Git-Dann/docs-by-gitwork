// OAuth 2.1 token endpoint (RFC 6749 §4.1.3 + §6 + RFC 7636).
//
//   grant_type=authorization_code → exchange the one-time code for tokens
//   grant_type=refresh_token      → rotate refresh + access in lockstep
//
// Accepts both application/x-www-form-urlencoded (per spec) and JSON (what
// many MCP clients send). Returns JSON per RFC 6749 §5.

import { NextResponse } from "next/server";
import {
  assertMcpEnabled,
  consumeAuthCode,
  findClientById,
  isAllowedRedirectUri,
  issueTokens,
  rotateRefreshToken,
  workspaceIdForUser,
  OAuthError,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/server/oauth";

export const dynamic = "force-dynamic";

type TokenParams = Record<string, string | undefined>;

async function readTokenParams(request: Request): Promise<TokenParams> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, v == null ? undefined : String(v)]),
    );
  }
  // form-urlencoded (spec default) or multipart
  const form = await request.formData();
  const out: TokenParams = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function oauthJsonError(code: string, description: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: description },
    {
      status,
      // RFC 6749 §5.2: token endpoint responses MUST NOT be cached.
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function tokenSuccess(payload: {
  accessToken: string;
  refreshToken: string;
  scope: string;
}) {
  return NextResponse.json(
    {
      access_token: payload.accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: payload.refreshToken,
      scope: payload.scope,
    },
    {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    },
  );
}

export async function POST(request: Request) {
  try {
    await assertMcpEnabled();
  } catch (e) {
    if (e instanceof OAuthError) return oauthJsonError(e.code, e.description, e.status);
    throw e;
  }

  let params: TokenParams;
  try {
    params = await readTokenParams(request);
  } catch {
    return oauthJsonError("invalid_request", "Could not parse request body.");
  }

  const grantType = params.grant_type;
  if (!grantType) {
    return oauthJsonError("invalid_request", "Missing grant_type.");
  }

  try {
    if (grantType === "authorization_code") {
      return await handleAuthCode(params);
    }
    if (grantType === "refresh_token") {
      return await handleRefresh(params);
    }
    return oauthJsonError("unsupported_grant_type", `Unsupported grant_type: ${grantType}.`);
  } catch (e) {
    if (e instanceof OAuthError) return oauthJsonError(e.code, e.description, e.status);
    // Unexpected — return a generic server_error per RFC 6749 §5.2.
    return oauthJsonError("server_error", e instanceof Error ? e.message : "Unexpected error.", 500);
  }
}

async function handleAuthCode(params: TokenParams) {
  const required = ["code", "redirect_uri", "client_id", "code_verifier"] as const;
  for (const key of required) {
    if (!params[key]) return oauthJsonError("invalid_request", `Missing ${key}.`);
  }

  const client = await findClientById(params.client_id!);
  if (!client) {
    return oauthJsonError("invalid_client", "Unknown client_id.", 401);
  }
  if (!isAllowedRedirectUri(client, params.redirect_uri!)) {
    return oauthJsonError("invalid_grant", "redirect_uri not registered for this client.");
  }

  // Single-use enforcement, PKCE verify, expiry — all inside consumeAuthCode.
  const { userId, scope } = await consumeAuthCode({
    code: params.code!,
    clientId: client.id,
    redirectUri: params.redirect_uri!,
    codeVerifier: params.code_verifier!,
  });

  const workspaceId = await workspaceIdForUser(userId);
  if (!workspaceId) {
    return oauthJsonError(
      "invalid_grant",
      "User has no workspace membership.",
    );
  }

  const tokens = await issueTokens({
    clientId: client.id,
    userId,
    workspaceId,
    scope,
  });

  return tokenSuccess({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    scope: tokens.scope,
  });
}

async function handleRefresh(params: TokenParams) {
  if (!params.refresh_token) return oauthJsonError("invalid_request", "Missing refresh_token.");
  if (!params.client_id) return oauthJsonError("invalid_request", "Missing client_id.");

  const client = await findClientById(params.client_id);
  if (!client) {
    return oauthJsonError("invalid_client", "Unknown client_id.", 401);
  }

  // rotateRefreshToken validates ownership + freshness + revocation, then
  // returns a fresh access+refresh pair and revokes the prior pair atomically.
  // We resolve the workspace from the userId pinned to the refresh row.
  const workspaceId = await resolveWorkspaceForRefresh(params.refresh_token);
  const tokens = await rotateRefreshToken({
    refreshToken: params.refresh_token,
    clientId: client.id,
    workspaceId,
  });

  return tokenSuccess({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    scope: tokens.scope,
  });
}

/**
 * Cheap helper: look up the user behind a refresh token (by hash) and resolve
 * their workspace. Used only by the refresh path — the code path has the
 * userId in scope already.
 */
async function resolveWorkspaceForRefresh(refreshToken: string): Promise<string> {
  // Imported lazily to avoid pulling Prisma into the module's top level —
  // keeps the module slimmer for clients that only import the helpers.
  const { prisma } = await import("@/lib/prisma");
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(refreshToken, "utf8").digest("hex");
  const row = await prisma.oAuthToken.findUnique({
    where: { tokenHash: hash },
    select: { userId: true },
  });
  if (!row) {
    throw new OAuthError("invalid_grant", "Unknown refresh token.");
  }
  const workspaceId = await workspaceIdForUser(row.userId);
  if (!workspaceId) {
    throw new OAuthError("invalid_grant", "User has no workspace membership.");
  }
  return workspaceId;
}
