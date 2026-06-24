import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { listConversations, createConversation } from "@/server/support";
import type { ConversationStatus, ConversationPriority, SupportSource } from "@/types/support";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const sp = request.nextUrl.searchParams;
    const limit = sp.get("limit");
    const cursor = sp.get("cursor") ?? undefined;

    // status accepts a comma-separated list (e.g. "new,open")
    const statusParamRaw = sp.get("status");
    const status = statusParamRaw
      ? (statusParamRaw.split(",").map((s) => s.trim()).filter(Boolean) as ConversationStatus[])
      : undefined;

    // assigneeId="me" resolves to the signed-in user
    let assigneeId = sp.get("assigneeId") ?? undefined;
    if (assigneeId === "me") {
      const user = await getEffectiveUserOrNull(request);
      assigneeId = user?.id;
    }

    const { conversations, nextCursor } = await listConversations(clientId, {
      limit: limit ? Math.max(1, Number(limit)) : undefined,
      cursor,
      status,
      assigneeId,
      priority: (sp.get("priority") as ConversationPriority) ?? undefined,
      issueType: sp.get("issueType") ?? undefined,
      source: (sp.get("source") as SupportSource) ?? undefined,
      includeSnoozedDue: sp.get("includeSnoozedDue") === "1",
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
