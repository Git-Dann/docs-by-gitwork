/**
 * Initiates Gmail OAuth for a specific Care connector.
 * The connId is passed as the OAuth state parameter so the callback
 * knows which connection to store the token against.
 */

import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const connId = request.nextUrl.searchParams.get("connId");
  if (!connId) return apiError("connId is required", 400);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return apiError("GOOGLE_CLIENT_ID not configured", 500);

  const base = process.env.NEXTAUTH_URL ?? "https://foundry.gitwork.co.uk";
  const redirectUri = `${base}/api/support/auth/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: connId,
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
