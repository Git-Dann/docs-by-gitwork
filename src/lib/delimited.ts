/**
 * Quote-aware CSV/TSV parsing, shared rather than re-hand-rolled.
 *
 * There were two private copies of this before — one in `task-import-modal.tsx` and a
 * simpler one in `settings-panel.tsx` for the dev roster — neither exported, neither
 * tested, and no library anywhere in the repo. This is the third caller's worth of reason
 * to have one.
 *
 * ## Why the delimiter is detected rather than declared
 *
 * The brief was "generate a sheet in Claude and import it", and the two things a person
 * actually arrives with are a downloaded `.csv` and a block **copied out of Google Sheets
 * or Excel**, which is TAB-separated. Asking someone to pick a delimiter is asking them a
 * question about a file they did not create, so the parser works it out. Getting it wrong
 * is loud rather than silent: a TSV parsed as CSV collapses into one column, which the
 * import preview shows as a single unmapped field.
 */

export interface DelimitedTable {
  headers: string[];
  rows: string[][];
  /** Which delimiter was used, so the UI can say so and a test can assert it. */
  delimiter: "," | "\t" | ";";
}

const DELIMITERS = [",", "\t", ";"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/**
 * Pick the delimiter by counting candidates OUTSIDE quotes on the first non-empty line.
 *
 * ⚠️ Counting naively is wrong in a way that shows up immediately on real data: a header
 * like `"Title, short","Owner"` has more commas inside its quoted fields than between
 * them. Scanning with quote state is the whole point.
 *
 * Ties go to comma — it is the commonest, and a file with equal numbers of both is
 * ambiguous by construction rather than one we can be clever about.
 */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  let best: Delimiter = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const c = firstLine[i];
      if (c === '"') {
        if (inQuotes && firstLine[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && c === d) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse delimited text into a header row plus data rows.
 *
 * Handles the three things real exports do and a naive `split(",")` does not: quoted
 * fields containing the delimiter, `""` as an escaped quote, and newlines inside a quoted
 * field. Strips a UTF-8 BOM (Excel writes one) and normalises CRLF.
 *
 * Entirely blank lines are dropped — a trailing newline is not an empty request.
 */
export function parseDelimited(text: string, forced?: Delimiter): DelimitedTable {
  const delimiter = forced ?? detectDelimiter(text);
  const s = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const cleaned = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (cleaned.length === 0) return { headers: [], rows: [], delimiter };
  return {
    headers: cleaned[0].map((h) => h.trim()),
    rows: cleaned.slice(1),
    delimiter,
  };
}

/**
 * Match a spreadsheet's header to one of our fields.
 *
 * Exact match on the normalised form first, then a contains test — because a real export
 * writes "Task name", "Issue Title" and "Summary (short)" for the same column, and the
 * whole point of auto-mapping is that the common case needs no clicks.
 *
 * ⚠️ Returns the FIRST field whose alias matches, and the caller must not assign one
 * header to two fields. A "Description" column matching both `description` and a
 * `notes` alias would otherwise import the same text twice.
 */
export function matchHeader<K extends string>(
  header: string,
  fields: readonly { key: K; aliases: readonly string[] }[],
): K | null {
  const h = header.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!h) return null;
  for (const f of fields) {
    if (f.aliases.some((a) => a === h)) return f.key;
  }
  for (const f of fields) {
    if (f.aliases.some((a) => h.includes(a))) return f.key;
  }
  // …and the other direction, for a header that is a SHORTER form of an alias. Found by
  // using the feature: the built-in example sheet's own "Detail" column failed to map,
  // because `"detail".includes("details")` is false. A four-character floor keeps this
  // from matching on fragments — "id" must not reach inside "device".
  if (h.length >= 4) {
    for (const f of fields) {
      if (f.aliases.some((a) => a.includes(h))) return f.key;
    }
  }
  return null;
}
