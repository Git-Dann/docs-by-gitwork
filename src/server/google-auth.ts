/**
 * Per-user Google OAuth helper. Returns an authenticated OAuth2 client for the *signed-in
 * user*, never a workspace-shared token.
 *
 * Use this for personal dashboard widgets (Calendar, Gmail, Meeting summary) — anywhere
 * the data must scope to the current user. Shared workspace flows (cron sync, Care Gmail
 * ingest) should keep using `Workspace.googleOAuthRefreshToken` because they need a single
 * stable account, not per-user.
 */

import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type UserGoogleAuthResult =
  | { ok: true; client: InstanceType<typeof google.auth.OAuth2>; email: string | null }
  | { ok: false; reason: "not_authenticated" | "not_connected" | "server_misconfigured" };

export async function getUserGoogleAuth(): Promise<UserGoogleAuthResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: "not_authenticated" };

  const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, reason: "server_misconfigured" };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { googleOAuthRefreshToken: true, googleOAuthEmail: true },
  });

  if (!user?.googleOAuthRefreshToken) return { ok: false, reason: "not_connected" };

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: user.googleOAuthRefreshToken });

  return { ok: true, client, email: user.googleOAuthEmail };
}
