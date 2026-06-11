import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listConversations, createConversation } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const limit = request.nextUrl.searchParams.get("limit");
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const { conversations, nextCursor } = await listConversations(clientId, {
      limit: limit ? Math.max(1, Number(limit)) : undefined,
      cursor,
    });
    return apiOk({ conversations, nextCursor });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care conversations");
    const { clientId } = await params;
    const body = await request.json();
    const conversation = await createConversation(clientId, body);
    return apiOk({ conversation }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
