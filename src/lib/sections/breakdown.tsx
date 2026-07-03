/**
 * Section type: `breakdown` — a labelled breakdown list.
 *
 * Each row is a bold label, an optional accent-coloured count, and an explanatory sentence, with a
 * hairline rule between rows. Modelled on the "Request breakdown" layout — the readable middle
 * ground between a bare bullet list and a full data table when each item needs a short narrative.
 */

import { ListBulletIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput, FormTextArea } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { InlineAddButton, InlineRemoveButton, InlineTextArea } from "@/lib/sections/inline-text";
import type { BreakdownItem, BreakdownSectionData } from "@/types/proposal";

function newItem(): BreakdownItem {
  return { label: "", count: "", description: "" };
}

export const breakdownSection = defineSection<BreakdownSectionData>({
  key: "breakdown",
  displayName: "Breakdown list",
  description: "Labelled rows — bold label, a count, and a short description each.",
  category: "lists",
  icon: ListBulletIcon,
  defaultData: {
    items: [
      { label: "First item", count: "6", description: "A sentence explaining this item and how it was handled." },
      { label: "Second item", count: "3", description: "A sentence explaining this item and how it was handled." },
    ],
  },
  defaultTitle: "Breakdown",
  defaultDescription: "Broken down by type",
  aiExpandable: true,
  inlineEditable: true,
  Editor: ({ data, onChange }) => {
    const items = data.items ?? [];
    const update = (i: number, patch: Partial<BreakdownItem>) =>
      onChange({ ...data, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
    const add = () => onChange({ ...data, items: [...items, newItem()] });
    const remove = (i: number) => onChange({ ...data, items: items.filter((_, j) => j !== i) });

    return (
      <SimpleForm>
        {items.map((item, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                Item {i + 1}
              </span>
              <InlineRemoveButton onClick={() => remove(i)} label="Remove item" />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_80px]">
              <FormInput label="Label" value={item.label} onChange={(label) => update(i, { label })} placeholder="Subscription confusion" />
              <FormInput label="Count" value={item.count ?? ""} onChange={(count) => update(i, { count })} placeholder="6" />
            </div>
            <div className="mt-2">
              <FormTextArea label="Description" value={item.description} onChange={(description) => update(i, { description })} rows={2} />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
        >
          + Add item
        </button>
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    const items = data.items ?? [];

    if (editable && onChange) {
      const update = (i: number, patch: Partial<BreakdownItem>) =>
        onChange({ ...data, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
      return (
        <div className="space-y-1">
          <div className="divide-y divide-[var(--border-3)]">
            {items.map((item, i) => (
              <div key={i} className="group/row relative py-3.5 first:pt-0">
                <span className="absolute right-0 top-3">
                  <InlineRemoveButton onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })} label="Remove item" />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-1.5 pr-6">
                  <InlineTextArea
                    value={item.label}
                    onChange={(label) => update(i, { label })}
                    placeholder="Label"
                    ariaLabel="Item label"
                    className="text-[15px] font-semibold leading-6 text-[var(--doc-ink)]"
                  />
                  <span className="text-[15px] leading-6 text-[var(--doc-accent)]">—</span>
                  <InlineTextArea
                    value={item.count ?? ""}
                    onChange={(count) => update(i, { count })}
                    placeholder="0"
                    ariaLabel="Item count"
                    className="text-[15px] leading-6 text-[var(--doc-accent)]"
                  />
                </div>
                <InlineTextArea
                  value={item.description}
                  onChange={(description) => update(i, { description })}
                  placeholder="Short description…"
                  ariaLabel="Item description"
                  className="mt-1 text-[13px] leading-6 text-[var(--doc-muted)]"
                />
              </div>
            ))}
          </div>
          <InlineAddButton label="Add item" onClick={() => onChange({ ...data, items: [...items, newItem()] })} />
        </div>
      );
    }

    if (items.length === 0) {
      return <p className="text-sm italic text-[var(--text-4)]">No items yet — add some in the editor.</p>;
    }
    return (
      <div className="proposal-block-avoid divide-y divide-[var(--border-3)]">
        {items.map((item, i) => (
          <div key={i} className="py-3.5 first:pt-0 last:pb-0">
            <p className="text-[15px] leading-6 text-[var(--doc-ink)]">
              <span className="font-semibold">{item.label || "—"}</span>
              {item.count ? <span className="text-[var(--doc-accent)]"> — {item.count}</span> : null}
            </p>
            {item.description ? (
              <p className="mt-1 text-[13px] leading-6 text-[var(--doc-muted)]">{item.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    );
  },
});
