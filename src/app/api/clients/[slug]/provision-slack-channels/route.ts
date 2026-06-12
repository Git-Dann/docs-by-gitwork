/**
 * POST /api/clients/[slug]/provision-slack-channels
 *
 * Phase-3 retry endpoint. Called from the Edit-client modal when a previous
 * provisioning attempt left `slackProvisionError` populated, or when an admin
 * wants to add a channel after the fact. Body shape mirrors the create-time
 * provisioning options.
 *
 * Runs the work synchronously (this isn't a high-frequency path) so the UI can
 * surface success / verbatim error inline rather than polling.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { provisionClientChannels } from "@/server/slack/provisioning";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  createInternal: z.boolean().optional(),
  createExternal: z.boolean().optional(),
  externalInviteeEmail: z.string().trim().email().optional(),
  customInternalName: z.string().trim().optional(),
  customExternalName: z.string().trim().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureBaseRecords();
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "provision Slack channels");
    const { slug } = await params;

    const client = await prisma.workspaceClient.findFirst({
      where: { slug, workspaceId: user!.workspaceId },
      select: { id: true },
    });
    if (!client) return apiError("Client not found.", 404);

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    if (!body.createInternal && !body.createExternal) {
      return apiError("Pick at least one channel to provision.", 400);
    }

    const result = await provisionClientChannels(client.id, {
      createInternal: body.createInternal,
      createExternal: body.createExternal,
      externalInviteeEmail: body.externalInviteeEmail,
      customInternalName: body.customInternalName,
      customExternalName: body.customExternalName,
    });

    if (!result.ok) {
      return apiError(result.errors.join(" · "), 502);
    }
    return apiOk({
      internal: result.internal ?? null,
      external: result.external ?? null,
    });
  } catch (err) {
    return fromError(err);
  }
}
