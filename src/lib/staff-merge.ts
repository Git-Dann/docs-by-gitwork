/**
 * Merging two Staff records that are the same person.
 *
 * Why it exists (Dan, Nov 2026): Hassaan had two records. The old developer card
 * ("Hassaan", @hassaan, nine placements, a rate) had no email, so linkStaffRecords could
 * never tie it to his login, and "Create profile" then made a second record for the login.
 * Nothing in Foundry could say "these are one person".
 *
 * The rules are pure so the route, the tests and the demo agree:
 *   - the OLDER record is kept, because its id is the one placements, notes and links use;
 *   - each field keeps the kept record's value when it has one, and takes the other's
 *     when it doesn't, so nothing filled in on either record is lost;
 *   - a merge that would have to throw information away is refused, with the reason.
 */

export interface MergeSide {
  id: string;
  name: string;
  createdAt: Date;
  memberId: string | null;
  githubHandle: string | null;
  hasPersonalDetails: boolean;
}

export type MergePlan =
  | { ok: true; keepId: string; dropId: string }
  | { ok: false; error: string };

export function mergePlan(a: MergeSide, b: MergeSide): MergePlan {
  if (a.id === b.id) return { ok: false, error: "Pick a different person to merge with." };
  if (a.memberId && b.memberId && a.memberId !== b.memberId) {
    return {
      ok: false,
      error: `${a.name} and ${b.name} sign in with different accounts, so they aren't the same person in Foundry.`,
    };
  }
  const handleA = a.githubHandle?.trim().toLowerCase() || null;
  const handleB = b.githubHandle?.trim().toLowerCase() || null;
  if (handleA && handleB && handleA !== handleB) {
    return {
      ok: false,
      error: `They have different GitHub handles (@${a.githubHandle}, @${b.githubHandle}). Remove the wrong one first.`,
    };
  }
  if (a.hasPersonalDetails && b.hasPersonalDetails) {
    return { ok: false, error: "Both records have personal details on file. Clear the wrong set first." };
  }
  const aFirst = a.createdAt.getTime() <= b.createdAt.getTime();
  return aFirst ? { ok: true, keepId: a.id, dropId: b.id } : { ok: true, keepId: b.id, dropId: a.id };
}

/** Fields copied from the dropped record when the kept one has no value. */
export const FILL_FIELDS = [
  "email",
  "memberId",
  "githubHandle",
  "jobTitle",
  "department",
  "employmentType",
  "startDate",
  "managerId",
  "supplierId",
  "preferredName",
  "pronouns",
  "endDate",
  "probationEndsOn",
  "noticePeriodWeeks",
  "daysPerWeek",
  "hrDriveFolderId",
  "rateCardPersonId",
  "primaryStack",
  "location",
  "bio",
  "wikiBio",
  "avatarUrl",
  "linkedinUrl",
  "cvUrl",
  "portfolioUrl",
  "yearsExperience",
  "hourlyRate",
  "currency",
  "timezone",
  "availability",
] as const;

type FillField = (typeof FILL_FIELDS)[number];

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/**
 * The kept record's values after the merge: every field it lacks is taken from the
 * dropped one; lists are joined; it counts as a developer if either did; it stays on the
 * active roster unless both were archived. Returns only the fields that change.
 */
export function mergedFields(
  keep: Record<string, unknown>,
  drop: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FILL_FIELDS as readonly FillField[]) {
    if (!hasValue(keep[f]) && hasValue(drop[f])) out[f] = drop[f];
  }
  for (const f of ["techStacks", "signalSources"] as const) {
    const a = Array.isArray(keep[f]) ? (keep[f] as string[]) : [];
    const b = Array.isArray(drop[f]) ? (drop[f] as string[]) : [];
    const joined = [...new Set([...a, ...b])];
    if (joined.length !== a.length) out[f] = joined;
  }
  // The record that came from a login carries the name they sign in with; an old card's
  // name is often a first name only ("Hassaan" vs "Hassaan Bin Sajjad").
  if (out.memberId && hasValue(drop.name)) out.name = drop.name;
  if (keep.isDeveloper !== true &&(drop.isDeveloper === true || hasValue(drop.githubHandle))) out.isDeveloper = true;
  if (keep.archivedAt && !drop.archivedAt) {
    out.archivedAt = null;
    out.archivedById = null;
  }
  return out;
}
