import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getPulseLeadPreview } from "@/server/pulse-lite/leads-admin";

export const dynamic = "force-dynamic";

/** GET /api/pulse/leads/[id]/preview — authed, read-only. The lead's own scan
 * checks, so the team can see what it found before importing it into Foundry. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const preview = await getPulseLeadPreview(id);
    return apiOk(preview);
  } catch (error) {
    return fromError(error);
  }
}
