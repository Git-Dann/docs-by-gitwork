/**
 * GET   /api/account → current signed-in user's profile (id, email, name, avatarUrl, role)
 * PATCH /api/account → update the current user's avatarUrl
 *
 * `email` and `name` are sourced from the OAuth provider and treated as read-only here. We sync
 * `User.name` from the session on every GET so the DB never drifts behind a Google profile
 * update. Avatar URL is the one piece of identity the user can override locally.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);

    const sessionName = session.user.name?.trim() || "";
    const sessionEmail = session.user.email?.trim() || "";

    // Look up the User row. If it's missing for any reason (e.g. the DB was reset after the
    // JWT was issued), we still return something useful so the UI doesn't break — and we
    // upsert behind the scenes so subsequent requests are consistent.
    let user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        memberships: {
          where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
          take: 1,
          select: { role: true, permissions: true },
        },
      },
    });

    if (!user && sessionEmail) {
      // Lazy re-provision from session — same shape as the auth.ts JWT callback uses on
      // first sign-in. Falling back to email-prefix is harmless and short-lived.
      user = await prisma.user.upsert({
        where: { email: sessionEmail },
        create: {
          id: session.user.id,
          email: sessionEmail,
          name: sessionName || sessionEmail.split("@")[0],
        },
        update: {},
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          memberships: {
            where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
            take: 1,
            select: { role: true, permissions: true },
          },
        },
      });
    }

    if (!user) return apiError("User not found", 404);

    // Keep DB name in sync with the live Google profile name. We only update when something
    // changed — most reads are no-ops.
    if (sessionName && sessionName !== (user.name ?? "")) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: sessionName },
      });
      user.name = sessionName;
    }

    const membership = user.memberships[0];
    return apiOk({
      account: {
        id: user.id,
        email: user.email,
        name: user.name ?? "",
        avatarUrl: user.avatarUrl ?? "",
        role: membership?.role ?? (session.user.role ?? "STAFF"),
        permissions:
          (membership?.permissions as string[] | null) ?? session.user.permissions ?? [],
      },
    });
  } catch (error) {
    return fromError(error);
  }
}

const patchSchema = z.object({
  avatarUrl: z.string().trim().max(2048).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
      },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    return apiOk({
      account: {
        id: updated.id,
        email: updated.email,
        name: updated.name ?? "",
        avatarUrl: updated.avatarUrl ?? "",
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
