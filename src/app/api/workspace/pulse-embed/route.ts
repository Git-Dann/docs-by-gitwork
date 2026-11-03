/**
 * GET   /api/workspace/pulse-embed → public Pulse embed config (kill-switch, free-tier
 *                                    check set, booking link, Turnstile credentials)
 * PATCH /api/workspace/pulse-embed → merge-update it
 *
 * Single workspace today (per ensureBaseRecords), same pattern as pulse-pricing/route.ts.
 * The Turnstile secret is never returned in the GET/PATCH response — only whether one
 * is currently configured (from the workspace or the env var fallback).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import { encryptNullable } from "@/lib/encryption";
import { resolveBookingUrl } from "@/server/pulse-embed-config";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { serialiseFreeKeys } from "@/lib/pulse-free-tier";

const KNOWN_KEYS: ReadonlySet<string> = new Set(CHECKS_REGISTRY.map((c) => c.key));

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  bookingUrl: z.string().url().optional(),
  turnstileSiteKey: z.string().optional(),
  // null = no limit; an array = only these checks are shown in full on the free tier.
  freeCheckKeys: z.array(z.string()).max(5000).nullable().optional(),
  // Only sent when the user actually types a new secret — omitted (not empty-stringed)
  // to leave the stored one untouched.
  turnstileSecretKey: z.string().min(1).optional(),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const config = await getPulseEmbedWorkspaceConfig();
    return apiOk({
      enabled: workspace.pulseEmbedEnabled,
      bookingUrl: resolveBookingUrl(workspace.pulseEmbedBookingUrl),
      turnstileSiteKey: config.turnstileSiteKey,
      turnstileConfigured: Boolean(config.turnstileSiteKey) && Boolean(config.turnstileSecretKey),
      freeCheckKeys: config.freeCheckKeys,
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

    // Reject keys that are not in the catalogue rather than quietly dropping them — a typo
    // would otherwise save "successfully" and show nothing.
    if (parsed.data.freeCheckKeys) {
      const unknown = parsed.data.freeCheckKeys.filter((k) => !KNOWN_KEYS.has(k));
      if (unknown.length > 0) return apiError(`Unknown check(s): ${unknown.slice(0, 5).join(", ")}`, 400);
    }

    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(parsed.data.enabled !== undefined ? { pulseEmbedEnabled: parsed.data.enabled } : {}),
        ...(parsed.data.bookingUrl !== undefined ? { pulseEmbedBookingUrl: parsed.data.bookingUrl } : {}),
        ...(parsed.data.freeCheckKeys !== undefined
          ? { pulseEmbedCheckKeys: (serialiseFreeKeys(parsed.data.freeCheckKeys) as Prisma.InputJsonValue | null) ?? Prisma.DbNull }
          : {}),
        ...(parsed.data.turnstileSiteKey !== undefined ? { turnstileSiteKey: parsed.data.turnstileSiteKey } : {}),
        ...(parsed.data.turnstileSecretKey !== undefined ? { turnstileSecretKeyEncrypted: encryptNullable(parsed.data.turnstileSecretKey) } : {}),
      },
      select: {
        pulseEmbedEnabled: true,
        pulseEmbedBookingUrl: true,
        turnstileSiteKey: true,
      },
    });

    const session = await auth();
    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: session?.user?.id ?? null,
      action: "settings.pulse_embed.updated",
      target: "workspace.pulseEmbedConfig",
      // Never log the raw secret key — just note whether one was set this call.
      metadata: { ...parsed.data, freeCheckKeys: parsed.data.freeCheckKeys === undefined ? undefined : parsed.data.freeCheckKeys === null ? "no limit" : `${parsed.data.freeCheckKeys.length} checks`, turnstileSecretKey: parsed.data.turnstileSecretKey ? "[set]" : undefined },
    });

    const config = await getPulseEmbedWorkspaceConfig();
    return apiOk({
      enabled: updated.pulseEmbedEnabled,
      bookingUrl: resolveBookingUrl(updated.pulseEmbedBookingUrl),
      turnstileSiteKey: updated.turnstileSiteKey,
      turnstileConfigured: Boolean(config.turnstileSiteKey) && Boolean(config.turnstileSecretKey),
      freeCheckKeys: config.freeCheckKeys,
    });
  } catch (error) {
    return fromError(error);
  }
}
