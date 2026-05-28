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
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

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

    // First real human to sign in becomes the admin.
    const realAdminCount = await prisma.workspaceMember.count({
      where: {
        workspace: { slug: DEFAULT_WORKSPACE_SLUG },
        role: "ADMIN",
        user: { email: { not: BOOTSTRAP_USER_EMAIL } },
      },
    });
    const shouldBeAdmin = realAdminCount === 0;

    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name ?? profile.email.split("@")[0],
          memberships: {
            create: {
              role: shouldBeAdmin ? "ADMIN" : "STAFF",
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
    } else if (shouldBeAdmin && dbUser.memberships[0]?.role === "STAFF") {
      await prisma.workspaceMember.update({
        where: { id: dbUser.memberships[0].id },
        data: { role: "ADMIN" },
      });
      dbUser.memberships[0].role = "ADMIN";
    }

    const membership = dbUser.memberships[0];
    const role = membership?.role ?? "STAFF";
    const permissions = (membership?.permissions as string[]) ?? [];

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
