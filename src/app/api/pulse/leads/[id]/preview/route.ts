import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertInternal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getPulseLeadPreview } from "@/server/pulse-lite/leads-admin";

export const dynamic = "force-dynamic";

/** GET /api/pulse/leads/[id]/preview — authed, read-only. The lead's own scan
 * checks, so the team can see what it found before importing it into Foundry. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // A lead is a member of the public's email address and scan: internal only, like the list.
    const user = await getEffectiveUserOrNull(request);
    assertInternal(user);
    const { id } = await params;
    const preview = await getPulseLeadPreview(id);
    return apiOk(preview);
  } catch (error) {
    return fromError(error);
  }
}
