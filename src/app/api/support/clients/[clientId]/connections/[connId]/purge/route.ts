import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { clientId, connId } = await params;
    await requireSupportClient(req, clientId, "manage");
    await requireSupportRow("connection", connId, clientId);

    const conn = await prisma.accountConnection.findFirst({
      where: { id: connId, clientId },
      select: { source: true },
    });
    if (!conn) return apiError("Connection not found", 404);

    const { count } = await prisma.supportConversation.deleteMany({
      where: { clientId, source: conn.source },
    });

    return apiOk({ deleted: count });
  } catch (err) {
    return fromError(err);
  }
}
