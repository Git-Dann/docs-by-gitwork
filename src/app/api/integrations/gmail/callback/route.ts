import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const settingsUrl = `${process.env.NEXTAUTH_URL ?? "https://foundry-by-gitwork.vercel.app"}/app/settings`;

  if (error || !code) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=${encodeURIComponent(error ?? "no_code")}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=server_config`);
  }

  const redirectUri = `${process.env.NEXTAUTH_URL ?? "https://foundry-by-gitwork.vercel.app"}/api/integrations/gmail/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json() as { refresh_token?: string; error?: string };

    if (!tokenRes.ok || !tokens.refresh_token) {
      return NextResponse.redirect(`${settingsUrl}?gmail_error=${encodeURIComponent(tokens.error ?? "no_refresh_token")}`);
    }

    await prisma.workspace.updateMany({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data: { googleOAuthRefreshToken: tokens.refresh_token },
    });

    return NextResponse.redirect(`${settingsUrl}?gmail_connected=1`);
  } catch {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=exchange_failed`);
  }
}
