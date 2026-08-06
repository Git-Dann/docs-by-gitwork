/**
 * Where a block inserted FROM THE PAGE should land.
 *
 * ⚠️ This exists because the obvious implementation is wrong in a way nothing would catch.
 *
 * `PagedDocument` renders blocks inside a per-page `map`, so the `index` a block receives is its
 * position ON ITS PAGE: the first block of page three has `index: 0`. Wiring the canvas `+` to
 * that index would insert at the top of the document — and it would look correct in every test
 * written against a single-page fixture, and in every manual check on a short document. It only
 * misbehaves once a document is long enough to paginate, which is every real one.
 *
 * So the canvas hands back a section ID and this resolves the position against the ordered list.
 * Pure, so the multi-page case can actually be asserted.
 */

export interface InsertPositionEntry {
  id: string;
}

/**
 * The index a new block should occupy so it lands directly AFTER `afterSectionId`.
 *
 * An unknown id appends rather than throwing or inserting at 0: it means the block was removed
 * between the hover and the click (another tab, an undo, an AI apply). Appending is the outcome
 * closest to what was asked for; inserting at the top is the one that would look like a bug.
 */
export function resolveInsertIndex(
  entries: readonly InsertPositionEntry[],
  afterSectionId: string,
): number {
  const at = entries.findIndex((entry) => entry.id === afterSectionId);
  return at < 0 ? entries.length : at + 1;
}
