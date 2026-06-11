// Dynamic Client Registration (RFC 7591).
//
// Lets an OAuth client — e.g. claude.ai — register itself before a user
// authorizes. The flow is: a user pastes our discovery URL into Claude,
// Claude POSTs here to mint a client_id, then redirects the user to our
// authorize endpoint with that client_id.
//
// Public — no auth, but gated on the workspace mcpEnabled toggle so a
// disabled workspace can't be registered against. We only support public
// clients (PKCE, no secret) — which is what every modern OAuth client uses.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertMcpEnabled, OAuthError } from "@/server/oauth";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  redirect_uris: z
    .array(z.string().url())
    .min(1)
    .max(8)
    .refine((uris) => uris.every((u) => u.startsWith("https://") || u.startsWith("http://localhost")), {
      message: "redirect_uris must be https:// (or http://localhost for dev).",
    }),
  // Optional metadata RFC 7591 §2 — surfaced on the consent screen.
  logo_uri: z.string().url().optional(),
  client_uri: z.string().url().optional(),
  // We accept (and ignore) fields RFC 7591 lists for confidential clients —
  // returning an explicit token_endpoint_auth_method: "none" in the response.
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

function oauthError(err: OAuthError) {
  return NextResponse.json(
    { error: err.code, error_description: err.description },
    { status: err.status },
  );
}

export async function POST(request: Request) {
  try {
    await assertMcpEnabled();
  } catch (e) {
    if (e instanceof OAuthError) return oauthError(e);
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
      { status: 400 },
    );
  }

  // Reject grant_types we don't issue — fail loudly so Claude knows.
  if (parsed.data.grant_types?.length) {
    const unsupported = parsed.data.grant_types.filter(
      (g) => g !== "authorization_code" && g !== "refresh_token",
    );
    if (unsupported.length) {
      return NextResponse.json(
        {
          error: "invalid_client_metadata",
          error_description: `Unsupported grant_types: ${unsupported.join(", ")}.`,
        },
        { status: 400 },
      );
    }
  }

  const client = await prisma.oAuthClient.create({
    data: {
      clientName: parsed.data.client_name,
      redirectUris: parsed.data.redirect_uris,
      logoUri: parsed.data.logo_uri,
      clientUri: parsed.data.client_uri,
    },
  });

  // RFC 7591 §3.2.1 response.
  return NextResponse.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      logo_uri: client.logoUri ?? undefined,
      client_uri: client.clientUri ?? undefined,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    },
    { status: 201 },
  );
}
