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
    const [user, workspace] = await Promise.all([
      prisma.user.findUnique({
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
      }),
      prisma.workspace.findFirst({
        where: { slug: DEFAULT_WORKSPACE_SLUG },
        select: { showDevRates: true, docsBackupEnabled: true },
      }),
    ]);

    let mutableUser = user;
    if (!mutableUser && sessionEmail) {
      // Lazy re-provision from session — same shape as the auth.ts JWT callback uses on
      // first sign-in. Falling back to email-prefix is harmless and short-lived.
      mutableUser = await prisma.user.upsert({
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

    if (!mutableUser) return apiError("User not found", 404);

    // Keep DB name in sync with the live Google profile name. We only update when something
    // changed — most reads are no-ops.
    if (sessionName && sessionName !== (mutableUser.name ?? "")) {
      await prisma.user.update({
        where: { id: mutableUser.id },
        data: { name: sessionName },
      });
      mutableUser.name = sessionName;
    }

    const membership = mutableUser.memberships[0];
    return apiOk({
      account: {
        id: mutableUser.id,
        email: mutableUser.email,
        name: mutableUser.name ?? "",
        avatarUrl: mutableUser.avatarUrl ?? "",
        role: membership?.role ?? (session.user.role ?? "STAFF"),
        permissions:
          (membership?.permissions as string[] | null) ?? session.user.permissions ?? [],
        showDevRates: workspace?.showDevRates ?? false,
        docsBackupEnabled: workspace?.docsBackupEnabled ?? false,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}

// Avatar URLs can be either a remote URL (Google photo) or a base64 data URL coming from the
// ImagePicker. We allow up to ~8MB encoded so even chunky uploads round-trip. Stored on the
// User row — eventual move to an object-storage upload pipeline can shrink this back down.
const patchSchema = z.object({
  avatarUrl: z.string().trim().max(8_000_000).optional(),
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
