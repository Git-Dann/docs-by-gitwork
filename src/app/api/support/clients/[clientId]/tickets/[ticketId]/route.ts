import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getTicket, updateTicket, deleteTicket } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ticket = await getTicket(ticketId);
    return apiOk({ ticket });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ticketId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care tickets");
    const { ticketId } = await params;
    const body = await request.json();
    const ticket = await updateTicket(ticketId, body);
    return apiOk({ ticket });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ticketId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care tickets");
    const { ticketId } = await params;
    await deleteTicket(ticketId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
