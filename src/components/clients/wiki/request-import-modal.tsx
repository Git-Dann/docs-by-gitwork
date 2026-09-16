"use client";

/**
 * Import requests from a spreadsheet — paste, or drop a .csv/.tsv.
 *
 * ## Why parsing happens here and not on the server
 *
 * A person needs to SEE what their file mapped to before it lands in a client's wiki.
 * A server that parsed the file could only report the result afterwards, and "we created
 * 40 requests, 12 of them from the wrong column" is not a recoverable state. So the
 * browser parses, maps and coerces; the route receives well-formed items.
 *
 * ## Nothing is guessed silently
 *
 * A value the vocabulary doesn't recognise is **flagged in the preview**, not coerced
 * quietly — that is the rule `wiki-intake-vocab.ts` already applies on the API path
 * (unrecognised → 400 naming the field, never a default). Here the equivalent is a
 * visible marker on the row and a count above the table, because a person can fix a
 * mapping and a machine cannot.
 */

import { useMemo, useState } from "react";
import {
  ArrowUpTrayIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { matchHeader, parseDelimited } from "@/lib/delimited";
import type { WikiIntakeImportRow } from "@/lib/api";
import type { IntakeCategory } from "@/lib/wiki-intake-categories";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** Columns an imported sheet can map onto. Aliases are the headers real exports write —
 *  Linear, Jira, ClickUp, Sheets, and whatever a person types by hand. */
export const IMPORT_FIELDS: readonly {
  key: string;
  label: string;
  required?: boolean;
  aliases: readonly string[];
}[] = [
  {
    key: "title",
    label: "Request",
    required: true,
    aliases: ["title", "name", "task", "summary", "subject", "request", "issue", "item"],
  },
  {
    key: "description",
    label: "Detail",
    aliases: ["description", "notes", "details", "body", "comment", "context"],
  },
  { key: "priority", label: "Priority", aliases: ["priority", "urgency", "importance", "severity"] },
  { key: "category", label: "Category", aliases: ["category", "type", "kind", "label", "area"] },
  {
    key: "requestedBy",
    label: "Requested by",
    aliases: ["requested by", "requester", "reporter", "raised by", "owner", "from", "who", "submitted by"],
  },
  { key: "externalRef", label: "Their ref", aliases: ["ref", "id", "key", "ticket", "reference", "number"] },
  { key: "externalUrl", label: "Link", aliases: ["url", "link", "href", "permalink"] },
  { key: "device", label: "Device", aliases: ["device", "handset", "hardware"] },
  { key: "osVersion", label: "OS version", aliases: ["os", "os version", "platform version", "version"] },
];

/** The columns an import can fill. Written out rather than derived from FIELDS so the
 *  union stays readable in every signature below — and so a field added to the table
 *  without a matching key here is a compile error rather than a silently ignored column. */
type FieldKey =
  | "title"
  | "description"
  | "priority"
  | "category"
  | "requestedBy"
  | "externalRef"
  | "externalUrl"
  | "device"
  | "osVersion";

/**
 * Priority vocabulary. Mirrors `INTAKE_PRIORITY` in `src/server/wiki-intake-vocab.ts`,
 * kept as a literal rather than imported so this client component does not pull the
 * server's zod module into the wiki bundle — the same trade the dev-label list makes.
 */
const PRIORITY_ALIASES: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  low: "LOW", minor: "LOW", trivial: "LOW", p3: "LOW", "p-3": "LOW", "nice to have": "LOW",
  medium: "MEDIUM", med: "MEDIUM", normal: "MEDIUM", standard: "MEDIUM", major: "MEDIUM", p2: "MEDIUM", "p-2": "MEDIUM",
  high: "HIGH", urgent: "HIGH", critical: "HIGH", blocker: "HIGH", p0: "HIGH", p1: "HIGH", "p-0": "HIGH", "p-1": "HIGH",
};

