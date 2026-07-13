/**
 * GET   /api/workspace/pulse-embed → public Pulse embed config (kill-switch + curated
 *                                    check set, with defaults)
 * PATCH /api/workspace/pulse-embed → merge-update it
 *
 * Single workspace today (per ensureBaseRecords), same pattern as pulse-pricing/route.ts.
 */

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import { resolveEmbedCheckKeys } from "@/server/pulse-embed-config";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  checkKeys: z.array(z.string()).min(1).optional(),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    return apiOk({
      enabled: workspace.pulseEmbedEnabled,
      checkKeys: resolveEmbedCheckKeys(workspace.pulseEmbedCheckKeys),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(parsed.data.enabled !== undefined ? { pulseEmbedEnabled: parsed.data.enabled } : {}),
        ...(parsed.data.checkKeys !== undefined ? { pulseEmbedCheckKeys: parsed.data.checkKeys as unknown as Prisma.InputJsonValue } : {}),
      },
      select: { pulseEmbedEnabled: true, pulseEmbedCheckKeys: true },
    });

    const session = await auth();
    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: session?.user?.id ?? null,
      action: "settings.pulse_embed.updated",
      target: "workspace.pulseEmbedConfig",
      metadata: { ...parsed.data },
    });

    return apiOk({
      enabled: updated.pulseEmbedEnabled,
      checkKeys: resolveEmbedCheckKeys(updated.pulseEmbedCheckKeys),
    });
  } catch (error) {
    return fromError(error);
  }
}
