// In-app MCP route — Streamable HTTP transport, stateless JSON mode.
//
//   POST /api/mcp
//     Authorization: Bearer foundry_at_<...>
//     Content-Type: application/json
//     { "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
//
// Every request:
//   1. Validates the bearer (foundry's OAuth access token).
//   2. Resolves the user to an EffectiveUser → per-user scoping is automatic.
//   3. Dispatches the JSON-RPC request via the shared handler.
//   4. Returns the JSON-RPC response (or 202 for notifications).
//
// No session state, no SSE — each Claude tool call is one HTTP request.

import { NextResponse } from "next/server";
import { validateMcpBearer } from "@/server/mcp/auth";
import { dispatch } from "@/server/mcp/handler";
import { assertMcpEnabled, OAuthError } from "@/server/oauth";

export const dynamic = "force-dynamic";

const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

function unauthorized(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  return new NextResponse(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Unauthorized: invalid or missing bearer token." },
    }),
    {
      status: 401,
      headers: {
        ...COMMON_HEADERS,
        // RFC 6750 §3 + RFC 9728 §5.1 — point clients at the OAuth flow AND the protected-resource
        // metadata so they can auto-discover the authorization server from this endpoint.
        "WWW-Authenticate": `Bearer realm="Foundry MCP", error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

export async function POST(request: Request) {
  // Workspace-level kill switch.
  try {
    await assertMcpEnabled();
  } catch (e) {
    if (e instanceof OAuthError) {
      return new NextResponse(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: e.description },
        }),
        { status: e.status, headers: COMMON_HEADERS },
      );
    }
    throw e;
  }

  const user = await validateMcpBearer(request);
  if (!user) return unauthorized(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error." },
      }),
      { status: 400, headers: COMMON_HEADERS },
    );
  }

  // MCP Streamable HTTP allows a batch (array) of requests in one body —
  // common when Claude sends initialize + the notifications/initialized
  // follow-up in the same call. Respond with an array iff the input was one.
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((b) => dispatch(user, b)));
    const filtered = responses.filter((r): r is NonNullable<typeof r> => r !== null);
    if (filtered.length === 0) {
      // All-notifications batch — no body.
      return new NextResponse(null, { status: 202 });
    }
    return new NextResponse(JSON.stringify(filtered), { status: 200, headers: COMMON_HEADERS });
  }

  const response = await dispatch(user, body);
  if (response === null) {
    // Single notification — no body per JSON-RPC spec.
    return new NextResponse(null, { status: 202 });
  }
  return new NextResponse(JSON.stringify(response), { status: 200, headers: COMMON_HEADERS });
}

// MCP clients sometimes probe with GET first (e.g. for SSE). We don't support
// streaming — return 405 with the supported method so the client falls back.
export async function GET() {
  return new NextResponse(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Use POST for MCP requests; SSE is not supported." },
    }),
    { status: 405, headers: { ...COMMON_HEADERS, Allow: "POST" } },
  );
}
