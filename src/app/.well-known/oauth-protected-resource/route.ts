// OAuth 2.0 Protected Resource Metadata (RFC 9728).
//
// Newer MCP clients (incl. Claude) discover the authorization server FROM the
// resource: they fetch this doc for the MCP endpoint, read `authorization_servers`,
// then load that server's metadata (/.well-known/oauth-authorization-server).
// Publishing it makes "Add custom connector" by URL resolve the OAuth flow
// without the user pasting a separate auth URL.
//
// Public — no auth required (bootstrap discovery).

import { NextResponse } from "next/server";
import { originFrom } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = originFrom(request);
  return NextResponse.json({
    // The protected resource is the MCP endpoint itself.
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
    // Foundry reads the token from the Authorization: Bearer header only.
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/api-docs#mcp`,
  });
}
