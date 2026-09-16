import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { addWikiIntakeItem, setWikiIntakeEnabled } from "@/server/wiki";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { resolveRequestedBy } from "@/server/wiki-intake-attribution";

const bodySchema = z.object({
  type: z.enum(["BUG", "FEEDBACK", "TASK", "DESIGN"]).default("FEEDBACK"),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalRef: z.string().trim().max(180).optional().nullable(),
  label: z.enum(["BACKEND", "FRONTEND", "UI_UX", "RESEARCH", "DESIGN", "SUPPORT"]).optional().nullable(),
  /** One of the client's own category ids — decides `type` server-side. */
  categoryId: z.string().trim().max(64).optional().nullable(),
  device: z.string().trim().max(120).optional().nullable(),
  osVersion: z.string().trim().max(60).optional().nullable(),
});

const toggleSchema = z.object({ enabled: z.boolean() });

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = bodySchema.parse(await req.json());
    // Internal path: attribute to the signed-in Gitwork user, so a request logged
    // on a client's behalf says who logged it without anyone typing their own name.
    // Falls back to whatever was sent for an API_KEY-only caller (no per-user identity).
    const user = await getEffectiveUserOrNull(req);
    return apiOk(
      await addWikiIntakeItem(clientId, {
        ...body,
        requestedBy: resolveRequestedBy({
          staffName: user?.name ?? user?.email,
          typedName: body.requestedBy,
        }),
      }),
      { status: 201 },
    );
  } catch (err) {
    return fromError(err);
  }
}

// Toggle the Requests (intake) section on/off (the sidebar Add New / delete).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiIntakeEnabled(clientId, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}
