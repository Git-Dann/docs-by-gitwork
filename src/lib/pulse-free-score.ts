/**
 * Words for a provisional free-scan score, shared by the widget (a client component) and our
 * lead email. The rule itself is in src/server/pulse-lite/free-score.ts.
 */
export const PROVISIONAL_BELOW = 70;

export function provisionalNote(coverage: number): string {
  // Public copy rules: no "free", no em dashes.
  return `Provisional: this quick check could only judge ${coverage}% of the site, usually because it builds its pages with JavaScript. Anything it couldn't see counts as half marks, so the score errs low; the full report loads the page properly.`;
}
