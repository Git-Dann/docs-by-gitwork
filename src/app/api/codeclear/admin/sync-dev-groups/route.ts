import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

/**
 * One-shot admin endpoint that gets the workspace into the desired state
 * after the Pro bono + Syed-rate-permission rollout:
 *
 *   1. Marks any existing candidate whose githubHandle matches the
 *      Pro bono list as `devGroup = PRO_BONO` (idempotent — won't flip
 *      a manually re-assigned dev back).
 *   2. Grants `code.viewRates` to the listed @gitwork.co.uk users (Syed)
 *      across every WorkspaceMember row, preserving any other perms.
 *
 * The bootstrap also self-heals the devGroup case for any new request
 * (so this is mostly belt-and-braces); the permission flip however isn't
 * something bootstrap does, so this endpoint is the canonical way to
 * grant it after deploy.
 *
 * Admin-only. Idempotent — safe to re-run.
 */

const PRO_BONO_HANDLES = ["shahab", "hassaan"];
const RATE_VIEWER_EMAILS = ["syed@gitwork.co.uk"];
const RATE_PERMISSION = "code.viewRates";

// ⚠️ Admin is read from the DATABASE, not from `session.user.role`. A session carries the
// role it was minted with, so a just-archived or just-demoted admin kept these three
// routes — which delete demo data, rewrite dev groups and bulk-import candidates — until
// their token turned over. §88 replaced that pattern everywhere else; three byte-identical
// copies of the local helper were left behind here.

async function runSync(request: Request) {
  const workspace = { id: await workspaceIdForRequest(request) };

  // ── Pro bono devGroup sync ─────────────────────────────────────────
  const proBonoUpdated = await prisma.candidate.updateMany({
    where: {
      workspaceId: workspace.id,
      githubHandle: { in: PRO_BONO_HANDLES },
      devGroup: { not: "PRO_BONO" },
    },
    data: { devGroup: "PRO_BONO" },
  });

  // ── code.viewRates grant ───────────────────────────────────────────
  // Match by user email. Permissions live as a Json array on
  // WorkspaceMember; merge in the rate permission if missing, preserving
  // anything else the admin has set up.
  const members = await prisma.workspaceMember.findMany({
    where: {
      ...ACTIVE_MEMBER,
      workspaceId: workspace.id,
      user: { email: { in: RATE_VIEWER_EMAILS } },
    },
    include: { user: { select: { email: true } } },
  });

  let permissionsGranted = 0;
  for (const member of members) {
    const current = Array.isArray(member.permissions)
      ? (member.permissions as string[])
      : [];
    if (current.includes(RATE_PERMISSION)) continue;
    await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { permissions: [...current, RATE_PERMISSION] },
    });
    permissionsGranted++;
  }

  return {
    proBono: {
      handlesTargeted: PRO_BONO_HANDLES,
      updated: proBonoUpdated.count,
    },
    rateViewers: {
      emailsTargeted: RATE_VIEWER_EMAILS,
      membersFound: members.length,
      permissionsGranted,
      knownButMissing: RATE_VIEWER_EMAILS.filter(
        (email) => !members.some((m) => m.user?.email === email),
      ),
    },
  };
}

// Both verbs run the same operation — it's idempotent and admin-gated,
// so allowing GET means you can hit the URL straight from a logged-in
// browser tab while ergonomic GET-only API clients still work too.
export async function POST(request: Request) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));
    return apiOk(await runSync(request));
  } catch (error) {
    return fromError(error);
  }
}

export async function GET(request: Request) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));
    return apiOk(await runSync(request));
  } catch (error) {
    return fromError(error);
  }
}
