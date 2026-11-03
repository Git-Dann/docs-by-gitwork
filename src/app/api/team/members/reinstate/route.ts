/**
 * POST /api/team/members/reinstate { email, role } — bring back someone whose
 * membership has gone (archived past the retention window, or removed before
 * archiving existed).
 *
 * Sign-in now REFUSES a person who has a User row but no membership — it no longer
 * re-provisions them as STAFF — so without this a returning hire could never get
 * back in under their own email. See reinstateMemberByEmail().
 */
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { reinstateMemberByEmail } from "@/server/team";
import { requireTeamAdmin } from "@/server/auth/team-admin";
import { recordAuditEntry } from "@/server/audit-log";
import { ROLE_IDS } from "@/types/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(ROLE_IDS),
});

export async function POST(request: Request) {
  try {
    const actor = await requireTeamAdmin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("Enter a valid email and role.", 400);

    const result = await reinstateMemberByEmail(parsed.data.email, parsed.data.role, actor);
    switch (result.status) {
      case "not-found":
        // Not an error a person can act on by retrying: they have never signed in,
        // so they will be provisioned normally when they do.
        return apiError("No one with that email has signed in before. They'll be added when they first sign in.", 404);
      case "already-active":
        return apiError("That person already has access.", 409);
      case "archived":
        return apiError("That person is archived. Use Restore on the Archived tab.", 409);
      case "reinstated":
        await recordAuditEntry({
          workspaceId: actor.workspaceId,
          actorId: actor.id,
          action: "team.member.reinstated",
          target: `member:${result.memberId}`,
          after: { role: parsed.data.role },
          metadata: { email: parsed.data.email },
        });
        return apiOk({ ok: true, memberId: result.memberId }, { status: 201 });
    }
  } catch (e) {
    return fromError(e);
  }
}
