/**
 * Pure post-process for the Pulse AI detail call: `criticalGaps` and `productionBlockers`
 * come from the same LLM call with no shared vocabulary enforcement, so despite the prompt's
 * instruction to keep them non-overlapping, the model sometimes states the same underlying
 * issue in both lists (e.g. "No Privacy Policy or Terms of Service" appearing near-verbatim in
 * both). This is defense-in-depth beyond prompt-following — drop any criticalGap that's a
 * close match for an existing productionBlocker (blockers wins: it's the more urgent, shorter
 * list, and driving deletion the other way risks emptying it).
 */

interface CriticalGapLike {
  category: string;
  gap: string;
}

interface ProductionBlockerLike {
  category: string;
  blocker: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapRatio(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(normalize(b).split(" ").filter((t) => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared += 1;
  return shared / Math.min(tokensA.size, tokensB.size);
}

/** True when a gap and a blocker are almost certainly describing the same underlying issue. */
function isDuplicate(gap: CriticalGapLike, blocker: ProductionBlockerLike): boolean {
  if (normalize(gap.category) !== normalize(blocker.category)) return false;
  return tokenOverlapRatio(gap.gap, blocker.blocker) >= 0.6;
}

export function dedupeGapsAgainstBlockers<G extends CriticalGapLike>(
  gaps: G[],
  blockers: ProductionBlockerLike[],
): G[] {
  if (gaps.length === 0 || blockers.length === 0) return gaps;
  return gaps.filter((gap) => !blockers.some((blocker) => isDuplicate(gap, blocker)));
}
