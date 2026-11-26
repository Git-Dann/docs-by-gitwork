/**
 * Who's who at Gitwork, for Dispatch's chat context (§169): the asker's job title and the
 * leadership team, from Staff records (`Candidate.jobTitle`, `employmentType`). Dan, 26 Nov:
 * asked "who is the best MD?", Dispatch should be cheeky, and mention Harry too.
 *
 * Job titles are shown on Staff and public profiles to everyone, so this is fine for anyone
 * asking; nothing else from a Staff record (HR, pay, personal details) is read.
 */

import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";

export interface PeopleContext {
  askerTitle: string | null;
  /** "Dan Lindsay, Managing Director". At most six. */
  leadership: string[];
}

/** A title that makes someone part of the leadership team. */
export function isLeadershipTitle(title: string | null | undefined, employmentType?: string | null): boolean {
  if (employmentType === "DIRECTOR") return true;
  return /\b(director|founder|co-?founder|ceo|cto|coo|cfo|md|managing partner)\b/i.test(title ?? "");
}

export async function peopleContext(user: EffectiveUser): Promise<PeopleContext> {
  const records = await prisma.candidate.findMany({
    where: {
      workspaceId: user.workspaceId,
      archivedAt: null,
      NOT: { origin: "EXTERNAL" },
      OR: [{ memberId: null }, { member: { archivedAt: null } }],
      AND: [{ OR: [{ jobTitle: { not: null } }, { employmentType: "DIRECTOR" }] }],
    },
    select: { name: true, email: true, jobTitle: true, employmentType: true, member: { select: { userId: true, user: { select: { name: true } } } } },
    take: 200,
  });
  const mine = records.find(
    (r) => r.member?.userId === user.id || (r.email && user.email && r.email.toLowerCase() === user.email.toLowerCase()),
  );
  const leadership = records
    .filter((r) => isLeadershipTitle(r.jobTitle, r.employmentType))
    .map((r) => {
      const name = r.member?.user?.name?.trim() || r.name;
      return r.jobTitle ? `${name}, ${r.jobTitle}` : `${name}, Director`;
    })
    .filter((v, i, all) => all.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 6);
  return { askerTitle: mine?.jobTitle?.trim() || null, leadership };
}
