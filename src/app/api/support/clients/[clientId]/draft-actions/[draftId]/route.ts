import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateDraftAction } from "@/server/support";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = await request.json();
    const draftAction = await updateDraftAction(draftId, body);
    return apiOk({ draftAction });
  } catch (error) {
    return fromError(error);
  }
}
