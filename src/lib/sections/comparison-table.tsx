/**
 * Section type: `comparison_table` — us vs them, row per capability, with checkmarks / crosses
 * or freeform text per cell. The classic agency proposal "why us not them" block.
 */

import { PlusIcon, TrashIcon, Squares2X2Icon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import type { ComparisonRow, ComparisonTableSectionData } from "@/types/proposal";

function newRow(): ComparisonRow {
  return { label: "", detail: "", us: true, them: false };
}

/** Per-cell editor — toggles between yes / no / freeform text in a compact dropdown. */
function CellEditor({
  value,
  onChange,
}: {
  value: boolean | string;
  onChange: (next: boolean | string) => void;
}) {
  const mode = value === true ? "yes" : value === false ? "no" : "text";

  return (
    <div className="flex items-center gap-1">
      <select
        value={mode}
        onChange={(e) => {
          if (e.target.value === "yes") onChange(true);
          else if (e.target.value === "no") onChange(false);
          else onChange(typeof value === "string" ? value : "");
        }}
        className="app-select-compact text-xs"
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
        <option value="text">Text</option>
      </select>
      {mode === "text" ? (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="app-input text-xs"
          placeholder="e.g. Limited"
        />
      ) : null}
    </div>
  );
}

function CellPreview({ value, positive }: { value: boolean | string; positive: boolean }) {
  if (value === true) {
    return (
      <span className={positive ? "text-[var(--success-500)]" : "text-[var(--text-3)]"}>
        <CheckIcon className="inline h-4 w-4" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="text-[var(--text-4)]">
        <XMarkIcon className="inline h-4 w-4" />
      </span>
    );
  }
  return <span className="text-sm text-[var(--text-2)]">{value || "—"}</span>;
}

export const comparisonTableSection = defineSection<ComparisonTableSectionData>({
  key: "comparison_table",
  displayName: "Comparison Table",
  description: "Side-by-side feature comparison with checkmarks or text per cell.",
  category: "tables",
  icon: Squares2X2Icon,
  defaultData: {
    usLabel: "Gitwork",
    themLabel: "Status quo",
    rows: [newRow(), newRow(), newRow()],
  },
  defaultTitle: "How we compare",
  defaultDescription: "Side-by-side feature comparison.",
  recommendedFor: ["PROPOSAL"],
  aiExpandable: true,
  Editor: ({ data, onChange }) => {
    const rows = data.rows ?? [];

    function update(index: number, patch: Partial<ComparisonRow>) {
      onChange({ ...data, rows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
    }
    function add() {
      onChange({ ...data, rows: [...rows, newRow()] });
    }
    function remove(index: number) {
      if (rows.length <= 1) return;
      onChange({ ...data, rows: rows.filter((_, i) => i !== index) });
    }

    return (
      <SimpleForm>
        <div className="@container">
          <div className="grid gap-2 @[26rem]:grid-cols-2">
            <FormInput label="Our column heading" value={data.usLabel} onChange={(usLabel) => onChange({ ...data, usLabel })} />
            <FormInput label="Their column heading" value={data.themLabel} onChange={(themLabel) => onChange({ ...data, themLabel })} />
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="@container rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  Row {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={rows.length <= 1}
                  aria-label="Remove row"
                  className="text-rose-600 hover:text-rose-700 disabled:opacity-30"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                <FormInput label="Label" value={row.label} onChange={(label) => update(i, { label })} placeholder="Capability" />
                <FormInput label="Detail (optional)" value={row.detail ?? ""} onChange={(detail) => update(i, { detail })} placeholder="One-line elaboration" />
                <div className="grid gap-2 @[26rem]:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">{data.usLabel}</span>
                    <CellEditor value={row.us} onChange={(us) => update(i, { us })} />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">{data.themLabel}</span>
                    <CellEditor value={row.them} onChange={(them) => update(i, { them })} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
        >
          <PlusIcon className="h-4 w-4" /> Add row
        </button>
      </SimpleForm>
    );
  },
  Preview: ({ data }) => {
    const rows = data.rows ?? [];
    if (rows.length === 0) {
      return <p className="text-sm italic text-[var(--text-4)]">No rows yet — add one in the editor.</p>;
    }
    return (
      <div className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                Capability
              </th>
              <th className="border-b border-[var(--border-3)] bg-[var(--brand-200)]/40 px-4 py-2.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                {data.usLabel}
              </th>
              <th className="border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-4 py-2.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                {data.themLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="border-t border-[var(--border-3)] px-4 py-3 text-[13px] leading-6">
                  <p className="font-medium text-[var(--text-1)]">{row.label || "—"}</p>
                  {row.detail ? <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{row.detail}</p> : null}
                </td>
                <td className="border-t border-[var(--border-3)] bg-[var(--brand-200)]/15 px-4 py-3 text-center">
                  <CellPreview value={row.us} positive />
                </td>
                <td className="border-t border-[var(--border-3)] px-4 py-3 text-center">
                  <CellPreview value={row.them} positive={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});
