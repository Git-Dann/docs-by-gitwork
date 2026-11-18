/**
 * The developers card on a Portal client (src/components/clients/client-detail.tsx): what each
 * placed developer shows. Pure, so the server and the tests share one rule.
 */

import type { ClientPlacementRecord } from "@/types/client";
import type { CoverAssignmentDTO } from "@/types/backstage";

/**
 * A placed developer's stack for the Portal card: their primary stack first, then up to three
 * more, de-duplicated (case-insensitively) with blanks dropped.
 */
export function placementStack(primary: string | null, more: string[]): string[] {
  const out: string[] = [];
  for (const raw of [primary ?? "", ...more]) {
    const v = raw.trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length === 4) break;
  }
  return out;
}

/**
 * The account photo wins over the Staff record's. A `data:` URL is never sent: a list response
 * carrying inline images once reached 156MB (see the avatar-blob rule), and Avatar falls back to
 * initials anyway.
 */
export function placementAvatarUrl(userAvatar: string | null, recordAvatar: string | null): string | null {
  for (const url of [userAvatar, recordAvatar]) {
    const v = url?.trim();
    if (v && !v.startsWith("data:")) return v;
  }
  return null;
}



export type DeveloperCard = {
  candidateId: string;
  name: string;
  jobTitle: string | null;
  stack: string[];
  avatarUrl: string | null;
  /** Every project they're on for this client (two placements = one card). */
  projects: string[];
  /** Earliest start across their open placements. */
  since: string;
  /** Total allocation across their open placements, capped at 100. */
  allocationPercent: number;
  /** Off right now, with who is covering. */
  onLeave: { until: string | null; coveredBy: string | null } | null;
  /** First names of the people they're covering for here. */
  covering: string[];
};

/**
 * The developers on a client, as cards. Active first (longest on the client first), past
 * placements apart, and any stand-in who isn't placed here kept separately so nobody covering
 * is missing from the card.
 *
 * Leave is matched on the account (the placement's user id against the cover's), never on a
 * name: two people can share one, and a wrong "on leave" is worse than none.
 */
export function developerCards(
  placements: ClientPlacementRecord[],
  covers: CoverAssignmentDTO[],
): { active: DeveloperCard[]; past: ClientPlacementRecord[]; standIns: CoverAssignmentDTO[] } {
  const open = placements.filter((p) => !p.endDate);
  const byCandidate = new Map<string, ClientPlacementRecord[]>();
  for (const p of open) {
    byCandidate.set(p.candidateId, [...(byCandidate.get(p.candidateId) ?? []), p]);
  }

  const activeUserIds = new Set(open.map((p) => p.candidateUserId).filter((id): id is string => Boolean(id)));
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

  const active: DeveloperCard[] = [...byCandidate.values()].map((group) => {
    const head = group[0];
    const userId = group.find((p) => p.candidateUserId)?.candidateUserId ?? null;
    const leave = userId ? covers.find((c) => c.absentUserId === userId) : undefined;
    const since = group.map((p) => p.startDate).sort()[0] ?? head.startDate;
    return {
      candidateId: head.candidateId,
      name: head.candidateName,
      jobTitle: head.candidateJobTitle,
      stack: head.candidateStack,
      avatarUrl: head.candidateAvatarUrl,
      projects: [...new Set(group.map((p) => p.projectName.trim()).filter(Boolean))],
      since,
      allocationPercent: Math.min(100, group.reduce((n, p) => n + p.allocationPercent, 0)),
      onLeave: leave ? { until: leave.endDate, coveredBy: leave.coverUserName } : null,
      covering: userId ? covers.filter((c) => c.coverUserId === userId).map((c) => first(c.absentUserName)) : [],
    };
  });
  active.sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name));

  const past = placements
    .filter((p) => p.endDate && !byCandidate.has(p.candidateId))
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));

  const standIns = covers.filter((c) => !c.coverUserId || !activeUserIds.has(c.coverUserId));
  return { active, past, standIns };
}
