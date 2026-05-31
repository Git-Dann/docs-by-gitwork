/**
 * Gmail OAuth callback — exchanges the auth code for a refresh token and stores it on the
 * *signed-in user*. Used by an explicit "Connect Gmail" flow (separate from the NextAuth
 * sign-in flow that also captures a refresh token).
 *
 * Per-user storage prevents cross-user data leak in dashboard widgets.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const settingsUrl = `${process.env.NEXTAUTH_URL ?? "https://foundry-by-gitwork.vercel.app"}/app/settings`;

  if (error || !code) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=${encodeURIComponent(error ?? "no_code")}`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=not_authenticated`);
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

    const tokens = (await tokenRes.json()) as { refresh_token?: string; error?: string };

    if (!tokenRes.ok || !tokens.refresh_token) {
      return NextResponse.redirect(`${settingsUrl}?gmail_error=${encodeURIComponent(tokens.error ?? "no_refresh_token")}`);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        googleOAuthRefreshToken: tokens.refresh_token,
        googleOAuthEmail: session.user.email ?? null,
      },
    });

    return NextResponse.redirect(`${settingsUrl}?gmail_connected=1`);
  } catch {
    return NextResponse.redirect(`${settingsUrl}?gmail_error=exchange_failed`);
  }
}
