// ─────────────────────────────────────────────────────────────────────────────
// CATALOGUE COMPATIBILITY — a checkKey is a PUBLIC IDENTIFIER, not an internal name.
//
// Every key in CHECKS_REGISTRY is referenced by data outside this codebase:
//   • PulseScanCheck rows going back to the first scan, which the report renders
//   • PulseCheckConfig rows — a workspace's own enable/label/severity decisions,
//     keyed by checkKey (@@unique([workspaceId, checkKey]))
//   • PulseCheckStat rows the Curator reads to propose lifecycle transitions
//   • ForemanFindingAction-style external references, share links and API clients
//
// So deleting or renaming a key does not "clean up the catalogue" — it silently
// orphans a customer's configuration and makes their scan history unreadable.
// A key that has outlived its implementation is RETIRED, with a stated successor;
// it is not removed.
//
// `catalogue-baseline.json` records the keys that exist. `catalogue-compat.test.ts`
// fails if one disappears from it without a RETIRED_CHECKS entry, and fails if a
// newly added key is missing from it — run `npm run pulse:catalogue` to refresh.
// ─────────────────────────────────────────────────────────────────────────────

/** The catalogue's own version. Bump when the shape of the contract changes. */
export const CATALOGUE_VERSION = "pulse-controls-2026.08";

/**
 * How a retired key relates to what replaced it. Mirrors the vocabulary a reader
 * of an old scan needs: "this was replaced by a stronger verification method" is
 * a different fact from "this was split into three" or "this was withdrawn".
 */
export type CheckRelationship =
  | "SUPERSEDED_BY"
  | "MERGED_INTO"
  | "SPLIT_INTO"
  | "ALIAS_OF"
  | "WITHDRAWN";

export interface RetiredCheck {
  /** Why the key stopped being emitted. Written for someone reading an old scan. */
  reason: string;
  relationship: CheckRelationship;
  /**
   * The key(s) that now carry this assessment. Required for every relationship
   * except WITHDRAWN, where the assessment itself is gone rather than moved.
   */
  replacedBy?: string[];
  /** The catalogue version in which the key stopped being emitted. */
  retiredIn: string;
}

/**
 * Empty on purpose: no Pulse check key has ever been retired. That is the
 * intended steady state — this map is the pressure valve for when one must be,
 * not a queue to work through.
 */
export const RETIRED_CHECKS: Record<string, RetiredCheck> = {};

/** True when a key is no longer emitted but is still a readable historical identifier. */
export function isRetiredCheck(key: string): boolean {
  return Object.hasOwn(RETIRED_CHECKS, key);
}
