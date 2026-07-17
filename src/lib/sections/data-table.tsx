/**
 * Section type: `data_table` — generic editable table with arbitrary columns and rows.
 *
 * Unlike the SLA/SOW-specific table sections (service_tiers, response_times, penalties), this
 * block has no opinion on what goes in it. Operators define the columns and rows themselves.
 * Useful for one-off comparison data, pricing summaries, allocations, etc.
 */

import { TrashIcon, PlusIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormTextArea } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { InlineAddButton, InlineRemoveButton, InlineTextArea } from "@/lib/sections/inline-text";
import type { DataTableSectionData } from "@/types/proposal";

export const dataTableSection = defineSection<DataTableSectionData>({
  key: "data_table",
  displayName: "Data Table",
  description: "Editable rows and columns — useful for any custom table.",
  category: "tables",
  icon: TableCellsIcon,
  defaultData: {
    columns: ["Column A", "Column B", "Column C"],
    rows: [
      ["", "", ""],
      ["", "", ""],
    ],
  },
  defaultTitle: "Data Table",
  defaultDescription: "Editable rows and columns.",
  aiExpandable: false,
  inlineEditable: true,
  Editor: ({ data, onChange }) => {
    const cols = data.columns ?? [];
    const rows = data.rows ?? [];

    function updateCol(index: number, value: string) {
      const nextCols = [...cols];
      nextCols[index] = value;
      onChange({ ...data, columns: nextCols });
    }

    function addCol() {
      const nextCols = [...cols, `Column ${String.fromCharCode(65 + cols.length)}`];
      const nextRows = rows.map((row) => [...row, ""]);
      onChange({ ...data, columns: nextCols, rows: nextRows });
    }

    function removeCol(index: number) {
      if (cols.length <= 1) return;
      const nextCols = cols.filter((_, i) => i !== index);
      const nextRows = rows.map((row) => row.filter((_, i) => i !== index));
      onChange({ ...data, columns: nextCols, rows: nextRows });
    }

    function updateCell(rowIndex: number, colIndex: number, value: string) {
      const nextRows = rows.map((row, i) => {
        if (i !== rowIndex) return row;
        const nextRow = [...row];
        nextRow[colIndex] = value;
        return nextRow;
      });
      onChange({ ...data, rows: nextRows });
    }

    function addRow() {
      onChange({ ...data, rows: [...rows, cols.map(() => "")] });
    }

    function removeRow(index: number) {
      onChange({ ...data, rows: rows.filter((_, i) => i !== index) });
    }

    return (
      <SimpleForm>
        <FormTextArea
          label="Caption (optional)"
          value={data.caption ?? ""}
          onChange={(caption) => onChange({ ...data, caption })}
          rows={2}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-2)]">Columns</span>
            <button
              type="button"
              onClick={addCol}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add column
            </button>
          </div>
          {/* Full-width column rows so long names never crop in the narrow rail (the old fixed
              w-32 chips clipped names like "Delivery area"). */}
          <div className="space-y-2">
            {cols.map((col, i) => (
              <div key={i} className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-2.5 py-1.5">
                <input
                  value={col}
                  onChange={(e) => updateCol(i, e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
                  maxLength={80}
                  placeholder={`Column ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeCol(i)}
                  disabled={cols.length <= 1}
                  aria-label="Remove column"
                  className="shrink-0 text-rose-600 hover:text-rose-700 disabled:opacity-30"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="min-w-0 text-sm font-medium text-[var(--text-2)]">Rows</span>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add row
            </button>
          </div>
          {/* One card per row with the cells STACKED and each labelled by its column — so a wide
              table (4+ columns) is fully editable in the narrow rail instead of being squeezed into
              tiny cropped inputs side by side. */}
          <div className="space-y-3">
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="rounded-[10px] border border-[var(--border-2)] bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="app-eyebrow min-w-0 truncate">Row {rowIndex + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    aria-label={`Remove row ${rowIndex + 1}`}
                    className="shrink-0 text-rose-600 hover:text-rose-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {cols.map((colName, colIndex) => (
                    <label key={colIndex} className="block space-y-1">
                      <span className="app-field-label">{colName || `Column ${colIndex + 1}`}</span>
                      <input
                        value={row[colIndex] ?? ""}
                        onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                        className="app-input w-full text-sm"
                        placeholder="—"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    const cols = data.columns ?? [];
    const rows = data.rows ?? [];

    if (editable && onChange) {
      const updateCol = (i: number, value: string) =>
        onChange({ ...data, columns: cols.map((c, j) => (j === i ? value : c)) });
      const addCol = () =>
        onChange({
          ...data,
          columns: [...cols, `Column ${String.fromCharCode(65 + cols.length)}`],
          rows: rows.map((r) => [...r, ""]),
        });
      const removeCol = (i: number) => {
        if (cols.length <= 1) return;
        onChange({
          ...data,
          columns: cols.filter((_, j) => j !== i),
          rows: rows.map((r) => r.filter((_, j) => j !== i)),
        });
      };
      const updateCell = (ri: number, ci: number, value: string) =>
        onChange({
          ...data,
          rows: rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? value : c)) : r)),
        });
      const addRow = () => onChange({ ...data, rows: [...rows, cols.map(() => "")] });
      const removeRow = (ri: number) => onChange({ ...data, rows: rows.filter((_, i) => i !== ri) });

      return (
        <div className="space-y-3">
          <InlineTextArea
            value={data.caption ?? ""}
            onChange={(caption) => onChange({ ...data, caption })}
            placeholder="Caption (optional)…"
            ariaLabel="Table caption"
            className="text-sm leading-7 text-[var(--text-2)]"
          />
          <div className="overflow-x-auto rounded-[10px] border border-[var(--border-2)] bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {cols.map((col, i) => (
                    <th
                      key={i}
                      className="group/row border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-3 py-2 text-left align-top"
                    >
                      <div className="flex items-start gap-1">
                        <div className="flex-1">
                          <InlineTextArea
                            value={col}
                            onChange={(v) => updateCol(i, v)}
                            placeholder={`Column ${i + 1}`}
                            ariaLabel={`Column ${i + 1} heading`}
                            className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]"
                          />
                        </div>
                        {cols.length > 1 ? (
                          <InlineRemoveButton onClick={() => removeCol(i)} label="Remove column" />
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th className="border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-2 py-2 align-middle">
                    <button
                      type="button"
                      onClick={addCol}
                      aria-label="Add column"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="group/row">
                    {cols.map((_, ci) => (
                      <td
                        key={ci}
                        className="border-t border-[var(--border-3)] px-3 py-2 align-top text-[13px] leading-6 text-[var(--text-2)]"
                      >
                        <InlineTextArea
                          value={row[ci] ?? ""}
                          onChange={(v) => updateCell(ri, ci, v)}
                          placeholder="—"
                          ariaLabel={`Row ${ri + 1}, ${cols[ci] ?? `column ${ci + 1}`}`}
                          className="text-[13px] leading-6 text-[var(--text-2)]"
                        />
                      </td>
                    ))}
                    <td className="border-t border-[var(--border-3)] px-2 py-2 align-middle">
                      <InlineRemoveButton onClick={() => removeRow(ri)} label="Remove row" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InlineAddButton label="Add row" onClick={addRow} />
        </div>
      );
    }

    if (cols.length === 0 || rows.length === 0) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          Empty table — add columns and rows in the editor.
        </p>
      );
    }
    return (
      <div className="proposal-block-avoid">
        {data.caption ? (
          <p className="mb-3 text-sm leading-7 text-[var(--text-2)]">{data.caption}</p>
        ) : null}
        <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {cols.map((col, i) => (
                  <th
                    key={i}
                    className="border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {cols.map((_, colIndex) => (
                    <td
                      key={colIndex}
                      className="border-t border-[var(--border-3)] px-4 py-3 text-[13px] leading-6 text-[var(--text-2)]"
                    >
                      {row[colIndex] || <span className="text-[var(--text-4)]">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
});
