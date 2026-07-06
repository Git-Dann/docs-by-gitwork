import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { createInvite, listInvites } from "@/server/team";
import { isAtLeast } from "@/types/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || !isAtLeast(session.user.role, "ADMIN")) {
      return apiError("Forbidden", 403);
    }
    const invites = await listInvites();
    return apiOk(invites);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Unauthorized", 401);
    if (!isAtLeast(session.user.role, "ADMIN")) return apiError("Forbidden", 403);
    const body = await req.json().catch(() => ({}));
    const invite = await createInvite(session.user.id, body.label ?? undefined);
    return apiOk(invite);
  } catch (e) {
    return fromError(e);
  }
}
