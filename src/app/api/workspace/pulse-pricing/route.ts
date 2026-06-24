/**
 * GET   /api/workspace/pulse-pricing → Pulse engagement pricing config (with defaults)
 * PATCH /api/workspace/pulse-pricing → merge-update it
 *
 * Single workspace today (per ensureBaseRecords). Drives the deterministic dev-tier
 * pricing engine (src/server/pulse-pricing.ts).
 */

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import { resolvePricingConfig } from "@/server/pulse-pricing";

const patchSchema = z.object({
  fxFromUsd: z.number().positive().max(10).optional(),
  dayRateOverrideGbp: z.number().positive().max(10000).nullable().optional(),
  seniority: z.enum(["mid", "senior"]).optional(),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    return apiOk({ config: resolvePricingConfig(workspace.pulsePricingConfig) });
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

    const current = resolvePricingConfig(workspace.pulsePricingConfig);
    const next = { ...current, ...parsed.data };
    // null dayRateOverrideGbp clears the override (fall back to the rate-card blend).
    if (parsed.data.dayRateOverrideGbp === null) delete (next as { dayRateOverrideGbp?: number }).dayRateOverrideGbp;

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { pulsePricingConfig: next as unknown as Prisma.InputJsonValue },
      select: { pulsePricingConfig: true },
    });

    const session = await auth();
    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: session?.user?.id ?? null,
      action: "settings.pulse_pricing.updated",
      target: "workspace.pulsePricingConfig",
      metadata: { ...parsed.data },
    });

    return apiOk({ config: resolvePricingConfig(updated.pulsePricingConfig) });
  } catch (error) {
    return fromError(error);
  }
}
