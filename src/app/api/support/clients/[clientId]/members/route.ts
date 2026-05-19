import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listWorkspaceMembers } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  _ctx: { params: Promise<{ clientId: string }> },
) {
  try {
    const members = await listWorkspaceMembers();
    return apiOk({ members });
  } catch (error) {
    return fromError(error);
  }
}
