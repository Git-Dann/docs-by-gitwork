// OAuth 2.1 authorization endpoint (RFC 6749 §4.1 + PKCE / RFC 7636).
//
//   GET  /api/oauth/authorize?response_type=code&client_id=...
//        Validates parameters, requires a NextAuth user session, then
//        redirects to /oauth/consent so the user can approve.
//
//   POST /api/oauth/authorize  (multipart form from the consent page)
//        Re-validates everything, mints a single-use authorization code,
//        and 302-redirects back to redirect_uri with `code` + `state`.
//
// Errors that happen *before* we can trust the redirect_uri (unknown client,
// bad redirect_uri) render an HTML error page in-place — never bounce back
// to an unvalidated URL. After redirect_uri is validated, OAuth-spec errors
// are returned via the redirect with ?error=...&state=... per RFC 6749 §4.1.2.1.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  assertMcpEnabled,
  createAuthCode,
  findClientById,
  isAllowedRedirectUri,
  parseScope,
  formatScope,
  OAuthError,
} from "@/server/oauth";
import { resolveEffectiveUserById } from "@/server/mcp/auth";
import { canConnectMcp } from "@/server/auth/effective-user";
import { originFrom } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const SUPPORTED_RESPONSE_TYPE = "code";
const SUPPORTED_CODE_CHALLENGE_METHOD = "S256";

type Params = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
};

function readParams(searchParams: URLSearchParams): Partial<Params> {
  return {
    responseType: searchParams.get("response_type") ?? "",
    clientId: searchParams.get("client_id") ?? "",
    redirectUri: searchParams.get("redirect_uri") ?? "",
    scope: searchParams.get("scope") ?? "",
    state: searchParams.get("state"),
    codeChallenge: searchParams.get("code_challenge") ?? "",
    codeChallengeMethod: searchParams.get("code_challenge_method") ?? "",
  };
}

function errorPage(message: string, status = 400) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><title>OAuth error</title></head><body style="font-family: system-ui; max-width: 540px; margin: 64px auto; padding: 0 24px;"><h1 style="font-size: 18px;">Authorization failed</h1><p>${escapeHtml(message)}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

function redirectWithError(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url, 302);
}

async function validateParams(raw: Partial<Params>): Promise<
  | { ok: true; params: Params; clientName: string; clientLogoUri: string | null }
  | { ok: false; renderInPlace: true; status: number; message: string }
  | { ok: false; renderInPlace: false; redirectUri: string; error: string; description: string; state: string | null }
> {
  // Stage 1: errors we MUST render in-place (no trusted redirect_uri yet).
  if (!raw.clientId) {
    return { ok: false, renderInPlace: true, status: 400, message: "Missing client_id." };
  }
  const client = await findClientById(raw.clientId);
  if (!client) {
    return { ok: false, renderInPlace: true, status: 404, message: "Unknown client." };
  }
  if (!raw.redirectUri) {
    return { ok: false, renderInPlace: true, status: 400, message: "Missing redirect_uri." };
  }
  if (!isAllowedRedirectUri(client, raw.redirectUri)) {
    return {
      ok: false,
      renderInPlace: true,
      status: 400,
      message: "redirect_uri does not match any registered for this client.",
    };
  }

  const state = raw.state ?? null;
  const redirectUri = raw.redirectUri;

  // Stage 2: now we can return errors via the redirect.
  if (raw.responseType !== SUPPORTED_RESPONSE_TYPE) {
    return {
      ok: false,
      renderInPlace: false,
      redirectUri,
      error: "unsupported_response_type",
      description: "Only response_type=code is supported.",
      state,
    };
  }
  if (!raw.codeChallenge) {
    return {
      ok: false,
      renderInPlace: false,
      redirectUri,
      error: "invalid_request",
      description: "Missing code_challenge — PKCE is required.",
      state,
    };
  }
  if (raw.codeChallengeMethod !== SUPPORTED_CODE_CHALLENGE_METHOD) {
    return {
      ok: false,
      renderInPlace: false,
      redirectUri,
      error: "invalid_request",
      description: "code_challenge_method must be S256.",
      state,
    };
  }
  const scopes = parseScope(raw.scope);
  return {
    ok: true,
    params: {
      responseType: raw.responseType!,
      clientId: raw.clientId,
      redirectUri,
      scope: formatScope(scopes),
      state,
      codeChallenge: raw.codeChallenge,
      codeChallengeMethod: raw.codeChallengeMethod,
    },
    clientName: client.clientName,
    clientLogoUri: client.logoUri,
  };
}

