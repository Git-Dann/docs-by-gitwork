/**
 * Gmail OAuth callback for Care connectors.
 * Exchanges the auth code for tokens, fetches the account email,
 * stores the refresh token in ChannelToken, and marks the connection CONNECTED.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const base = process.env.NEXTAUTH_URL ?? "https://foundry-by-gitwork.vercel.app";
  const careUrl = `${base}/app/support`;

  const code = searchParams.get("code");
  const connId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !connId) {
    return NextResponse.redirect(`${careUrl}?gmail_error=${encodeURIComponent(error ?? "missing_params")}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${careUrl}?gmail_error=server_config`);
  }

  const redirectUri = `${base}/api/support/auth/gmail/callback`;

  try {
    // Exchange code for tokens
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

    const tokens = (await tokenRes.json()) as {
      refresh_token?: string;
      access_token?: string;
      error?: string;
    };

    if (!tokenRes.ok || !tokens.refresh_token) {
      return NextResponse.redirect(
        `${careUrl}?gmail_error=${encodeURIComponent(tokens.error ?? "no_refresh_token")}`,
      );
    }

    // Fetch the connected account's email
    let email: string | null = null;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = (await userRes.json()) as { email?: string };
      email = userInfo.email ?? null;
    } catch {
      // Non-fatal — we store the token even without the email
    }

    // Replace any existing ChannelToken for this connection and mark as connected
    await prisma.$transaction([
      prisma.channelToken.deleteMany({ where: { connectionId: connId } }),
      prisma.channelToken.create({
        data: {
          connectionId: connId,
          tokenData: { refreshToken: tokens.refresh_token, email } as object,
        },
      }),
      prisma.accountConnection.update({
        where: { id: connId },
        data: { health: "CONNECTED" },
      }),
    ]);

    return NextResponse.redirect(`${careUrl}?gmail_connected=${encodeURIComponent(email ?? "1")}`);
  } catch {
    return NextResponse.redirect(`${careUrl}?gmail_error=exchange_failed`);
  }
}
