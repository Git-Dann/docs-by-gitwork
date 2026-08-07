/**
 * Section type: `kpi_strip` — a row of 2–6 big-figure stats. Used to lead a section with
 * impact numbers ("85% retention · 3.2× ROI · 18 days to launch") that quickly summarise the
 * proposal's commercial story. Stats render with the DM Serif Display face (consistent with
 * Pulse's stat tiles).
 */

import { PlusIcon, TrashIcon, ChartBarSquareIcon, MoonIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { InlineAddButton, InlineRemoveButton } from "@/lib/sections/inline-text";
import { RichTextField } from "@/lib/sections/rich-text-lazy";
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
          <div key={i} className="@container rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                KPI {i + 1}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => update(i, { emphasis: !item.emphasis })}
                  aria-pressed={Boolean(item.emphasis)}
                  title="Emphasise (dark card)"
                  className={`inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[11px] font-medium transition ${
                    item.emphasis
                      ? "border-[var(--doc-panel-dark)] bg-[var(--doc-panel-dark)] text-white"
                      : "border-[var(--border-2)] text-[var(--text-4)] hover:text-[var(--brand-700)]"
                  }`}
                >
                  <MoonIcon className="h-3 w-3" /> Dark
                </button>
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
            </div>
            <div className="grid gap-2 @[34rem]:grid-cols-3">
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
            {items.map((item, i) => {
              const dark = Boolean(item.emphasis);
              return (
              <div
                key={i}
                className={`group/row relative rounded-[10px] border p-4 ${
                  dark ? "border-[var(--doc-panel-dark)] bg-[var(--doc-panel-dark)]" : "border-[var(--border-2)] bg-white"
                }`}
              >
                {/* The dark-card toggle lives in the Options rail, not here. On the canvas it sat
                    a moon icon on top of every KPI card — a control rendered INSIDE the artwork,
                    which reads as part of the design rather than as chrome. The rail already has
                    a `Dark` button per KPI, so this was a second copy of the same switch. */}
                <span className="absolute right-1 top-1 flex items-center gap-0.5">
                  <InlineRemoveButton onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })} />
                </span>
                <RichTextField
                  value={item.context ?? ""}
                  onChange={(context) => update(i, { context })}
                  placeholder="Context"
                  ariaLabel="KPI context"
                  className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${dark ? "text-white/55" : "text-[var(--text-4)]"}`}
                />
                <div className="mt-1.5">
                  <RichTextField
                    value={item.value}
                    onChange={(value) => update(i, { value })}
                    placeholder="85%"
                    ariaLabel="KPI value"
                    className={`doc-display-face text-[32px] leading-none ${dark ? "text-white" : "text-[var(--text-1)]"}`}
                  />
                </div>
                <div className="mt-2">
                  <RichTextField
                    value={item.label}
                    onChange={(label) => update(i, { label })}
                    placeholder="Retention"
                    ariaLabel="KPI label"
                    className={`text-sm ${dark ? "text-white/70" : "text-[var(--text-3)]"}`}
                  />
                </div>
              </div>
              );
            })}
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
        {items.map((item, i) => {
          const dark = Boolean(item.emphasis);
          return (
          <div
            key={i}
            className={`rounded-[10px] border p-4 ${
              dark ? "border-[var(--doc-panel-dark)] bg-[var(--doc-panel-dark)]" : "border-[var(--border-2)] bg-white"
            }`}
          >
            {item.context ? (
              <p className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${dark ? "text-white/55" : "text-[var(--text-4)]"}`}>
                {item.context}
              </p>
            ) : null}
            <p className={`doc-display-face text-[32px] leading-none ${dark ? "text-white" : "text-[var(--text-1)]"} ${item.context ? "mt-1.5" : ""}`}>
              {item.value || "—"}
            </p>
            <p className={`mt-2 text-sm ${dark ? "text-white/70" : "text-[var(--text-3)]"}`}>{item.label || "—"}</p>
          </div>
          );
        })}
      </div>
    );
  },
});
