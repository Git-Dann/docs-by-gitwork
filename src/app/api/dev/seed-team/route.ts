/**
 * POST /api/dev/seed-team — one-shot, admin-only.
 *
 * Creates Foundry accounts (User + WorkspaceMember) for the confirmed Gitwork
 * roster and backfills `Candidate.email` in the Code module by name. Idempotent;
 * never clobbers an existing member's role/permissions. See src/server/team-roster.ts.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { seedGitworkTeam } from "@/server/team-roster";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (user.role !== "ADMIN") return apiError("Admin only", 403);
    const report = await seedGitworkTeam();
    return apiOk(report);
  } catch (e) {
    return fromError(e);
  }
}
