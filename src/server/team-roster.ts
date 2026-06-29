// Server-side team-roster layer: account seeding + Code email backfill, built on
// the framework-free roster data in `src/lib/team-roster-aliases.ts`.
//
// The roster data + name/alias resolution now live in the lib module (no prisma)
// so client components — notably the CSV task importer — can cross-reference a
// ClickUp custom-dropdown assignee name against the same aliases. This file
// re-exports them for back-compat with existing server consumers
// (clickup-import, task-cleanse, tasks-standup, the seed route).

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { PERMISSION_PRESETS, DEFAULT_STAFF_PERMISSIONS } from "@/types/auth";
import {
  TEAM_ROSTER,
  findRosterByName,
  type RosterKind,
  type RosterEntry,
} from "@/lib/team-roster-aliases";

export { TEAM_ROSTER, findRosterByName };
export type { RosterKind, RosterEntry };

const DEV_PERMISSIONS =
  (PERMISSION_PRESETS.find((p) => p.id === "developer")?.permissions as string[] | undefined) ??
  ["clients", "support", "pulse", "backstage"];

function membership(kind: RosterKind): { role: "ADMIN" | "STAFF"; permissions: string[] } {
  if (kind === "admin") return { role: "ADMIN", permissions: [] };
  if (kind === "staff") return { role: "STAFF", permissions: DEFAULT_STAFF_PERMISSIONS };
  return { role: "STAFF", permissions: DEV_PERMISSIONS };
}

export type SeedTeamReport = {
  usersCreated: number;
  usersUpdated: number;
  membershipsCreated: number;
  candidatesEmailed: number;
  /** Code candidates whose name didn't match the roster (no email set). */
  unmatchedCandidates: string[];
};

/**
 * Idempotent. Creates/refreshes Foundry accounts for the roster and backfills
 * `Candidate.email` in the Code module by name. Never clobbers an existing
 * member's role/permissions (so manual tuning in Settings → People & access survives).
 */
export async function seedGitworkTeam(): Promise<SeedTeamReport> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });
  const report: SeedTeamReport = {
    usersCreated: 0,
    usersUpdated: 0,
    membershipsCreated: 0,
    candidatesEmailed: 0,
    unmatchedCandidates: [],
  };

  for (const entry of TEAM_ROSTER) {
    const existing = await prisma.user.findUnique({ where: { email: entry.email }, select: { id: true } });
    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: { name: entry.name },
      create: { email: entry.email, name: entry.name },
    });
    if (existing) report.usersUpdated++;
    else report.usersCreated++;

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      select: { id: true },
    });
    if (!member) {
      const { role, permissions } = membership(entry.kind);
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role, permissions },
      });
      report.membershipsCreated++;
    }
  }

  // Backfill Code candidate emails by name match.
  const candidates = await prisma.candidate.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true, email: true },
  });
  for (const c of candidates) {
    const entry = findRosterByName(c.name);
    if (!entry) {
      report.unmatchedCandidates.push(c.name);
      continue;
    }
    if (c.email !== entry.email) {
      await prisma.candidate.update({ where: { id: c.id }, data: { email: entry.email } });
      report.candidatesEmailed++;
    }
  }

  return report;
}
