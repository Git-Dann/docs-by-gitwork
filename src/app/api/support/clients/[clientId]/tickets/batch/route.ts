import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { batchUpdateTickets } from "@/server/support";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = (await request.json()) as {
      ticketIds: string[];
      data: { status?: string; priority?: string; assignedTo?: string };
    };
    if (!Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return apiError("ticketIds must be a non-empty array", 400);
    }
    const result = await batchUpdateTickets(clientId, body.ticketIds, body.data as Parameters<typeof batchUpdateTickets>[2]);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
