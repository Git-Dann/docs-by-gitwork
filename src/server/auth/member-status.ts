/**
 * Member lifecycle: active → archived → (after the retention window) removed.
 *
 * Pure — no Prisma client, no clock read except through the `now` argument — so
 * the whole lifecycle is unit-testable.
 *
 * ⚠️ **Why archive and not delete.** Removing someone used to delete their
 * `WorkspaceMember` row and keep the `User`. Their Google account was still a
 * valid `@gitwork.co.uk` sign-in, so they could log straight back in: the jwt
 * callback found the User, found no membership, and minted a STAFF token anyway.
 * Every route using `getEffectiveUserOrNull` then turned "no membership" into
 * `null`, which `assertCan` treats as a trusted full-access caller. Deleting was
 * the dangerous operation; marking is the safe one. See `RevokedAccessError`.
 */

/** How long an archived member can be restored before their membership is removed. */
export const ARCHIVE_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The where-fragment every ROSTER query uses — anything that lists members for a
 * person to pick, notify, push to, email or count. Spread it into the `where`:
 *
 *   prisma.workspaceMember.findMany({ where: { workspaceId, ...ACTIVE_MEMBER } })
 *
 * ⚠️ `roster-active-member.test.ts` sweeps the source and fails on any
 * `workspaceMember.findMany`/`count` that neither uses this nor carries an
 * explicit `// includes-archived: <reason>` comment. Thirty-one roster queries
 * existed when this landed; hand-patching them and hoping is how a leaver keeps
 * receiving push notifications about client work.
 */
export const ACTIVE_MEMBER = { archivedAt: null } as const;

export interface MemberLifecycleInput {
  archivedAt: Date | string | null;
}

export type MemberStatus = "active" | "archived" | "expired";

function asDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** When an archived member's membership is removed. Null for an active member. */
export function purgeAt(member: MemberLifecycleInput): Date | null {
  const archived = asDate(member.archivedAt);
  return archived ? new Date(archived.getTime() + ARCHIVE_RETENTION_DAYS * DAY_MS) : null;
}

/**
 * `expired` is an archived member past the window whose row has not been removed
 * yet — the purge job runs daily, so this state exists for up to a day.
 *
 * ⚠️ Treated exactly like `archived` for access (no access), and stricter for
 * restore (cannot be restored). That makes the purge job a tidy-up rather than a
 * security control: if the cron never runs, nobody regains access and nobody can
 * be restored past the window. Failing safe is the reason for the separate state.
 */
export function memberStatus(member: MemberLifecycleInput, now: Date = new Date()): MemberStatus {
  if (member.archivedAt == null) return "active";
  const archived = asDate(member.archivedAt);
  // ⚠️ Non-null but unparseable fails CLOSED: no access, not restorable. An access
  // check must never read "I can't tell when you were archived" as "active".
  if (!archived) return "expired";
  const purge = purgeAt(member);
  return purge && now.getTime() >= purge.getTime() ? "expired" : "archived";
}

/**
 * ⚠️ A raw null check, deliberately. ANY non-null `archivedAt` — including one that
 * will not parse — means not active. Parsing first would let a malformed value
 * read as "never archived", which is fail-open in exactly the place it matters.
 */
export function isActiveMember(member: MemberLifecycleInput): boolean {
  return member.archivedAt == null;
}

/** Whole days left before removal, never negative. Null for an active member. */
export function daysUntilPurge(member: MemberLifecycleInput, now: Date = new Date()): number | null {
  const purge = purgeAt(member);
  if (!purge) return null;
  return Math.max(0, Math.ceil((purge.getTime() - now.getTime()) / DAY_MS));
}

export function canRestore(member: MemberLifecycleInput, now: Date = new Date()): boolean {
  return memberStatus(member, now) === "archived";
}

/** The cutoff the purge job deletes before: anything archived earlier than this. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ARCHIVE_RETENTION_DAYS * DAY_MS);
}
