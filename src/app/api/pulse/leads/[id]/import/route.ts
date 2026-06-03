import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { importLeadToFoundry } from "@/server/pulse-lite/leads-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // kicks off a full AI scan in the background

/** POST /api/pulse/leads/[id]/import — authed. Creates a full workspace scan from a lead. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await importLeadToFoundry(id);
    return apiOk(result, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
