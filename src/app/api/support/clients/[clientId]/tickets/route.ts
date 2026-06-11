import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listTickets, createTicket } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const limit = request.nextUrl.searchParams.get("limit");
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const { tickets, nextCursor } = await listTickets(clientId, {
      limit: limit ? Math.max(1, Number(limit)) : undefined,
      cursor,
    });
    return apiOk({ tickets, nextCursor });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = await request.json();
    const ticket = await createTicket(clientId, body);
    return apiOk({ ticket }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
