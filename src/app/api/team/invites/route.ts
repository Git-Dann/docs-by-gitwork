import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createInvite, listInvites } from "@/server/team";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { z } from "zod";
import { ROLE_IDS } from "@/types/auth";

const inviteSchema = z.object({
  label: z.string().max(120).optional().nullable(),
  email: z.string().trim().max(320).optional().nullable(),
  role: z.enum(ROLE_IDS).optional().nullable(),
  isDeveloper: z.boolean().optional(),
});

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
    const body = inviteSchema.parse(await req.json().catch(() => ({})));
    const invite = await createInvite(actor.workspaceId, actor.id, {
      label: body.label,
      email: body.email || null,
      role: body.role ?? null,
      isDeveloper: body.isDeveloper ?? false,
      inviterRole: actor.role,
    });
    return apiOk(invite);
  } catch (e) {
    return fromError(e);
  }
}