// ── GET: initiate the flow ─────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    await assertMcpEnabled();
  } catch (e) {
    if (e instanceof OAuthError) {
      return errorPage(e.description, e.status);
    }
    throw e;
  }

  const url = new URL(request.url);
  const origin = originFrom(request);
  const v = await validateParams(readParams(url.searchParams));
  if (!v.ok) {
    if (v.renderInPlace) return errorPage(v.message, v.status);
    return redirectWithError(v.redirectUri, v.error, v.description, v.state);
  }

  // Require a logged-in Foundry user. If not signed in, bounce through
  // NextAuth, then come back to /oauth/consent with the same params.
  const session = await auth();
  if (!session?.user?.id) {
    const consentUrl = new URL("/oauth/consent", origin);
    url.searchParams.forEach((value, key) => consentUrl.searchParams.set(key, value));
    const signInUrl = new URL("/api/auth/signin", origin);
    signInUrl.searchParams.set("callbackUrl", consentUrl.toString());
    return NextResponse.redirect(signInUrl, 302);
  }

  // Authenticated → take the user to the consent screen, carrying every
  // OAuth param along so the POST can re-validate from scratch (defence in
  // depth — never trust the consent page's hidden inputs alone).
  const consentUrl = new URL("/oauth/consent", origin);
  url.searchParams.forEach((value, key) => consentUrl.searchParams.set(key, value));
  return NextResponse.redirect(consentUrl, 302);
}

// ── POST: process consent decision, mint code ──────────────────────────────
export async function POST(request: Request) {
  try {
    await assertMcpEnabled();
  } catch (e) {
    if (e instanceof OAuthError) return errorPage(e.description, e.status);
    throw e;
  }

  const form = await request.formData();
  const raw: Partial<Params> = {
    responseType: (form.get("response_type") as string | null) ?? "",
    clientId: (form.get("client_id") as string | null) ?? "",
    redirectUri: (form.get("redirect_uri") as string | null) ?? "",
    scope: (form.get("scope") as string | null) ?? "",
    state: (form.get("state") as string | null) ?? null,
    codeChallenge: (form.get("code_challenge") as string | null) ?? "",
    codeChallengeMethod: (form.get("code_challenge_method") as string | null) ?? "",
  };
  const decision = (form.get("decision") as string | null) ?? "approve";

  const v = await validateParams(raw);
  if (!v.ok) {
    if (v.renderInPlace) return errorPage(v.message, v.status);
    return redirectWithError(v.redirectUri, v.error, v.description, v.state);
  }

  const session = await auth();
  if (!session?.user?.id) {
    // Shouldn't happen — the consent page is only reachable when signed in —
    // but guard so a tab-replay attack can't slip through.
    return redirectWithError(
      v.params.redirectUri,
      "access_denied",
      "Not signed in.",
      v.params.state,
    );
  }

  if (decision !== "approve") {
    return redirectWithError(
      v.params.redirectUri,
      "access_denied",
      "User denied the authorization.",
      v.params.state,
    );
  }

  // Permission gate — the real one. Even if a user reaches this POST directly,
  // they can only mint a code if they hold mcp.connect (Admins by default;
  // Staff/Developers via the matrix). Mirrors the consent screen's check.
  const actor = await resolveEffectiveUserById(session.user.id);
  if (!actor || !canConnectMcp(actor)) {
    return redirectWithError(
      v.params.redirectUri,
      "access_denied",
      "Your Foundry account isn't permitted to connect Claude. Ask an admin to grant the 'Connect Claude (MCP)' permission.",
      v.params.state,
    );
  }

  const { code } = await createAuthCode({
    clientId: v.params.clientId,
    userId: session.user.id,
    redirectUri: v.params.redirectUri,
    scope: v.params.scope,
    codeChallenge: v.params.codeChallenge,
    codeChallengeMethod: v.params.codeChallengeMethod,
  });

  const redirect = new URL(v.params.redirectUri);
  redirect.searchParams.set("code", code);
  if (v.params.state) redirect.searchParams.set("state", v.params.state);
  return NextResponse.redirect(redirect, 302);
}
