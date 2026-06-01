import { redirect } from "next/navigation";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return apiError("GOOGLE_CLIENT_ID env var not configured", 500);
  }

  const redirectUri = `${process.env.NEXTAUTH_URL ?? "https://foundry.gitwork.co.uk"}/api/integrations/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
  });

  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
