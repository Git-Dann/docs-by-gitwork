import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireScanAccess } from "@/server/pulse";
import { assertCan, canManagePulse, requireAuthedUser } from "@/server/auth/effective-user";
import { getFindingStates, sendFindingToBoard } from "@/server/pulse-findings";

export const dynamic = "force-dynamic";

/** POST /api/pulse/scans/[scanId]/findings/task — put one finding on the linked client's board. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canManagePulse, "send Pulse findings to the board");
    const { scanId } = await params;
    await requireScanAccess(request, scanId);
    const { checkKey } = z.object({ checkKey: z.string().min(1).max(120) }).strict().parse(await request.json());
    const result = await sendFindingToBoard(user, scanId, checkKey);
    return apiOk({ ...result, ...(await getFindingStates(scanId)) });
  } catch (error) {
    return fromError(error);
  }
}
