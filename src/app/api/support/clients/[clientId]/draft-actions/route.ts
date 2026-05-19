import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listDraftActions, createDraftAction } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const draftActions = await listDraftActions(clientId);
    return apiOk({ draftActions });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = await request.json();
    const draftAction = await createDraftAction(clientId, body);
    return apiOk({ draftAction }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
