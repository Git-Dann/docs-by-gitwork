/** Section type: `category_checklist` — a grid of small titled checklist cards. */

import { CheckIcon } from "@heroicons/react/24/solid";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { InlineTextArea, InlineStringList, InlineAddButton, InlineRemoveButton } from "@/lib/sections/inline-text";
import type { CategoryChecklistSectionData } from "@/types/proposal";

export const categoryChecklistSection = defineSection<CategoryChecklistSectionData>({
  key: "category_checklist",
  displayName: "Category checklist",
  description: "A grid of small titled checklist cards — group related checks together.",
  category: "lists",
  icon: ClipboardDocumentCheckIcon,
  defaultData: {
    groups: [
      { title: "Functional", items: ["", ""] },
      { title: "UI & UX", items: ["", ""] },
      { title: "Data", items: ["", ""] },
      { title: "Performance", items: ["", ""] },
    ],
    columns: 2,
  },
  defaultTitle: "Checklist",
  defaultDescription: "Grouped checklist cards.",
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Columns</span>
        <select
          value={String(data.columns ?? 2)}
          onChange={(e) => onChange({ ...data, columns: Number(e.target.value) as CategoryChecklistSectionData["columns"] })}
          className="app-select w-full"
        >
          <option value="1">1 column</option>
          <option value="2">2 columns</option>
          <option value="3">3 columns</option>
          <option value="4">4 columns</option>
        </select>
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        Group titles and their items are edited inline on the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    const groups = data.groups ?? [];
    const columns = data.columns ?? 2;
    const colClass =
      columns === 1
        ? ""
        : columns === 4
          ? "sm:grid-cols-2 lg:grid-cols-4"
          : columns === 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "sm:grid-cols-2";

    if (editable && onChange) {
      const updateGroup = (i: number, patch: Partial<{ title: string; items: string[] }>) =>
        onChange({ ...data, groups: groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
      return (
        <div className="space-y-3">
          <div className={`grid gap-3 ${colClass}`}>
            {groups.map((group, i) => (
              <div key={i} className="group/row rounded-[10px] border border-[var(--border-2)] bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <InlineTextArea
                    value={group.title}
                    onChange={(title) => updateGroup(i, { title })}
                    placeholder="Category"
                    ariaLabel={`Category ${i + 1} title`}
                    className="text-sm font-semibold text-[var(--text-1)]"
                  />
                  <InlineRemoveButton
                    label="Remove category"
                    onClick={() => onChange({ ...data, groups: groups.filter((_, j) => j !== i) })}
                  />
                </div>
                <InlineStringList
                  items={group.items ?? []}
                  onChange={(items) => updateGroup(i, { items })}
                  marker={() => <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" />}
                  placeholder="Check item"
                  addLabel="Add item"
                />
              </div>
            ))}
          </div>
          <InlineAddButton
            label="Add category"
            onClick={() => onChange({ ...data, groups: [...groups, { title: "", items: [""] }] })}
          />
        </div>
      );
    }

    const cleanGroups = groups
      .map((g) => ({ title: g.title, items: (g.items ?? []).filter((i) => i.trim()) }))
      .filter((g) => g.title.trim() || g.items.length);
    if (cleanGroups.length === 0) return null;

    return (
      <div className={`proposal-block-avoid grid gap-3 ${colClass}`}>
        {cleanGroups.map((group, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--doc-line,rgba(0,0,0,0.14))] bg-[var(--doc-panel,#f7f5ef)] p-4">
            <p className="mb-3 text-sm font-semibold text-[var(--doc-ink,#1a1a17)]">{group.title}</p>
            {/* `leading-[1.45]` not `leading-6`: at 13px that was a 1.85 ratio, which reads as a
                loose paragraph rather than a list and cost each item most of a blank line.
                `text-pretty` keeps a lone word off its own last line. */}
            <ul className="space-y-1.5">
              {group.items.map((item, j) => (
                <li
                  key={j}
                  className="flex items-start gap-2 text-pretty text-[13px] leading-[1.45] text-[var(--doc-ink-soft,#4b4a44)]"
                >
                  <CheckIcon className="mt-[0.15em] h-3.5 w-3.5 shrink-0 text-[var(--success-500)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  },
});
