import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireScanAccess } from "@/server/pulse";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getFindingStates, setFindingDecision } from "@/server/pulse-findings";

export const dynamic = "force-dynamic";

/** GET /api/pulse/scans/[scanId]/findings — the team's decisions and board tasks for this scan's project. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const { scanId } = await params;
    await requireScanAccess(request, scanId);
    return apiOk(await getFindingStates(scanId));
  } catch (error) {
    return fromError(error);
  }
}

const decisionSchema = z.object({
  checkKey: z.string().min(1).max(120),
  decision: z.enum(["ACCEPTED_RISK", "FALSE_POSITIVE"]).nullable(),
  note: z.string().max(1000).nullable().optional(),
}).strict();

/** PUT — accept the risk of, dismiss as not a real issue, or (decision: null) reopen one finding. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManagePulse, "triage Pulse findings");
    const { scanId } = await params;
    await requireScanAccess(request, scanId);
    const body = decisionSchema.parse(await request.json());
    await setFindingDecision(user, scanId, body.checkKey, body.decision, body.note ?? null);
    return apiOk(await getFindingStates(scanId));
  } catch (error) {
    return fromError(error);
  }
}
