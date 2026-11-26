/**
 * Who's on a client: the people assigned to it (ClientAssignment, active members only) plus
 * anyone with an open Code placement on it, the same two sources that give a person access to a
 * client (client-assignments.ts). Used to invite the team into a client's new internal Slack
 * channel, and to tell Dispatch who's on the client whose channel it's answering in (§168).
 *
 * Names and emails only. A placement's person may not have a Foundry account; they're still on
 * the team (Portal lists them), matched to Slack by email.
 */

import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";

export interface TeamMember {
  name: string;
  email: string | null;
}

export async function clientTeam(workspaceId: string, clientId: string): Promise<TeamMember[]> {
  const [assigned, placements] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: { workspaceId, clientId },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    prisma.placement.findMany({
      where: { clientId, endDate: null, candidate: { workspaceId } },
      select: { candidate: { select: { name: true, email: true } } },
    }),
  ]);
  // An archived member is no longer on anyone's team.
  const active = new Set(
    (
      await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: assigned.map((a) => a.userId) }, ...ACTIVE_MEMBER },
        select: { userId: true },
      })
    ).map((m) => m.userId),
  );
  const people = [
    ...assigned.filter((a) => active.has(a.userId)).map((a) => ({ name: a.user.name ?? a.user.email ?? "", email: a.user.email ?? null })),
    ...placements.map((p) => ({ name: p.candidate.name, email: p.candidate.email ?? null })),
  ];
  return dedupeTeam(people);
}

/** One row per person: the same email (any case) or, with no email, the same name. */
export function dedupeTeam(people: readonly TeamMember[]): TeamMember[] {
  const seen = new Map<string, TeamMember>();
  for (const p of people) {
    const name = p.name.trim();
    if (!name && !p.email) continue;
    const key = p.email?.trim().toLowerCase() || `name:${name.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { name: name || (p.email ?? ""), email: p.email?.trim() || null });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
