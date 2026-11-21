/**
 * How Care hands out `NN //` numbers.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 * DESIGN.md's rule is that the numbers run in sequence down a screen, so a hidden pane must never
 * leave a hole. Care had **four** different mechanisms for that and three of them were visibly
 * wrong in November 2026:
 *
 *  • `care-home.tsx` hardcodes `01`/`02`/`03` — fine, its three panes are unconditional.
 *  • `care-reports.tsx` hardcodes `01` and `02` with a conditional between them, so the screen
 *    read `02` alone whenever the client had no support-day allocation, with an unnumbered card
 *    sitting where `01` should have been.
 *  • `care-connectors.tsx` numbered nothing at all except a hardcoded `02`, in a block that is
 *    switched off at its only call site.
 *  • `client-cockpit.tsx`'s Settings panel computed the Portal link's number as
 *    `(showMode ? 1 : 0) + (showCourseMode ? 1 : 0) + 2` — arithmetic resting on the assumption
 *    that `ConnectorsView` contributes exactly one number. It contributed none, so the screen
 *    skipped a number every time.
 *
 * The fix is not a fourth mechanism. It is one function, modelled on `portalSectionNumbers`
 * (`src/lib/client-portal-layout.ts`), which Portal has used for the same job since §129.
 */

/**
 * Numbers for a list of panes in render order.
 *
 * A pane that is not shown gets `""` rather than being skipped silently, so a stray render shows
 * up as an obviously-missing number instead of a plausible wrong one.
 *
 * @param shown one entry per pane, in the order they render
 * @param start the first number to hand out — for a view that continues someone else's sequence
 */
export function careSectionNumbers(shown: readonly boolean[], start = 1): string[] {
  let n = start;
  return shown.map((isShown) => (isShown ? String(n++).padStart(2, "0") : ""));
}

/** How many numbers a run of panes will consume — for a caller that renders more after them. */
export function careSectionCount(shown: readonly boolean[]): number {
  return shown.filter(Boolean).length;
}
