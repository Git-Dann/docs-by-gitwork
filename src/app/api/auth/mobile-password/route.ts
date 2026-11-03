// POST /api/auth/mobile-password { email, password }
//
// The iOS app's email-and-password sign-in (multi-tenant Phase 3). Trades an email and
// password for the same per-user Foundry mobile JWT that /api/auth/mobile-callback mints
// from a Google ID token, and answers in the same shape, so the app stores and uses it
// exactly as it does the Google one.
//
// Who may use it is `isPasswordLoginAllowed` (types/auth.ts), checked inside
// `verifyPassword` and again here: guests in Gitwork's workspace, and everyone in any
// other business. Gitwork's own staff stay Google-only.
//
// ⚠️ Never create, provision or promote anything here. A password only ever signs in to
// a membership that already exists and is active: there is no first-admin bootstrap and
// no auto-provisioning on this path (unlike the Google exchange).
//
// ⚠️ Every refusal is the same 401 with the same words: unknown email, wrong password, a
// Google-only account, an archived member. Telling them apart would let anyone find out
// which emails have accounts.
//
// Public route (under /api/auth, no API_KEY required), so it is rate limited per IP and
// per email before any password is checked.

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { verifyPassword } from "@/server/auth/password-login";
import { findHomeMembership } from "@/server/auth/home-membership";
import { signMobileToken } from "@/server/auth/mobile-jwt";
import { recomputeMember } from "@/server/permissions";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { isPasswordLoginAllowed } from "@/types/auth";

const NO_MATCH_MESSAGE = "That email and password didn't match an account.";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 30;
const MAX_PER_EMAIL = 10;
const TOO_MANY = "Too many sign-in attempts. Wait a few minutes and try again.";

const requestSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const email = body.email.toLowerCase();

    const ip = clientIpFrom(request.headers) ?? "unknown";
    await assertWithinRateLimit({ bucket: `mobile-password:ip:${ip}`, max: MAX_PER_IP, windowMs: WINDOW_MS, message: TOO_MANY });
    await assertWithinRateLimit({ bucket: `mobile-password:email:${email}`, max: MAX_PER_EMAIL, windowMs: WINDOW_MS, message: TOO_MANY });

    const result = await verifyPassword(email, body.password);
    if (!result.ok) return apiError(NO_MATCH_MESSAGE, 401);

    // The membership the token is for. verifyPassword has already refused an archived
    // member and a role that may not use a password. This re-reads it so the token names
    // exactly the membership that was checked, and refuses again if it changed in between.
    const membership = await findHomeMembership(result.userId);
    if (!membership || !isPasswordLoginAllowed(membership.role, membership.workspace.slug)) {
      return apiError(NO_MATCH_MESSAGE, 401);
    }

    const permissions = await recomputeMember(membership.id);
    const token = await signMobileToken({
      sub: result.userId,
      email: result.email,
      role: membership.role,
      permissions,
      workspaceId: membership.workspaceId,
    });

    return apiOk({
      token,
      user: {
        id: result.userId,
        email: result.email,
        name: result.name,
        role: membership.role,
        permissions,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
