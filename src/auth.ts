import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { ensureBaseRecords } from "@/server/bootstrap";

const membershipInclude = {
  where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
  include: { workspace: true },
  take: 1,
} as const;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        let user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { memberships: membershipInclude },
        });

        // First-run bootstrap: if the initial admin email is set and that user
        // doesn't exist yet, create them now rather than requiring an API call first.
        if (!user && credentials.email === process.env.INITIAL_ADMIN_EMAIL) {
          await ensureBaseRecords().catch(() => {});
          user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
            include: { memberships: membershipInclude },
          });
        }

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );
        if (!valid) return null;

        const membership = user.memberships[0];

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: membership?.role ?? "STAFF",
          permissions: (membership?.permissions as string[]) ?? [],
        };
      },
    }),
  ],
});