export interface ParsedRow {
  values: Partial<Record<FieldKey, string>>;
  /** Fields whose value we could not place — shown, never silently defaulted. */
  flags: FieldKey[];
  /** Matches an existing OPEN request by title. The server dedupes too; saying so here
   *  is what stops someone importing a sheet twice and wondering where it went. */
  duplicate: boolean;
  skip: boolean;
}

export function mapPriority(raw: string | undefined): {
  value: "LOW" | "MEDIUM" | "HIGH";
  flagged: boolean;
} {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return { value: "MEDIUM", flagged: false };
  const v = PRIORITY_ALIASES[k];
  return v ? { value: v, flagged: false } : { value: "MEDIUM", flagged: true };
}

/** Match a sheet's category cell against the CLIENT's own category list, by label or id.
 *  Falls back to no category (the server then derives the type), flagged so it shows. */
export function mapCategory(
  raw: string | undefined,
  categories: readonly IntakeCategory[],
): { id: string | null; flagged: boolean } {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return { id: null, flagged: false };
  const hit = categories.find(
    (c) => c.label.toLowerCase() === k || c.id.toLowerCase() === k,
  );
  return hit ? { id: hit.id, flagged: false } : { id: null, flagged: true };
}

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turn a parsed table plus a column mapping into preview rows.
 *
 * Pure and exported so the mapping can be tested without a browser — the part that goes
 * wrong is never the modal, it is which column landed where.
 */
export function buildRows(
  headers: string[],
  raw: string[][],
  mapping: (FieldKey | null)[],
  categories: readonly IntakeCategory[],
  // ⚠️ Takes RAW titles and normalises them here, deliberately — an earlier cut took a
  // pre-normalised Set and a caller that trimmed but did not collapse internal spacing
  // silently stopped detecting duplicates. Two normalisations of the same idea is one
  // too many; the comparison is decided in exactly one place.
  existingOpenTitles: readonly string[],
): ParsedRow[] {
  const openTitles = new Set(existingOpenTitles.map(normTitle));
  return raw.map((cells) => {
    const values: Partial<Record<FieldKey, string>> = {};
    mapping.forEach((field, i) => {
      if (!field) return;
      const cell = (cells[i] ?? "").trim();
      if (cell) values[field] = cell;
    });
    const flags: FieldKey[] = [];
    if (mapping.includes("priority") && mapPriority(values.priority).flagged) flags.push("priority");
    if (mapping.includes("category") && mapCategory(values.category, categories).flagged) {
      flags.push("category");
    }
    const title = values.title ?? "";
    const duplicate = Boolean(title) && openTitles.has(normTitle(title));
    return { values, flags, duplicate, skip: !title || duplicate };
  });
}

export function rowsToPayload(
  rows: readonly ParsedRow[],
  categories: readonly IntakeCategory[],
): WikiIntakeImportRow[] {
  return rows
    .filter((r) => !r.skip && r.values.title)
    .map((r) => ({
      title: r.values.title!,
      description: r.values.description ?? null,
      priority: mapPriority(r.values.priority).value,
      categoryId: mapCategory(r.values.category, categories).id,
      requestedBy: r.values.requestedBy ?? null,
      externalRef: r.values.externalRef ?? null,
      // A malformed link is dropped rather than sent: the server's own link guard would
      // reject the whole row, and losing a request because its URL column had a stray
      // value in it would be the wrong trade.
      externalUrl: /^https?:\/\//i.test(r.values.externalUrl ?? "")
        ? r.values.externalUrl!
        : null,
      device: r.values.device ?? null,
      osVersion: r.values.osVersion ?? null,
    }));
}

export const IMPORT_TEMPLATE = [
  "Request\tDetail\tPriority\tCategory\tRequested by\tTheir ref",
  "Search returns nothing for names with an apostrophe\tOnly on the web app\tHigh\tBug\tPriya Shah\tSUP-118",
  "Add a monthly export of the leaderboard\tCSV is fine\tLow\tRequest\tMarcus Webb\t",
].join("\n");

