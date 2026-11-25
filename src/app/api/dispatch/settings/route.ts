/**
 * GET / PATCH /api/dispatch/settings — Settings → Dispatch (§156). Super Admins only.
 *
 *   assistantEnabled  the release switch for the assistant (app panel + Slack)
 *   budgetUsd         the AI budget the hourly check alerts against (50/80/95%)
 *   budgetSince       YYYY-MM-DD to count a one-off pot from; null for each calendar month
 *   figmaToken        a Figma personal access token; checked with Figma before it is saved,
 *                     stored encrypted, never sent back (only whether one is set)
 *
 * Other dispatchConfig keys (the Slack status answers' settings) are kept as they are.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { resolveDispatchConfig } from "@/server/dispatch/config";
import { budgetStatus } from "@/server/dispatch/assistant/budget";
import { readSecret, storeSecret } from "@/server/stored-secret";
import { recordAuditEntry } from "@/server/audit-log";

export const dynamic = "force-dynamic";

async function view(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { dispatchConfig: true, figmaToken: true } });
  const config = resolveDispatchConfig(ws?.dispatchConfig);
  return {
    assistantEnabled: config.assistantEnabled,
    budgetUsd: config.budgetUsd,
    budgetSince: config.budgetSince,
    figmaConnected: Boolean(readSecret(ws?.figmaToken)),
    spend: await budgetStatus(workspaceId),
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    return apiOk(await view(user.workspaceId));
  } catch (err) {
    return fromError(err);
  }
}

const patchSchema = z
  .object({
    assistantEnabled: z.boolean().optional(),
    budgetUsd: z.number().min(1).max(100_000).optional(),
    budgetSince: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    /** A new token; null removes it. */
    figmaToken: z.string().trim().min(10).max(200).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const body = patchSchema.parse(await req.json());

    const ws = await prisma.workspace.findUnique({ where: { id: user.workspaceId }, select: { dispatchConfig: true } });
    const stored = ws?.dispatchConfig && typeof ws.dispatchConfig === "object" ? (ws.dispatchConfig as Record<string, unknown>) : {};
    const nextConfig: Record<string, unknown> = { ...stored };
    if (body.assistantEnabled !== undefined) nextConfig.assistantEnabled = body.assistantEnabled;
    if (body.budgetUsd !== undefined) nextConfig.budgetUsd = body.budgetUsd;
    if (body.budgetSince !== undefined) nextConfig.budgetSince = body.budgetSince;

    const data: Prisma.WorkspaceUpdateInput = { dispatchConfig: nextConfig as Prisma.InputJsonValue };
    if (body.figmaToken !== undefined) {
      if (body.figmaToken === null) {
        data.figmaToken = null;
      } else {
        // Saved only if Figma accepts it, so a typo can't sit there looking connected.
        const me = await fetch("https://api.figma.com/v1/me", {
          headers: { "X-Figma-Token": body.figmaToken },
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (!me?.ok) return apiError("Figma didn't accept that token. Check it and try again.", 400);
        data.figmaToken = storeSecret(body.figmaToken);
      }
    }

    await prisma.workspace.update({ where: { id: user.workspaceId }, data });
    await recordAuditEntry({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "settings.dispatch.updated",
      target: "dispatch",
      // Never the token itself: only whether it changed.
      after: {
        ...(body.assistantEnabled !== undefined ? { assistantEnabled: body.assistantEnabled } : {}),
        ...(body.budgetUsd !== undefined ? { budgetUsd: body.budgetUsd } : {}),
        ...(body.budgetSince !== undefined ? { budgetSince: body.budgetSince } : {}),
        ...(body.figmaToken !== undefined ? { figmaToken: body.figmaToken === null ? "removed" : "set" } : {}),
      },
    });
    return apiOk(await view(user.workspaceId));
  } catch (err) {
    return fromError(err);
  }
}
