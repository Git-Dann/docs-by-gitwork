import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteMonitor } from "@/server/pulse-agents/monitor";

export const dynamic = "force-dynamic";

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
