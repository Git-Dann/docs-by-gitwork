/**
 * GET   /api/account → current signed-in user's profile (id, email, name, avatarUrl, role)
 * PATCH /api/account → update the current user's name and/or avatarUrl
 *
 * Email is sourced from the OAuth provider and treated as read-only. Role lives on
 * `WorkspaceMember` and is also read-only here — admin promotion is done from the Team UI.
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

    const user = await prisma.user.findUnique({
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
    if (!user) return apiError("User not found", 404);

    const membership = user.memberships[0];
    return apiOk({
      account: {
        id: user.id,
        email: user.email,
        name: user.name ?? "",
        avatarUrl: user.avatarUrl ?? "",
        role: membership?.role ?? "STAFF",
        permissions: (membership?.permissions as string[] | null) ?? [],
      },
    });
  } catch (error) {
    return fromError(error);
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
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
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
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
