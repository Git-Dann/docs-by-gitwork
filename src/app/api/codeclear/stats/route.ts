import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getCodeClearStats } from "@/server/codeclear";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const stats = await getCodeClearStats(prisma, workspace.id);

    return apiOk(stats);
  } catch (error) {
    return fromError(error);
  }
}
