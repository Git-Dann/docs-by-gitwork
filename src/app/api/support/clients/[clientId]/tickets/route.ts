import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listTickets, createTicket } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const tickets = await listTickets(clientId);
    return apiOk({ tickets });
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
