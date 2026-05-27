import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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

        // Auto-provision new Gitwork team members
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: user.email,
              name: user.name ?? user.email.split("@")[0],
              memberships: {
                create: {
                  role: "STAFF",
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
        }

        const membership = dbUser.memberships[0];
        token.id = dbUser.id;
        token.role = membership?.role ?? "STAFF";
        token.permissions = (membership?.permissions as string[]) ?? [];
      }

      // Delegate remaining JWT logic to authConfig
      return authConfig.callbacks?.jwt?.({ token, user } as Parameters<NonNullable<typeof authConfig.callbacks.jwt>>[0]) ?? token;
    },
  },
});
