/** Section type: `out_of_scope` — items expressly excluded from scope. */

import { XCircleIcon } from "@heroicons/react/24/outline";
import { ListItemsEditor } from "@/components/proposals/list-items-editor";
import { defineSection } from "@/lib/sections/types";
import { InlineStringList } from "@/lib/sections/inline-text";
import type { ListSectionData } from "@/types/proposal";

/**
 * The exclusion marker: red, legible, and centred in the text's own line box.
 *
 * It was a 10px grey mono `×` — smaller than the text beside it, the same colour as a caption,
 * and inline, so it drifted off the line it belonged to. An exclusion list is the one place in a
 * document where the reader must not miss the marker, so it now carries `--doc-danger` at a size
 * that reads. `h-7` matches the `leading-7` body, which is what puts it ON the line rather than
 * near it.
 */
function crossMarker() {
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-4 shrink-0 items-center justify-center text-[17px] font-semibold leading-none"
      style={{ color: "var(--doc-danger, var(--danger-500))" }}
    >
      ×
    </span>
  );
}

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
  inlineEditable: true,
  Editor: ({ data, onChange }) => (
    <ListItemsEditor
      title="Out of scope"
      items={data.items}
      onChange={(items) => onChange({ ...data, items })}
    />
  ),
  Preview: ({ data, editable, onChange }) => {
    if (editable && onChange) {
      return (
        <InlineStringList
          items={data.items ?? []}
          onChange={(items) => onChange({ ...data, items })}
          marker={crossMarker}
          placeholder="Something expressly excluded…"
          addLabel="Add exclusion"
        />
      );
    }
    return (
      <ul className="space-y-2 text-sm leading-7 text-[var(--text-2)]">
        {(data.items ?? []).map((item, index) => (
          <li key={index} className="flex items-start gap-2.5">
            {crossMarker()}
            <span className="flex-1">{item}</span>
          </li>
        ))}
      </ul>
    );
  },
});
