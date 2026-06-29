/**
 * Section type: `kpi_strip` — a row of 2–6 big-figure stats. Used to lead a section with
 * impact numbers ("85% retention · 3.2× ROI · 18 days to launch") that quickly summarise the
 * proposal's commercial story. Stats render with the DM Serif Display face (consistent with
 * Pulse's stat tiles).
 */

import { PlusIcon, TrashIcon, ChartBarSquareIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { InlineAddButton, InlineRemoveButton, InlineTextArea } from "@/lib/sections/inline-text";
import type { KpiStripItem, KpiStripSectionData } from "@/types/proposal";

function newKpi(value = "", label = ""): KpiStripItem {
  return { value, label, context: "" };
}

export const kpiStripSection = defineSection<KpiStripSectionData>({
  key: "kpi_strip",
  displayName: "KPI Strip",
  description: "A row of 2–6 big stat figures. Great for leading a section.",
  category: "narrative",
  icon: ChartBarSquareIcon,
  defaultData: { items: [newKpi("85%", "Retention"), newKpi("3.2×", "ROI"), newKpi("18", "Days to launch")] },
  defaultTitle: "Headline numbers",
  defaultDescription: "A row of big-figure stats.",
  recommendedFor: ["PROPOSAL"],
  aiExpandable: true,
  inlineEditable: true,
  Editor: ({ data, onChange }) => {
    const items = data.items ?? [];

    function update(index: number, patch: Partial<KpiStripItem>) {
      onChange({ ...data, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
    }

    function add() {
      if (items.length >= 6) return;
      onChange({ ...data, items: [...items, newKpi()] });
    }

    function remove(index: number) {
      if (items.length <= 1) return;
      onChange({ ...data, items: items.filter((_, i) => i !== index) });
    }

    return (
      <SimpleForm>
        {items.map((item, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                KPI {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={items.length <= 1}
                aria-label="Remove KPI"
                className="text-rose-600 hover:text-rose-700 disabled:opacity-30"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <FormInput label="Value" value={item.value} onChange={(value) => update(i, { value })} placeholder="85%" />
              <FormInput label="Label" value={item.label} onChange={(label) => update(i, { label })} placeholder="Retention" />
              <FormInput label="Context (optional)" value={item.context ?? ""} onChange={(context) => update(i, { context })} placeholder="Q2 result" />
            </div>
          </div>
        ))}
        {items.length < 6 ? (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
          >
            <PlusIcon className="h-4 w-4" /> Add KPI (max 6)
          </button>
        ) : null}
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    const items = data.items ?? [];

    if (editable && onChange) {
      const update = (i: number, patch: Partial<KpiStripItem>) =>
        onChange({ ...data, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
      return (
        <div className="space-y-3">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(items.length, 1), 6)}, minmax(0, 1fr))` }}
          >
            {items.map((item, i) => (
              <div key={i} className="group/row relative rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <span className="absolute right-1 top-1">
                  <InlineRemoveButton onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })} />
                </span>
                <InlineTextArea
                  value={item.context ?? ""}
                  onChange={(context) => update(i, { context })}
                  placeholder="Context"
                  ariaLabel="KPI context"
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
                />
                <div className="mt-1.5">
                  <InlineTextArea
                    value={item.value}
                    onChange={(value) => update(i, { value })}
                    placeholder="85%"
                    ariaLabel="KPI value"
                    className="font-[family-name:var(--font-display)] text-[32px] font-normal leading-none text-[var(--text-1)]"
                  />
                </div>
                <div className="mt-2">
                  <InlineTextArea
                    value={item.label}
                    onChange={(label) => update(i, { label })}
                    placeholder="Retention"
                    ariaLabel="KPI label"
                    className="text-sm text-[var(--text-3)]"
                  />
                </div>
              </div>
            ))}
          </div>
          {items.length < 6 ? (
            <InlineAddButton label="Add KPI" onClick={() => onChange({ ...data, items: [...items, newKpi()] })} />
          ) : null}
        </div>
      );
    }

    if (items.length === 0) {
      return <p className="text-sm italic text-[var(--text-4)]">No KPIs yet — add one in the editor.</p>;
    }
    return (
      <div
        className="proposal-block-avoid grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 6)}, minmax(0, 1fr))` }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-[10px] border border-[var(--border-2)] bg-white p-4"
          >
            {item.context ? (
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                {item.context}
              </p>
            ) : null}
            <p className={`font-[family-name:var(--font-display)] text-[32px] font-normal leading-none text-[var(--text-1)] ${item.context ? "mt-1.5" : ""}`}>
              {item.value || "—"}
            </p>
            <p className="mt-2 text-sm text-[var(--text-3)]">{item.label || "—"}</p>
          </div>
        ))}
      </div>
    );
  },
});
