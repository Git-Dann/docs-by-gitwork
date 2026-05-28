/** Section type: `assumptions` — working assumptions about scope, dependencies, constraints. */

import { ListItemsEditor } from "@/components/proposals/list-items-editor";
import { defineSection } from "@/lib/sections/types";
import type { ListSectionData } from "@/types/proposal";

export const assumptionsSection = defineSection<ListSectionData>({
  key: "assumptions",
  displayName: "Assumptions",
  description: "Working assumptions about scope, dependencies, and constraints.",
  aiExpandable: true,
  Editor: ({ data, onChange }) => (
    <ListItemsEditor
      title="Assumptions"
      items={data.items}
      onChange={(items) => onChange({ ...data, items })}
    />
  ),
  Preview: ({ data }) => (
    <ul className="space-y-2 text-sm leading-7 text-[var(--text-2)]">
      {(data.items ?? []).map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] pt-1.5">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  ),
});
