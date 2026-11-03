import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createInvite, listInvites } from "@/server/team";
import { requireTeamAdmin } from "@/server/auth/team-admin";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireTeamAdmin(req);
    const invites = await listInvites(actor.workspaceId);
    return apiOk(invites);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireTeamAdmin(req);
    const body = await req.json().catch(() => ({}));
    const invite = await createInvite(actor.workspaceId, actor.id, body.label ?? undefined);
    return apiOk(invite);
  } catch (e) {
    return fromError(e);
  }
}
