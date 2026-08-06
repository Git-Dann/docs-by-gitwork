"use client";

/**
 * The cover's bottom detail strip, composed by the author.
 *
 * The strip used to be four hard-coded rows — `Client · Prepared by · Date · Version` — which is
 * why the reference cover Dan works from (`PREPARED FOR · PREPARED BY · DATE · STATUS`) could not
 * be reproduced in the product: `STATUS` did not exist as a row and `Version` could not be dropped.
 *
 * Two kinds of row, and the distinction is the whole point:
 *   • an AUTO row names a value the document already knows (client, date, status…) — pick it once
 *     and it follows the document forever, with an optional label override so "Client" can read
 *     "Prepared for" without becoming a hand-typed string that goes stale.
 *   • a CUSTOM row is a free label/value pair for the one-offs a registry can never anticipate.
 *
 * ⚠️ An empty row list is NOT the same as an unedited one. `rows === undefined` means "never
 * touched" and renders the historical four; an explicit `[]` means the author removed every row and
 * wants no strip. Collapsing those would either strand authors with a strip they cannot remove, or
 * silently change every cover that predates this control.
 */

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { DragHandle, SortableList, SortableRow, reorder } from "@/components/proposals/sortable-list";
import {
  DEFAULT_DETAIL_ROWS,
  DETAIL_SOURCE_LABELS,
  type CoverDetailContext,
} from "@/lib/sections/cover-elements";
import type { CoverDetailRow, CoverDetailSource } from "@/types/proposal";

const SOURCES = Object.keys(DETAIL_SOURCE_LABELS) as CoverDetailSource[];

export function CoverDetailStrip({
  rows,
  onChange,
  values,
}: {
  /** `undefined` → never edited; the editor materialises the historical default to work on. */
  rows: CoverDetailRow[] | undefined;
  onChange: (next: CoverDetailRow[]) => void;
  /** The live values, so each row previews what it will actually print. */
  values: CoverDetailContext;
}) {
  const [adding, setAdding] = useState(false);
  // Materialised on first edit, so an untouched document keeps `undefined` in its data and keeps
  // rendering the default — see the back-compat note in `resolveCoverDetails`.
  const current = rows ?? DEFAULT_DETAIL_ROWS;
  const ids = current.map((row, i) => (row.kind === "auto" ? `${row.source}-${i}` : `custom-${i}`));

  const patch = (index: number, next: CoverDetailRow) =>
    onChange(current.map((row, i) => (i === index ? next : row)));
  const remove = (index: number) => onChange(current.filter((_, i) => i !== index));

  const used = new Set(
    current.filter((row): row is Extract<CoverDetailRow, { kind: "auto" }> => row.kind === "auto")
      .map((row) => row.source),
  );
  const available = SOURCES.filter((source) => !used.has(source));

  return (
    <div className="space-y-2">
      <SortableList ids={ids} onReorder={(from, to) => onChange(reorder(current, from, to))}>
        {current.map((row, index) => {
          const preview = row.kind === "auto" ? (values[row.source] ?? "").trim() : row.value.trim();
          return (
            <SortableRow key={ids[index]} id={ids[index]}>
              {({ handleProps }) => (
                <div className="flex items-start gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] p-2">
                  <DragHandle {...handleProps} className="mt-1.5 shrink-0" />
                  {/* min-w-0 so a long value wraps inside the row instead of pushing it wide —
                      a flex child's automatic minimum size is its content. */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      value={row.kind === "auto" ? (row.label ?? DETAIL_SOURCE_LABELS[row.source]) : row.label}
                      onChange={(event) =>
                        patch(
                          index,
                          row.kind === "auto"
                            ? { ...row, label: event.target.value }
                            : { ...row, label: event.target.value },
                        )
                      }
                      placeholder="Label"
                      aria-label="Row label"
                      className="app-input h-8 font-mono text-[11px] uppercase tracking-[0.1em]"
                    />
                    {row.kind === "auto" ? (
                      // The value is the document's, not the author's — showing it read-only is
                      // what makes an auto row worth having over a typed one.
                      <p className="truncate text-xs leading-5 text-[var(--text-4)]" title={preview}>
                        {preview || <span className="italic">Empty — this row won&rsquo;t print</span>}
                      </p>
                    ) : (
                      <input
                        value={row.value}
                        onChange={(event) => patch(index, { ...row, value: event.target.value })}
                        placeholder="Value"
                        aria-label="Row value"
                        className="app-input h-8 text-sm"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${row.kind === "auto" ? DETAIL_SOURCE_LABELS[row.source] : row.label || "row"}`}
                    className="mt-1 shrink-0 rounded-[4px] p-1 text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--danger-600)]"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </SortableRow>
          );
        })}
      </SortableList>

      {adding ? (
        <div className="space-y-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2">
          {/* Known sources first — they stay correct on their own. A custom row is the escape
              hatch, so it sits last rather than competing with them. */}
          {available.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => {
                onChange([...current, { kind: "auto", source }]);
                setAdding(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-0)]"
            >
              <span>{DETAIL_SOURCE_LABELS[source]}</span>
              <span className="truncate font-mono text-[10px] text-[var(--text-4)]">
                {(values[source] ?? "").trim() || "—"}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange([...current, { kind: "custom", label: "", value: "" }]);
              setAdding(false);
            }}
            className="flex w-full items-center gap-2 rounded-[4px] border-t border-[var(--border-2)] px-2 pt-2 pb-1.5 text-left text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-0)]"
          >
            Custom row…
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] py-2 text-sm text-[var(--text-3)] transition-colors hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
        >
          <PlusIcon className="h-4 w-4" />
          Add detail
        </button>
      )}
    </div>
  );
}
