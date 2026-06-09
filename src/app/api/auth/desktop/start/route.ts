// GET /api/auth/desktop/start
//
// Desktop (macOS app) sign-in bridge.
//
// The Mac app opens this URL in the user's default browser. The user signs in with their
// @gitwork.co.uk Google account on the real Foundry site (standard NextAuth web login); once
// authenticated, we mint the SAME per-user mobile JWT the iOS app uses and 302-redirect to the
// app's custom scheme (foundry://auth-callback#token=…), which the app captures via onOpenURL.
//
// This reuses the existing mobile-JWT infra (mirrors /api/auth/mobile-callback's provisioning)
// so no server secret ever reaches the client. Public route (no API_KEY) — same as the other
// /api/auth/* endpoints. A specific route out-prioritises the /api/auth/[...nextauth] catch-all.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { signMobileToken } from "@/server/auth/mobile-jwt";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { KNOWN_SUPER_ADMIN_EMAILS, recomputeMember } from "@/server/permissions";

export const dynamic = "force-dynamic";

const WORKSPACE_DOMAIN = "gitwork.co.uk";
// Placeholder user created by bootstrap — never a real human team member.
const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";
// Hard-coded callback scheme (the app registers `foundry://`). Never a user-supplied value,
// so this is not an open redirect.
const CALLBACK = "foundry://auth-callback";

function redirectToScheme(fragment: string) {
  // Custom-scheme redirects can't go through NextResponse.redirect()'s URL validation, so set
  // the Location header directly. The default browser hands `foundry://…` to the OS, which
  // launches the app with the full URL (fragment included).
  return new NextResponse(null, { status: 302, headers: { Location: `${CALLBACK}#${fragment}` } });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;

  // Not signed in → bounce through the normal NextAuth sign-in, returning here afterwards.
  if (!email) {
    const signInUrl = new URL("/api/auth/signin", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Belt-and-braces domain gate (NextAuth's signIn callback already enforces this).
  if (!email.toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`)) {
    return redirectToScheme("error=domain");
  }

  // Find or provision the user — mirrors /api/auth/mobile-callback and src/auth.ts.
  let dbUser = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } }, take: 1 } },
  });

  const isKnownSuperAdmin = KNOWN_SUPER_ADMIN_EMAILS.includes(email);
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
        email,
        name: session.user?.name ?? email.split("@")[0],
        memberships: {
          create: {
            role: shouldBeSuperAdmin ? "SUPER_ADMIN" : "STAFF",
            permissions: [],
            workspace: { connect: { slug: DEFAULT_WORKSPACE_SLUG } },
          },
        },
      },
      include: { memberships: { where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } }, take: 1 } },
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
  const role = membership?.role ?? "STAFF";
  const permissions = membership ? await recomputeMember(membership.id) : [];

  const token = await signMobileToken({ sub: dbUser.id, email: dbUser.email, role, permissions });

  return redirectToScheme(`token=${encodeURIComponent(token)}`);
}