export function RequestImportModal({
  open,
  onClose,
  categories,
  existingTitles,
  onImport,
  importing,
}: {
  open: boolean;
  onClose: () => void;
  categories: IntakeCategory[];
  /** Titles of requests that are currently OPEN — the server's own dedupe rule. */
  existingTitles: readonly string[];
  onImport: (items: WikiIntakeImportRow[]) => Promise<{ created: number; skipped: number }>;
  importing: boolean;
}) {
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<(FieldKey | null)[] | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const table = useMemo(() => parseDelimited(text), [text]);

  // Auto-map on first parse, then leave the person's choices alone. Re-deriving on every
  // render would fight anyone who corrected a column.
  const effectiveMapping = useMemo(() => {
    if (mapping && mapping.length === table.headers.length) return mapping;
    const used = new Set<FieldKey>();
    return table.headers.map((h) => {
      const key = matchHeader<FieldKey>(h, IMPORT_FIELDS as readonly { key: FieldKey; aliases: readonly string[] }[]);
      // One header per field: a sheet with both "Notes" and "Details" must not import
      // the same text twice under one column.
      if (!key || used.has(key)) return null;
      used.add(key);
      return key;
    });
  }, [table.headers, mapping]);

  const rows = useMemo(
    () => buildRows(table.headers, table.rows, effectiveMapping, categories, existingTitles),
    [table, effectiveMapping, categories, existingTitles],
  );

  const hasTitle = effectiveMapping.includes("title");
  const importable = rows.filter((r) => !r.skip).length;
  const duplicates = rows.filter((r) => r.duplicate).length;
  const untitled = rows.filter((r) => !r.values.title).length;
  const flagged = rows.filter((r) => r.flags.length > 0).length;

  function setColumn(index: number, field: FieldKey | null) {
    const next = [...effectiveMapping];
    // Clear the field anywhere else first — two columns feeding one field would make the
    // last one silently win, which looks like data loss.
    if (field) next.forEach((f, i) => { if (f === field && i !== index) next[i] = null; });
    next[index] = field;
    setMapping(next);
  }

  async function run() {
    setError(null);
    try {
      const res = await onImport(rowsToPayload(rows, categories));
      setResult(res);
      setText("");
      setMapping(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that.");
    }
  }

  async function readFile(file: File) {
    setText(await file.text());
    setMapping(null);
    setResult(null);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import requests"
      panelClassName="w-full max-w-4xl"
    >
      <div className="space-y-4 p-5">
        {result ? (
          <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5 text-center">
            <p className="text-[15px] font-semibold text-[var(--text-1)]">
              {result.created} request{result.created === 1 ? "" : "s"} imported
            </p>
            {result.skipped > 0 && (
              <p className="mt-1 text-[13px] text-[var(--text-3)]">
                {result.skipped} skipped — already logged, or no title. Nothing was
                duplicated.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setResult(null);
                onClose();
              }}
              className="mt-3 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label className="app-field-label" htmlFor="import-paste">
                  Paste rows, or choose a file
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setText(IMPORT_TEMPLATE)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
                  >
                    <DocumentTextIcon className="h-3.5 w-3.5" />
                    Use an example
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]">
                    <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                    Choose a file
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void readFile(f);
                      }}
                    />
                  </label>
                </div>
              </div>
              <textarea
                id="import-paste"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setMapping(null);
                }}
                rows={5}
                placeholder={"Copy straight out of Sheets or Excel — the first row is the header.\n\nRequest\tPriority\tRequested by"}
                className="app-input resize-y py-2.5 font-[13px] leading-relaxed"
                style={{ fontFamily: MONO, fontSize: 12 }}
              />
              {table.headers.length > 0 && (
                <p
                  className="mt-1 text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  {table.delimiter === "\t" ? "Tab" : table.delimiter === ";" ? "Semicolon" : "Comma"}
                  -separated · {table.headers.length} columns · {table.rows.length} rows
                </p>
              )}
            </div>

            {table.headers.length > 0 && (
              <>
                {/* Column mapping. Every column is shown, including the ones we could not
                    place — a hidden column is a column someone thinks imported. */}
                <div>
                  <p className="app-field-label mb-1.5">Columns</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {table.headers.map((h, i) => (
                      <div key={`${h}-${i}`} className="min-w-0">
                        <p
                          className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]"
                          style={{ fontFamily: MONO }}
                          title={h}
                        >
                          {h || `Column ${i + 1}`}
                        </p>
                        <select
                          value={effectiveMapping[i] ?? ""}
                          onChange={(e) =>
                            setColumn(i, (e.target.value || null) as FieldKey | null)
                          }
                          aria-label={`Map column ${h || i + 1}`}
                          className="app-select-compact mt-0.5"
                        >
                          <option value="">Ignore this column</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                              {f.required ? " (required)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What will actually happen, before it happens. */}
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.06em]"
                  style={{ fontFamily: MONO }}
                >
                  <span className="font-semibold text-[var(--text-2)]">
                    {importable} to import
                  </span>
                  {duplicates > 0 && (
                    <span className="text-[var(--text-4)]">· {duplicates} already logged</span>
                  )}
                  {untitled > 0 && (
                    <span className="text-[var(--text-4)]">· {untitled} with no title</span>
                  )}
                  {flagged > 0 && (
                    <span className="text-amber-700">· {flagged} need a look</span>
                  )}
                </div>

                {!hasTitle && (
                  <p className="flex items-start gap-1.5 text-[13px] text-amber-700">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    Nothing is mapped to <strong>Request</strong> yet — pick the column
                    holding the request itself.
                  </p>
                )}

                {/* Preview. Scrolls rather than reflows, inside its own frame, because a
                    sheet can be any width (docs/mobile-playbook.md). */}
                <div className="overflow-x-auto rounded-[10px] border border-[var(--border-2)]">
                  <div className="min-w-[560px] divide-y divide-[var(--border-1)]">
                    {rows.slice(0, 12).map((r, i) => (
                      <div
                        key={i}
                        className={`grid grid-cols-[1fr_88px_92px_24px] items-center gap-x-3 px-3 py-2 text-[12px] ${
                          r.skip ? "opacity-45" : ""
                        }`}
                      >
                        <span
                          className="truncate text-[var(--text-1)]"
                          title={r.values.title ?? ""}
                        >
                          {r.values.title || (
                            <span className="italic text-[var(--text-4)]">No title — skipped</span>
                          )}
                        </span>
                        <span
                          className="truncate text-[var(--text-3)]"
                          style={{ fontFamily: MONO }}
                          title={r.values.priority ?? ""}
                        >
                          {mapPriority(r.values.priority).value}
                        </span>
                        <span
                          className="truncate text-[var(--text-3)]"
                          style={{ fontFamily: MONO }}
                          title={r.values.category ?? ""}
                        >
                          {mapCategory(r.values.category, categories).id ?? "—"}
                        </span>
                        <span className="text-right">
                          {r.duplicate ? (
                            <span
                              title="A request with this title is already open — it will be skipped."
                              className="text-[10px] text-[var(--text-4)]"
                              style={{ fontFamily: MONO }}
                            >
                              DUP
                            </span>
                          ) : r.flags.length > 0 ? (
                            <ExclamationTriangleIcon
                              className="ml-auto h-3.5 w-3.5 text-amber-600"
                              title={`Could not read: ${r.flags.join(", ")}. Imported with a default.`}
                            />
                          ) : null}
                        </span>
                      </div>
                    ))}
                    {rows.length > 12 && (
                      <p
                        className="px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                        style={{ fontFamily: MONO }}
                      >
                        + {rows.length - 12} more
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] border border-[var(--border-2)] px-3 py-2 text-sm font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importing || importable === 0 || !hasTitle}
                onClick={() => void run()}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                {importing ? "Importing…" : `Import ${importable}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
