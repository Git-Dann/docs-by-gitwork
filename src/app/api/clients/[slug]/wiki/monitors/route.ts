import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { loadWikiMonitors, createMonitor, setWikiMonitorsEnabled } from "@/server/wiki-monitors";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

export const maxDuration = 60;

const monitorInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["HTTP", "TCP"]),
  target: z.string().min(1),
  method: z.string().optional(),
  expectedStatus: z.number().int().min(100).max(599).nullable().optional(),
  keyword: z.string().max(200).nullable().optional(),
  degradedMs: z.number().int().min(1).max(120000).nullable().optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiMonitors(clientId));
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = monitorInputSchema.parse(await req.json());
    return apiOk(await createMonitor(clientId, body));
  } catch (err) {
    return fromError(err);
  }
}

// Toggle the Monitors section on/off (the sidebar Add New / delete).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiMonitorsEnabled(clientId, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}
