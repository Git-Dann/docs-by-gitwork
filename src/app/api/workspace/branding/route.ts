/**
 * GET  /api/workspace/branding  → current workspace branding JSON (with defaults filled in)
 * PATCH /api/workspace/branding → merge-update the workspace branding JSON
 *
 * The workspace is a singleton (per `bootstrap.ts::ensureBaseRecords()`), so we always operate on
 * the first/only workspace. When multi-workspace lands this becomes per-workspace.
 */

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  EMPTY_WORKSPACE_BRANDING,
  parseWorkspaceBranding,
  type WorkspaceBranding,
} from "@/server/documents";

const brandingSchema = z.object({
  brandLogoUrl: z.string().max(2048).optional(),
  coverTopAccentUrl: z.string().max(2048).optional(),
  coverBottomAccentUrl: z.string().max(2048).optional(),
  defaultConfidentialityInternal: z.string().max(2048).optional(),
  defaultConfidentialityExternal: z.string().max(2048).optional(),
  defaultBrandLockup: z.enum(["GITWORK", "CLIENT_X_GITWORK"]).optional(),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const current = parseWorkspaceBranding(workspace.branding);
    return apiOk({ branding: current });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError("Invalid JSON body", 400);
    }

    const parsed = brandingSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(", ");
      return apiError(message, 400);
    }

    const current = parseWorkspaceBranding(workspace.branding);
    const next: WorkspaceBranding = {
      ...EMPTY_WORKSPACE_BRANDING,
      ...current,
      ...parsed.data,
    };

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      // WorkspaceBranding is a structured shape; serialize to Prisma's InputJsonValue so the
      // generic constraint on `branding Json?` is satisfied.
      data: { branding: next as unknown as Prisma.InputJsonValue },
      select: { branding: true },
    });

    const session = await auth();
    const changedFields = Object.keys(parsed.data).filter(
      (key) =>
        JSON.stringify(parsed.data[key as keyof typeof parsed.data]) !==
        JSON.stringify(current[key as keyof typeof current]),
    );
    if (changedFields.length > 0) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: session?.user?.id ?? null,
        action: "settings.branding.updated",
        target: `workspace.branding.${changedFields.join("+")}`,
        metadata: { changedFields },
      });
    }

    return apiOk({ branding: parseWorkspaceBranding(updated.branding) });
  } catch (error) {
    return fromError(error);
  }
}
