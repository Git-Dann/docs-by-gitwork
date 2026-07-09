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
import { originFrom } from "@/lib/request-origin";
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

function schemeHandoff(fragment: string, kind: "signedin" | "error") {
  const target = `${CALLBACK}#${fragment}`;
  const heading = kind === "signedin" ? "Signed in" : "Sign-in problem";
  const message =
    kind === "signedin"
      ? "Returning you to Foundry…"
      : "Only @gitwork.co.uk Google accounts can use Foundry.";
  // Browsers (Chrome/Arc/Edge) silently block an automatic redirect to a custom URL scheme
  // without a user gesture, so return an interstitial that BOTH auto-attempts the handoff and
  // offers a click button (the gesture those browsers require).
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Return to Foundry</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAFAF9;color:#0F172A;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.card{width:min(440px,92vw);padding:40px;border:1px solid rgba(0,0,0,.08);border-radius:16px;background:#fff;text-align:center}
.eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748B;margin:0 0 12px}
h1{font-size:22px;margin:0 0 6px;font-weight:600}
p{margin:6px 0;color:#475569;font-size:15px}
.muted{color:#64748B;font-size:13px;margin-top:18px}
.btn{display:inline-block;margin-top:20px;background:#1D4ED8;color:#fff;text-decoration:none;font-weight:500;font-size:14px;padding:11px 22px;border-radius:6px}
@media (prefers-color-scheme:dark){body{background:#0F0F0D;color:#F5F5F5}.card{background:#1E1E1C;border-color:rgba(255,255,255,.08)}p{color:#CBD5E1}}
</style></head><body>
<div class="card">
<p class="eyebrow">Foundry for Mac</p>
<h1>${heading}</h1>
<p>${message}</p>
<a class="btn" href="${target}">Open Foundry</a>
<p class="muted">If Foundry doesn't open automatically, click the button. You can close this tab afterwards.</p>
</div>
<script>setTimeout(function(){try{window.location.href=${JSON.stringify(target)}}catch(e){}},300)</script>
</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;

  // Not signed in → bounce through the normal NextAuth sign-in, returning here afterwards.
  if (!email) {
    const signInUrl = new URL("/api/auth/signin", originFrom(request));
    signInUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Belt-and-braces domain gate (NextAuth's signIn callback already enforces this).
  if (!email.toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`)) {
    return schemeHandoff("error=domain", "error");
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

  return schemeHandoff(`token=${encodeURIComponent(token)}`, "signedin");
}
