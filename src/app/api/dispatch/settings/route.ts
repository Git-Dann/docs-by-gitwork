/**
 * GET / PATCH /api/dispatch/settings — Settings → Dispatch (§156). Super Admins only.
 *
 *   assistantEnabled  the release switch for the assistant (app panel + Slack)
 *   budgetUsd         the AI budget the hourly check alerts against (50/80/95%)
 *   budgetSince       YYYY-MM-DD to count a one-off pot from; null for each calendar month
 *   figmaToken        a Figma personal access token; checked with Figma before it is saved,
 *                     stored encrypted, never sent back (only whether one is set)
 *   anthropicAdminKey an Anthropic Admin key (sk-ant-admin…), so the budget uses Anthropic's
 *                     own billed spend (§159); checked against Anthropic's cost report before it
 *                     is saved, stored encrypted, never sent back
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
import { anthropicAdminKey, anthropicBilledSince } from "@/server/ai-cost";
import { designChoices } from "@/lib/dispatch/figma";

export const dynamic = "force-dynamic";

async function view(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { dispatchConfig: true, figmaToken: true, anthropicAdminApiKey: true },
  });
  const config = resolveDispatchConfig(ws?.dispatchConfig);
  return {
    assistantEnabled: config.assistantEnabled,
    budgetUsd: config.budgetUsd,
    budgetSince: config.budgetSince,
    figmaConnected: Boolean(readSecret(ws?.figmaToken)),
    anthropicConnected: Boolean(ws && anthropicAdminKey(ws)),
    /** Set on the server (ANTHROPIC_ADMIN_KEY), so it can't be changed here. */
    anthropicKeyFromServer: Boolean(process.env.ANTHROPIC_ADMIN_KEY?.trim()),
    spend: await budgetStatus(workspaceId),
  };
}

/**
 * Saved only if Figma accepts it, so a typo can't sit there looking connected. Checked the way
 * Dispatch uses it: by opening one of this workspace's linked Figma designs, which needs only the
 * "File content: read" scope. (It used to ask Figma "who am I?", which needs a scope a read-only
 * token is usually made without, so good tokens were refused.) Returns the problem, or null.
 */
async function checkFigmaToken(workspaceId: string, token: string): Promise<string | null> {
  const designs = await prisma.clientDesign.findMany({
    where: { client: { workspaceId }, url: { contains: "figma.com" } },
    select: { name: true, url: true },
    take: 25,
  });
  const design = designChoices(designs)[0] ?? null;
  const res = await fetch(`https://api.figma.com/v1/${design ? `files/${design.fileKey}?depth=1` : "me"}`, {
    headers: { "X-Figma-Token": token },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) return "Figma didn't answer. Try again in a moment.";
  if (res.ok) return null;
  const body = (await res.text().catch(() => "")).slice(0, 400);
  if (/invalid token|expired|revoked/i.test(body)) {
    return "Figma says that token isn't valid. It may have been copied wrongly, expired or been revoked: make a new one.";
  }
  if (/scope/i.test(body)) {
    return "Figma accepted the token but it's missing a permission. Make a new one with \"File content\" set to read-only.";
  }
  if (design && (res.status === 403 || res.status === 404)) {
    return `The token works, but it can't open "${design.name}". Make it from a Figma account that can see the clients' design files.`;
  }
  return `Figma refused the token (${res.status}).`;
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
    /** A new Anthropic Admin key; null removes it. */
    anthropicAdminKey: z.string().trim().min(20).max(300).nullable().optional(),
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
        const problem = await checkFigmaToken(user.workspaceId, body.figmaToken);
        if (problem) return apiError(problem, 400);
        data.figmaToken = storeSecret(body.figmaToken);
      }
    }

    if (body.anthropicAdminKey !== undefined) {
      if (body.anthropicAdminKey === null) {
        data.anthropicAdminApiKey = null;
      } else {
        if (!body.anthropicAdminKey.startsWith("sk-ant-admin")) {
          return apiError("That isn't an Anthropic Admin key. They start with sk-ant-admin and are made in the Claude Console under Settings → Admin keys.", 400);
        }
        // Saved only if Anthropic's cost report answers with it.
        const now = new Date();
        const check = await anthropicBilledSince(body.anthropicAdminKey, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), now);
        if (!check) return apiError("Anthropic didn't accept that Admin key for its cost report. Check it's an Admin key for the organisation the API key belongs to.", 400);
        data.anthropicAdminApiKey = storeSecret(body.anthropicAdminKey);
      }
      // Forget figures read with the old key.
      await prisma.aiResponseCache.deleteMany({ where: { workspaceId: user.workspaceId, cacheKey: { startsWith: "ai-billed:" } } });
      await prisma.aiResponseCache.deleteMany({ where: { workspaceId: user.workspaceId, cacheKey: "ai-cost" } });
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
        ...(body.anthropicAdminKey !== undefined ? { anthropicAdminKey: body.anthropicAdminKey === null ? "removed" : "set" } : {}),
      },
    });
    return apiOk(await view(user.workspaceId));
  } catch (err) {
    return fromError(err);
  }
}
