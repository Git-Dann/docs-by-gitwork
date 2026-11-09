import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getTicket, updateTicket, deleteTicket } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ticketId: string }> },
) {
  try {
    const { clientId, ticketId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("ticket", ticketId, clientId);
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
    const { clientId, ticketId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("ticket", ticketId, clientId);
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
    const { clientId, ticketId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("ticket", ticketId, clientId);
    await deleteTicket(ticketId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
