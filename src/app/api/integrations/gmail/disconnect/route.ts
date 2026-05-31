/**
 * POST /api/integrations/gmail/disconnect → clear the *current user's* Google OAuth tokens.
 *
 * Disconnects this user only. Other teammates' connections are unaffected. The workspace
 * service account / shared cron token is also untouched — that's an admin-managed
 * separate resource.
 */

import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        googleOAuthRefreshToken: null,
        googleOAuthEmail: null,
      },
    });
    return apiOk({ disconnected: true });
  } catch (error) {
    return fromError(error);
  }
}
