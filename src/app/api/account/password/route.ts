/**
 * POST /api/account/password → the signed-in user changes their OWN password.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Until now the only way a password could be set was an admin doing it for you
 * (`/api/team` on create, `/api/team/[userId]/reset-password` after), which is fine
 * for an internal account nobody signs into with a password. It is not fine for a
 * guest: their first password is one somebody typed into a form and then told them
 * over Slack or email, and with no way to change it that password stays in that
 * channel's history for as long as the account exists.
 *
 * ── Two rules ────────────────────────────────────────────────────────────────
 * 1. The CURRENT password is required, and verified, even though the caller is
 *    already authenticated. A session cookie is not proof of knowing the password —
 *    a borrowed laptop is enough — and an attacker who can silently change it locks
 *    the owner out of their own account.
 * 2. Only a role that can actually SIGN IN with a password may set one. For anyone
 *    else the field is write-only dead weight, and writing to it quietly expands the
 *    blast radius of `/api/auth/forgot-password` (see server/auth/password-login.ts).
 */

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { isPasswordLoginAllowed } from "@/server/auth/password-login";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

// ⚠️ NOT exported. A Next route file may only export the handlers and a fixed set of
// config keys (`dynamic`, `runtime`, …); exporting anything else fails the build with
// "does not match the required types of a Next.js Route" — which `tsc` cannot see, so
// only `next build` catches it (CLAUDE.md §40.3).
//
// Eight is the floor `/api/team` and `/api/team/[userId]/reset-password` already use, so
// this does not become the one route with a different idea of what a password is.
const MIN_PASSWORD_LENGTH = 8;

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        passwordHash: true,
        memberships: {
          where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (!user) return apiError("Not authenticated", 401);

    // Read the role from the DATABASE, not the JWT. A token is issued at sign-in and
    // outlives a role change, so a member demoted since theirs was minted would still
    // be carrying the old one.
    if (!isPasswordLoginAllowed(user.memberships[0]?.role)) {
      return apiError(
        "This account signs in with Google, so it has no password to change.",
        400,
      );
    }

    if (!user.passwordHash) {
      // Reachable only if an admin cleared it. Say what to do rather than 500.
      return apiError("No password is set on this account. Ask an admin to set one.", 400);
    }

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return apiError("That is not your current password.", 400);
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return apiError("The new password is the same as the current one.", 400);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
