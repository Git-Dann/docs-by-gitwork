/**
 * Slack webhook subscription mutation endpoints.
 *
 *   PATCH  /api/settings/slack-webhooks/[id]   → enable/disable, change label or event kinds
 *   DELETE /api/settings/slack-webhooks/[id]   → remove the subscription
 *
 * All scoped to the workspace resolved via `ensureBaseRecords()`. A 404 is returned for any id
 * that belongs to a different workspace, which doubles as a tenant guard.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_EVENTS = [
  "DOC_SHARED",
  "DOC_VIEWED",
  "DOC_SENT",
  "DOC_SIGNED",
  "DOC_COMPLETED",
  "DOC_DECLINED",
  "COMMENT_ADDED",
] as const;

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  eventKinds: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const existing = await prisma.slackWebhookSubscription.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== workspace.id) {
      return apiError("Webhook not found", 404);
    }

    const updated = await prisma.slackWebhookSubscription.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.eventKinds !== undefined ? { eventKinds: body.eventKinds } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });

    return apiOk({
      subscription: {
        id: updated.id,
        label: updated.label,
        webhookUrlPreview:
          updated.webhookUrl.slice(0, 28) + "…" + updated.webhookUrl.slice(-6),
        eventKinds: updated.eventKinds,
        enabled: updated.enabled,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;

    const existing = await prisma.slackWebhookSubscription.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== workspace.id) {
      return apiError("Webhook not found", 404);
    }

    await prisma.slackWebhookSubscription.delete({ where: { id } });
    return apiOk({ deletedId: id });
  } catch (error) {
    return fromError(error);
  }
}
