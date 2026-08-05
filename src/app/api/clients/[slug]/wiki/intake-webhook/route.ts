/**
 * GET  /api/clients/[slug]/wiki/intake-webhook → current URL + whether a secret exists
 * POST /api/clients/[slug]/wiki/intake-webhook → set or clear it ({ url: string | null })
 *
 * Where a client's status changes are POSTed so their tracker can follow without
 * polling (docs/client-intake-api.md). Internal + gated on managing clients: the
 * URL decides where a client's request data gets sent, so it isn't a setting
 * every member should be able to repoint.
 *
 * The signing secret is returned ONCE, on the POST that mints it — after that
 * only its existence is reported, so it can't be harvested from a GET.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getIntakeWebhook, setIntakeWebhook } from "@/server/wiki-intake-webhook";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().trim().max(2000).nullable() });

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "view the intake webhook");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await getIntakeWebhook(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "set the intake webhook");
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { url } = bodySchema.parse(await req.json());
    // setIntakeWebhook rejects non-https and any host that resolves to a private
    // or reserved range — an operator pasting an internal URL by mistake finds out
    // here rather than via silent delivery failures.
    return apiOk(await setIntakeWebhook(clientId, url));
  } catch (err) {
    return fromError(err);
  }
}
