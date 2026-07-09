// OAuth 2.0 Authorization Server Metadata (RFC 8414).
//
// Tells MCP clients (claude.ai and others) where to find Foundry's OAuth
// endpoints so they can self-configure. The issuer URL is derived from the
// incoming request's Host header (see src/lib/request-origin.ts) so dev /
// preview / production all return correct URLs without per-environment config.
//
// Public — no auth required (the whole point is bootstrap).

import { NextResponse } from "next/server";
import { originFrom } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const issuer = originFrom(request);
  return NextResponse.json({
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    // RFC 8414 §2: explicit supported lists make clients (incl. claude.ai)
    // pick the right algorithms without trial-and-error.
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], // public clients only
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
    // Foundry only acts as an authorization server for its OWN MCP route.
    // We do not advertise userinfo / introspection — keeps the surface small.
    service_documentation: `${issuer}/api-docs#mcp`,
  });
}
