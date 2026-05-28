/**
 * Section data diff utility. Used by both:
 *   - P1.6 version snapshots (current section vs a saved version)
 *   - P2.10 AI proposals (current section vs proposed change)
 *
 * Strategy: stringify both sides as pretty JSON and produce a line-level diff. For prose-heavy
 * sections that's "what changed in this paragraph"; for tabular sections it's "which row
 * changed."
 *
 * Not LCS-optimal — uses a simple paired-line walk. Good enough for human readability of small
 * diffs (which is all section data is).
 */

export type DiffLine =
  | { kind: "same"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string };

function lines(value: unknown): string[] {
  if (value === undefined || value === null) return [""];
  if (typeof value === "string") return value.split("\n");
  try {
    return JSON.stringify(value, null, 2).split("\n");
  } catch {
    return [String(value)];
  }
}

/**
 * Word-by-word LCS would be ideal, but for short section payloads a line-walk Myers-ish diff
 * gives readable results without dragging in a dep. We do the simplest thing: walk both arrays
 * in lockstep; when they diverge, scan ahead a few lines on each side for a match.
 */
export function diffLines(before: unknown, after: unknown): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  const out: DiffLine[] = [];

  let i = 0;
  let j = 0;
  const LOOKAHEAD = 4;

  while (i < a.length || j < b.length) {
    if (i >= a.length) {
      out.push({ kind: "added", text: b[j] });
      j++;
      continue;
    }
    if (j >= b.length) {
      out.push({ kind: "removed", text: a[i] });
      i++;
      continue;
    }
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
      continue;
    }

    // Look ahead on the "after" side for a match — that's an insertion.
    let matchedAhead = -1;
    for (let k = 1; k <= LOOKAHEAD && j + k < b.length; k++) {
      if (a[i] === b[j + k]) {
        matchedAhead = k;
        break;
      }
    }
    if (matchedAhead > 0) {
      for (let k = 0; k < matchedAhead; k++) {
        out.push({ kind: "added", text: b[j + k] });
      }
      j += matchedAhead;
      continue;
    }

    // Look ahead on the "before" side for a match — that's a deletion.
    let removedAhead = -1;
    for (let k = 1; k <= LOOKAHEAD && i + k < a.length; k++) {
      if (a[i + k] === b[j]) {
        removedAhead = k;
        break;
      }
    }
    if (removedAhead > 0) {
      for (let k = 0; k < removedAhead; k++) {
        out.push({ kind: "removed", text: a[i + k] });
      }
      i += removedAhead;
      continue;
    }

    // Neither side has an upcoming match — it's a substitution.
    out.push({ kind: "removed", text: a[i] });
    out.push({ kind: "added", text: b[j] });
    i++;
    j++;
  }

  return out;
}

/** Compact summary count for a diff result. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "added").length,
    removed: lines.filter((l) => l.kind === "removed").length,
  };
}
