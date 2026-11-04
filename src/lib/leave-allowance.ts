/**
 * Whether a leave request uses up holiday allowance.
 *
 * Asked for by Dan (Nov 2026): leave for a funeral shouldn't come out of his allowance. So a
 * request can say whether it counts. Requests made before that have no answer stored (null)
 * and keep the old rule: only Annual leave counts. New ones default the same way (ticked for
 * Annual, unticked for the rest) and can be changed either way.
 */
export function defaultCountsToAllowance(type: string): boolean {
  return type === "ANNUAL";
}

export function countsToAllowance(row: { type: string; countsToAllowance: boolean | null }): boolean {
  return row.countsToAllowance ?? defaultCountsToAllowance(row.type);
}

/** The Prisma filter for leave that counts, matching `countsToAllowance` exactly. */
export const COUNTS_TO_ALLOWANCE_WHERE = {
  OR: [{ countsToAllowance: true }, { countsToAllowance: null, type: "ANNUAL" }],
};
