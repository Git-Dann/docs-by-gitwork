import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { deleteMonitor, updateMonitor } from "@/server/pulse-agents/monitor";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "OFF"]).optional(),
  isActive: z.boolean().optional(),
  alertThreshold: z.number().int().min(1).max(50).optional(),
});

function appUrl(request: NextRequest): string {
  const host = request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> },
) {
  try {
    const { monitorId } = await params;
    const body = patchSchema.parse(await request.json());
    const monitor = await updateMonitor(monitorId, body, appUrl(request));
    if (!monitor) return apiError("Monitor not found.", 404);
    return apiOk({ monitor });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> },
) {
  try {
    const { monitorId } = await params;
    await deleteMonitor(monitorId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
