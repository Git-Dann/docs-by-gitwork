/**
 * The CV's own data shape — deliberately NOT `CodeClearCandidateDetail`.
 *
 * ⚠️ A dev CV is a document Gitwork hands to a CLIENT. Three families of field on
 * the candidate record must never reach it, and the cheapest way to guarantee that
 * is structural: this type simply has nowhere to put them, so a renderer cannot
 * print one by accident and a future field added to the candidate does not arrive
 * here for free.
 *
 *   1. Commercial — `hourlyRate`, `monthlyRate`, `currency`. These are what
 *      Gitwork pays or charges. Already gated behind `code.viewRates` + the
 *      `showDevRates` workspace toggle internally; on a client-facing page they
 *      are simply wrong at any permission level.
 *   2. Internal assessment — `tier`, `effectiveTier`, `overallScore` and the four
 *      CodeClear sub-scores, `identityConfidence`. These are Gitwork's private
 *      judgement of a person. Printing "Tier 3" on someone's CV is both a
 *      commercial leak and a thing you would not do to a colleague.
 *   3. Pipeline state — `status`, `devGroup` (Bench / Off Bench), `recheckDueAt`,
 *      `published`. Internal bookkeeping with no meaning outside Foundry.
 *
 * `cv-redaction.test.ts` holds the renderer to this against a fully-populated
 * candidate, because a type is only a compile-time guarantee and the risk here is
 * someone widening `buildCvData` later.
 */

/**
 * One engagement.
 *
 * ⚠️ **There is no client name here, on purpose.** A dev's CV goes to clients,
 * and one client's name on a CV shown to another is a disclosure nobody asked
 * for. Like the commercial and assessment fields above, the guarantee is
 * structural: this type has nowhere to put a client, so a renderer cannot print
 * one.
 *
 * `label` is what the row actually says — the platform or project the dev worked
 * on. ⚠️ `Placement.projectName` is non-null free text and in the real data
 * frequently IS the client's name ("Big Wedge Golf"), so the label is not simply
 * the project: `engagementLabel` drops any candidate label that carries the
 * client's name through and falls back to a neutral one. Removing the field
 * without that guard would have leaked the name straight back.
 */
export interface CvEngagement {
  label: string;
  /** Rendered date range, e.g. "Mar 2025 – present". Never a raw ISO string. */
  period: string;
  /** Sorts newest-first; not printed. */
  startedAt: string;
  current: boolean;
}

export interface CvLink {
  label: string;
  /** Display form, e.g. "github.com/alice" — a printed CV has no clickable href. */
  text: string;
  href: string;
}

export interface CvData {
  /**
   * The signal eyebrow above the name.
   *
   * ⚠️ It asserts "Gitwork engineer" ONLY for an `INTERNAL` candidate. An
   * `EXTERNAL` one is someone sourced for the marketplace who Gitwork has not
   * engaged, so printing that on their CV would be a false claim about a real
   * person, made on a document we hand to clients.
   */
  eyebrow: string;
  name: string;
  /** The line under the name, e.g. "Senior React Native Engineer". */
  role: string;
  /** Location · timezone · experience, already assembled and comma-free of blanks. */
  meta: string[];
  /** Profile paragraph. Empty string when the dev has no bio. */
  summary: string;
  /** Tech stack chips, de-duped, primary first. */
  stack: string[];
  engagements: CvEngagement[];
  links: CvLink[];
  /** What was cut to keep the document to one page. Never printed on the CV —
   *  surfaced in the export UI so the operator knows and can edit the profile. */
  omitted: string[];
  /**
   * Profile fields with nothing in them. Also never printed: a CV that announces
   * its own gaps is worse than a short one. It exists so the export UI can tell
   * the operator *why* a CV looks sparse and where to go and fix it, which is the
   * whole of "cater for minimal information" — the document stays clean, the
   * person exporting it is told.
   */
  missing: string[];
}
