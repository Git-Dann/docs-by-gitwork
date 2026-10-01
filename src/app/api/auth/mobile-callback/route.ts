// POST /api/auth/mobile-callback
//
// iOS auth bootstrap. Trades a Google ID token (obtained via GoogleSignIn-iOS
// with serverClientID set) for a per-user Foundry mobile JWT.
//
// This endpoint mirrors the auto-provisioning behaviour of the NextAuth jwt
// callback in src/auth.ts (creates a User + WorkspaceMember on first sign-in,
// promotes the first real account to ADMIN when only the bootstrap user exists).
//
// Public route (no API_KEY required) — this is the bootstrap for all other
// authenticated calls. Domain gate (@gitwork.co.uk) is enforced inside the
// Google ID token verifier.

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  GoogleIdTokenError,
  verifyGoogleIdToken,
} from "@/server/auth/google-id-token";
import { signMobileToken } from "@/server/auth/mobile-jwt";
import { isActiveMember } from "@/server/auth/member-status";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { KNOWN_SUPER_ADMIN_EMAILS, recomputeMember } from "@/server/permissions";
import { DEFAULT_PROVISIONED_ROLE } from "@/types/auth";

const WORKSPACE_DOMAIN = "gitwork.co.uk";
// Placeholder user created by bootstrap — never a real human team member.
const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

const requestSchema = z.object({
  idToken: z.string().min(1),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());

    let profile;
    try {
      profile = await verifyGoogleIdToken(body.idToken, {
        requiredHostedDomain: WORKSPACE_DOMAIN,
      });
    } catch (error) {
      if (error instanceof GoogleIdTokenError) {
        return apiError(error.message, 401);
      }
      throw error;
    }

    // Confirm workspace domain on email too (belt-and-braces — hd claim is
    // only present for Workspace accounts; this guards against personal
    // accounts that share the domain).
    if (!profile.email.toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`)) {
      return apiError("Account is not in the Gitwork workspace.", 403);
    }

    // Find or create the user. Mirrors the auto-provisioning in src/auth.ts.
    let dbUser = await prisma.user.findUnique({
      where: { email: profile.email },
      include: {
        memberships: {
          where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
          take: 1,
        },
      },
    });

    // ⚠️ Refuse a removed or archived member BEFORE anything is created or promoted.
    // This used to fall through to `role = membership?.role ?? "STAFF"` and sign a
    // mobile token: a removed person (User row kept, membership gone) got a fresh
    // STAFF token, and an archived one kept their old role, for the token's whole
    // lifetime. Mirrors `refusedMembership` in src/auth.ts — keep the two in step.
    if (dbUser) {
      const existing = dbUser.memberships[0];
      if (!existing || !isActiveMember(existing)) {
        return apiError("Your access to this workspace has been removed.", 403);
      }
    }

    // A known owner email is always Super Admin; the first real member bootstraps as
    // Super Admin. Mirrors src/auth.ts.
    const isKnownSuperAdmin = KNOWN_SUPER_ADMIN_EMAILS.includes(profile.email);
    // includes-archived: the first-admin bootstrap — see src/auth.ts. Counting archived
    // admins is the fail-safe direction.
    const adminOrAboveCount = await prisma.workspaceMember.count({
      where: {
        workspace: { slug: DEFAULT_WORKSPACE_SLUG },
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        user: { email: { not: BOOTSTRAP_USER_EMAIL } },
      },
    });
    const shouldBeSuperAdmin = isKnownSuperAdmin || adminOrAboveCount === 0;

    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name ?? profile.email.split("@")[0],
          memberships: {
            create: {
              role: shouldBeSuperAdmin ? "SUPER_ADMIN" : DEFAULT_PROVISIONED_ROLE,
              permissions: [],
              workspace: { connect: { slug: DEFAULT_WORKSPACE_SLUG } },
            },
          },
        },
        include: {
          memberships: {
            where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
            take: 1,
          },
        },
      });
    } else if (
      shouldBeSuperAdmin &&
      dbUser.memberships[0] &&
      dbUser.memberships[0].role !== "SUPER_ADMIN"
    ) {
      await prisma.workspaceMember.update({
        where: { id: dbUser.memberships[0].id },
        data: { role: "SUPER_ADMIN" },
      });
      dbUser.memberships[0].role = "SUPER_ADMIN";
    }

    const membership = dbUser.memberships[0];
    const role = membership?.role ?? DEFAULT_PROVISIONED_ROLE;
    // Resolve + persist effective permissions from the role matrix.
    const permissions = membership ? await recomputeMember(membership.id) : [];

    const token = await signMobileToken({
      sub: dbUser.id,
      email: dbUser.email,
      role,
      permissions,
    });

    return apiOk({
      token,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role,
        permissions,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
