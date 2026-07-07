/** Section type: `principles_grid` — a numbered grid of principles/values (light or navy). */

import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { InlineTextArea, InlineAddButton, InlineRemoveButton } from "@/lib/sections/inline-text";
import type { PrinciplesGridSectionData } from "@/types/proposal";

const num = (i: number) => String(i + 1).padStart(2, "0");

export const principlesGridSection = defineSection<PrinciplesGridSectionData>({
  key: "principles_grid",
  displayName: "Principles grid",
  description: "A numbered grid of principles or values — light, or a navy band.",
  category: "lists",
  icon: Squares2X2Icon,
  defaultData: {
    items: [
      { title: "Stable" },
      { title: "Clean" },
      { title: "Free from test data" },
      { title: "Free from unfinished work" },
      { title: "Fully tested" },
      { title: "Ready for customers" },
    ],
    columns: 3,
    style: "dark",
  },
  defaultTitle: "Principles",
  defaultDescription: "A numbered grid of principles.",
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
        <select
          value={data.style ?? "light"}
          onChange={(e) => onChange({ ...data, style: e.target.value as PrinciplesGridSectionData["style"] })}
          className="app-select w-full"
        >
          <option value="light">Light</option>
          <option value="dark">Navy</option>
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Columns</span>
        <select
          value={String(data.columns ?? 3)}
          onChange={(e) => onChange({ ...data, columns: Number(e.target.value) as PrinciplesGridSectionData["columns"] })}
          className="app-select w-full"
        >
          <option value="2">2 columns</option>
          <option value="3">3 columns</option>
        </select>
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        Each item&rsquo;s title and detail are edited inline on the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    const items = data.items ?? [];
    const columns = data.columns ?? 3;
    const dark = (data.style ?? "light") === "dark";

    if (editable && onChange) {
      const update = (i: number, patch: Partial<{ title: string; detail: string }>) =>
        onChange({ ...data, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
      return (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item, i) => (
              <div key={i} className="group/row rounded-[10px] border border-[var(--border-2)] bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold text-[var(--text-4)]">{num(i)}</span>
                  <InlineRemoveButton onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })} />
                </div>
                <InlineTextArea
                  value={item.title}
                  onChange={(title) => update(i, { title })}
                  placeholder="Title"
                  ariaLabel={`Principle ${i + 1} title`}
                  className="mt-1 font-[family-name:var(--font-display)] text-[18px] leading-tight text-[var(--text-1)]"
                />
                <InlineTextArea
                  value={item.detail ?? ""}
                  onChange={(detail) => update(i, { detail })}
                  placeholder="Detail (optional)"
                  ariaLabel={`Principle ${i + 1} detail`}
                  className="mt-1 text-[13px] leading-6 text-[var(--text-3)]"
                />
              </div>
            ))}
          </div>
          <InlineAddButton label="Add principle" onClick={() => onChange({ ...data, items: [...items, { title: "" }] })} />
        </div>
      );
    }

    if (items.length === 0) return null;
    const colClass = columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";

    if (dark) {
      return (
        <div className="proposal-block-avoid overflow-hidden rounded-[14px]" style={{ background: "linear-gradient(135deg, #14132b 0%, #0f172a 60%, #191740 100%)" }}>
          <div className={`grid ${colClass}`}>
            {items.map((item, i) => (
              <div key={i} className="border-b border-white/10 p-5 sm:border-r [&:last-child]:border-b-0">
                <p className="font-mono text-[11px] font-semibold text-white/45">{num(i)}</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-[20px] leading-tight text-white">{item.title}</p>
                {item.detail ? <p className="mt-1.5 text-[13px] leading-6 text-white/60">{item.detail}</p> : null}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className={`proposal-block-avoid grid gap-3 ${colClass}`}>
        {items.map((item, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--doc-line,rgba(0,0,0,0.14))] bg-[var(--doc-panel,#f7f5ef)] p-5">
            <p className="font-mono text-[11px] font-semibold text-[var(--doc-muted,#8a867c)]">{num(i)}</p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-[20px] leading-tight text-[var(--doc-ink,#1a1a17)]">{item.title}</p>
            {item.detail ? <p className="mt-1.5 text-[13px] leading-6 text-[var(--doc-ink-soft,#4b4a44)]">{item.detail}</p> : null}
          </div>
        ))}
      </div>
    );
  },
});
