// OAuth 2.0 Token Revocation (RFC 7009).
//
//   POST /api/oauth/revoke
//     token=<value>            (required)
//     token_type_hint=...      (optional — ignored; we look at the prefix)
//     client_id=<id>           (recommended — for audit)
//
// RFC 7009 §2.2: the endpoint MUST respond 200 even for unknown tokens, to
// avoid leaking which token values exist. We comply.
//
// No auth: a stolen token CAN'T be used to revoke other tokens (revokeTokenByValue
// only kills the presented token + its sibling), so requiring auth would just
// stop legitimate disconnects from non-session contexts (like the Claude
// client's logout flow).

import { NextResponse } from "next/server";
import { revokeTokenByValue } from "@/server/oauth";

export const dynamic = "force-dynamic";

async function readForm(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function POST(request: Request) {
  const params: Record<string, string> = await readForm(request).catch(() => ({}));
  const token = params.token;
  if (!token) {
    // RFC 7009 §2.1: missing token is an invalid_request error.
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing token." },
      { status: 400 },
    );
  }
  await revokeTokenByValue(token);
  // RFC 7009 §2.2: success is 200 with empty body.
  return new NextResponse(null, { status: 200 });
}
