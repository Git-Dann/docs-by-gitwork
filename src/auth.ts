import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { authConfig, SESSION_VERSION } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { autoAcceptMatchingInvite } from "@/server/team";
import { KNOWN_SUPER_ADMIN_EMAILS, recomputeMember } from "@/server/permissions";

// The placeholder email created by bootstrap — never a real team member
const BOOTSTRAP_USER_EMAIL = "owner@gitwork.io";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      // Uses AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET env vars
      // (separate from GOOGLE_CLIENT_ID/SECRET used by the Care Gmail connector)
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      // Request Gmail + Calendar read access so dashboard widgets work
      authorization: {
        params: {
          scope:
            "openid email profile " +
            "https://www.googleapis.com/auth/gmail.readonly " +
            "https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          // Force the consent prompt every sign-in so Google always returns a refresh_token.
          // Without this, Google only returns refresh_token on the *first* consent — which
          // meant the workspace held whichever person signed in first, and personal widgets
          // would cross-pollute as people re-signed in. With per-user tokens, each member
          // gets their own refresh_token captured on each sign-in, so the dashboard always
          // shows their own data.
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Restrict to @gitwork.co.uk accounts only
      if (!user.email?.endsWith("@gitwork.co.uk")) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // On first sign-in, look up or create the user in the DB
      if (account && user?.email) {
        let dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          include: {
            memberships: {
              where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
              take: 1,
            },
          },
        });

        // A known owner email is always a Super Admin; and the very first real member
        // (no Admin/Super Admin exists yet) bootstraps as Super Admin so the workspace
        // is never left without one who can edit the role matrix.
        const isKnownSuperAdmin = KNOWN_SUPER_ADMIN_EMAILS.includes(user.email);
        const adminOrAboveCount = await prisma.workspaceMember.count({
          where: {
            workspace: { slug: DEFAULT_WORKSPACE_SLUG },
            role: { in: ["ADMIN", "SUPER_ADMIN"] },
            user: { email: { not: BOOTSTRAP_USER_EMAIL } },
          },
        });
        const shouldBeSuperAdmin = isKnownSuperAdmin || adminOrAboveCount === 0;

        // Auto-provision new Gitwork team members. New members default to STAFF (whose
        // access is whatever the role matrix grants); a Super Admin can refine their role.
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: user.email,
              name: user.name ?? user.email.split("@")[0],
              memberships: {
                create: {
                  role: shouldBeSuperAdmin ? "SUPER_ADMIN" : "STAFF",
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
          // Promote an existing member to Super Admin (known owner, or first-admin bootstrap).
          await prisma.workspaceMember.update({
            where: { id: dbUser.memberships[0].id },
            data: { role: "SUPER_ADMIN" },
          });
          dbUser.memberships[0].role = "SUPER_ADMIN";
        }

        const membership = dbUser.memberships[0];
        token.id = dbUser.id;
        token.role = membership?.role ?? "STAFF";
        // Resolve + persist the member's effective permissions from the role matrix so
        // the JWT carries the live set (and the cached column stays in sync).
        token.permissions = membership ? await recomputeMember(membership.id) : [];
        // Stamp this fresh sign-in with the current SESSION_VERSION. The `authorized`
        // callback rejects tokens with an older value, forcing teammates with stale
        // sessions to sign in again so their per-user Google refresh token gets captured.
        token.sessionVersion = SESSION_VERSION;

        // Persist the Google OAuth refresh token on the *current user* so personal dashboard
        // widgets (Calendar, Gmail, Meeting summary) only ever see the signed-in user's data.
        // Previously this was written to the workspace row, which meant every new sign-in
        // overwrote whoever signed in last — so the dashboard widgets cross-polluted between
        // teammates. Workspace-level token is reserved now for shared org-wide cron sync.
        if (account.refresh_token) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              googleOAuthRefreshToken: account.refresh_token,
              googleOAuthEmail: user.email,
            },
          });
        }

        // If this user signed in directly (not via /invite/[token]) but there's a pending
        // invite labelled with their name, mark it accepted so it doesn't linger in the
        // Team list. Heuristic match — safe enough for an internal tool. Failures are
        // swallowed so a stale invite never blocks sign-in.
        try {
          await autoAcceptMatchingInvite(dbUser.id, user.name);
        } catch (err) {
          console.error("[auth] autoAcceptMatchingInvite failed", err);
        }
      }

      // Return token directly — authConfig.callbacks.jwt is for credentials provider
      // and would overwrite the role we just set from the database
      return token;
    },
  },
});
