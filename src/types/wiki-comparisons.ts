/**
 * Comparisons — feature/plan comparison tables on a client's wiki.
 *
 * "What is in Free vs Premium vs Pro", or "the client's product against five competitors".
 * Built by Gitwork, read-only for the client. Columns and rows are stored as JSON and
 * replaced wholesale on every write; `src/lib/wiki-comparisons.ts` parses them defensively
 * on read, so a hand-edited row can never draw a cell that is not one of the five states.
 */

/** What a cell says. `none` = blank: nothing stated, not "not included". */
export type ComparisonCellState = "yes" | "no" | "partial" | "text" | "none";

export interface ComparisonCell {
  state: ComparisonCellState;
  /** Only for `text` (e.g. "10 GB", "£9/mo"); an optional qualifier on the others. */
  text?: string;
}

export interface ComparisonColumn {
  /** Stable within one table so cells can key on it. Not a database id. */
  id: string;
  title: string;
  subtitle?: string;
  /** Marks "our client" or "recommended" — tinted, with a mono label. */
  highlight?: boolean;
}

export interface ComparisonRow {
  id: string;
  /** A `group` is a mono caps band spanning the table; it carries no cells. */
  kind: "row" | "group";
  label: string;
  note?: string;
  cells: Record<string, ComparisonCell>;
}

export interface WikiComparison {
  id: string;
  title: string;
  description: string | null;
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  orderKey: number;
  updatedAt: string;
}

export interface WikiComparisonsSection {
  enabled: boolean;
  comparisons: WikiComparison[];
}
