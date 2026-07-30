// Validity over time — PURE (the clock is an argument, never read here).
//
// A countermark that never expires is a lie about software. The artifact it describes gets
// commits, its dependencies acquire published vulnerabilities, its certificate expires.
// So the mark carries a window, and past that window it stops asserting anything — which
// is also precisely why continuous re-examination is worth paying for rather than a formality.
//
// Four things a reader must be able to tell apart, because they mean different things:
//   VALID / EXPIRING — the mark stands. EXPIRING is a nudge, not a caveat.
//   LAPSED          — time ran out. Says nothing about the software; nobody re-checked.
//   REVOKED         — the issuer withdrew it. Something was found to be wrong.
//   SUPERSEDED      — a newer mark exists for the same subject. Go and read that one.
//
// LAPSED and REVOKED are deliberately not merged. Collapsing them would let a withdrawn
// mark read as merely stale, which is the failure mode that makes a certification scheme
// worthless.

import type { CountermarkGrade, CountermarkStatus } from "./types";
import { getStandard } from "./standard";

/** Days before expiry that a mark starts reporting EXPIRING. */
export const EXPIRY_NOTICE_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/** Validity window for a grade, from its standard. Ungraded marks get no window. */
export function validityDaysFor(standardId: string, grade: CountermarkGrade): number | null {
  const standard = getStandard(standardId);
  if (!standard) return null;
  if (grade === "CERTIFIED") return standard.validityDays.certified;
  if (grade === "CONDITIONAL") return standard.validityDays.conditional;
  // NOT_CERTIFIED and INCOMPLETE get the shorter window too: the mark still needs to
  // exist and be citable (it is the record of a failed examination, which a buyer may be
  // relying on in a dispute), but it should go stale quickly.
  return standard.validityDays.conditional;
}

export function expiryFor(issuedAt: Date, standardId: string, grade: CountermarkGrade): Date {
  const days = validityDaysFor(standardId, grade) ?? 30;
  return new Date(issuedAt.getTime() + days * MS_PER_DAY);
}

/**
 * Whole days from `now` until `expiresAt`. Negative once past. Rounded UP so a mark with
 * six hours left reports 1 day rather than 0 — reporting 0 while the mark is still valid
 * reads as expired.
 */
export function daysUntil(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

export interface LapseInput {
  expiresAt: Date;
  revokedAt: Date | null;
  supersededById: string | null;
}

/**
 * Resolve a mark's status at `now`.
 *
 * Precedence is REVOKED → SUPERSEDED → LAPSED → EXPIRING → VALID, and the order matters:
 * a revoked mark that has also since expired must still say REVOKED, because "we withdrew
 * this" outranks "it would have run out anyway" for anyone who relied on it.
 */
export function countermarkStatus(input: LapseInput, now: Date): { status: CountermarkStatus; daysRemaining: number } {
  const daysRemaining = daysUntil(input.expiresAt, now);
  if (input.revokedAt) return { status: "REVOKED", daysRemaining };
  if (input.supersededById) return { status: "SUPERSEDED", daysRemaining };
  if (daysRemaining <= 0) return { status: "LAPSED", daysRemaining };
  if (daysRemaining <= EXPIRY_NOTICE_DAYS) return { status: "EXPIRING", daysRemaining };
  return { status: "VALID", daysRemaining };
}

/** Whether the mark currently asserts anything at all. Drives the certificate's headline. */
export function isAsserting(status: CountermarkStatus): boolean {
  return status === "VALID" || status === "EXPIRING";
}
