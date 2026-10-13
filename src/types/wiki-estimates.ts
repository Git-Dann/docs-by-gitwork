/**
 * Estimates — how long a piece of work takes with 1, 2, 3… developers.
 *
 * What is STORED is the effort (developer-days per phase) and the assumptions. Every
 * duration, end date and calendar bar is derived from those at render by
 * `src/lib/wiki-estimates.ts`, so changing one phase can never leave a headline stating a
 * finish date the phases no longer add up to — the same call as Running costs and
 * Care's reply state.
 */

/** How much each extra developer costs in coordination. See COORDINATION_OVERHEAD. */
export type EstimateCoordination = "LOW" | "TYPICAL" | "HIGH";

export interface EstimatePhase {
  /** Stable within one estimate, so the editor can key rows. Not a database id. */
  id: string;
  name: string;
  /** Total effort in developer-days — one person working one day. */
  effortDays: number;
  /**
   * The most people this phase can usefully use. Null = no cap. Discovery with one
   * client stakeholder, or a store submission, does not go faster with a fourth person —
   * and an estimate that pretends it does is the one a client will hold us to.
   */
  maxDevs: number | null;
}

export interface Estimate {
  id: string;
  title: string;
  summary: string | null;
  /** YYYY-MM-DD. Null = not agreed yet; the page plans from the next Monday and says so. */
  startDate: string | null;
  /** The team sizes compared, ascending, unique. */
  teamSizes: number[];
  /** The team size the page opens on. Null = the smallest. */
  recommendedTeam: number | null;
  coordination: EstimateCoordination;
  /** Shown as a shaded tail after each finish date — the range, not a padded figure. */
  contingencyPct: number;
  phases: EstimatePhase[];
  orderKey: number;
  updatedAt: string;
}

export interface WikiEstimatesSection {
  enabled: boolean;
  estimates: Estimate[];
}
