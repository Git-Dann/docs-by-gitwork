/** Section type: `out_of_scope` — items expressly excluded from scope. */

import { XCircleIcon } from "@heroicons/react/24/outline";
import { ListItemsEditor } from "@/components/proposals/list-items-editor";
import { defineSection } from "@/lib/sections/types";
import type { ListSectionData } from "@/types/proposal";

export const outOfScopeSection = defineSection<ListSectionData>({
  key: "out_of_scope",
  displayName: "Out of Scope",
  description: "Items expressly excluded from this engagement.",
  category: "lists",
  icon: XCircleIcon,
  defaultData: { items: [] },
  defaultTitle: "Out of scope",
  defaultDescription: "Items expressly excluded.",
  recommendedFor: ["PROPOSAL", "SOW"],
  aiExpandable: true,
  Editor: ({ data, onChange }) => (
    <ListItemsEditor
      title="Out of scope"
      items={data.items}
      onChange={(items) => onChange({ ...data, items })}
    />
  ),
  Preview: ({ data }) => (
    <ul className="space-y-2 text-sm leading-7 text-[var(--text-2)]">
      {(data.items ?? []).map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] pt-1.5">
            ×
          </span>
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  ),
});
