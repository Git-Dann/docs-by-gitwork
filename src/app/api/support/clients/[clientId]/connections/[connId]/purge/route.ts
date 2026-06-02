import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { clientId, connId } = await params;

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
