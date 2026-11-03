import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, assertInternal, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { importLeadToFoundry } from "@/server/pulse-lite/leads-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // kicks off a full AI scan in the background

/** POST /api/pulse/leads/[id]/import — authed. Creates a full workspace scan from a lead. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // A lead is a member of the public's email address and scan: internal only, like the list.
    const user = await getEffectiveUserOrNull(request);
    assertInternal(user);
    // Starts a paid full scan.
    assertCan(user, canManagePulse, "run full scans for Pulse leads");
    const { id } = await params;
    const result = await importLeadToFoundry(id);
    return apiOk(result, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
