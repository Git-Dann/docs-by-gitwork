/** Section type: `objectives` — what the engagement needs to achieve. */

import { FlagIcon } from "@heroicons/react/24/outline";
import { ObjectivesEditor } from "@/components/proposals/objectives-editor";
import { getObjectiveIcon } from "@/components/proposals/icon-select";
import { defineSection } from "@/lib/sections/types";
import type { ObjectivesSectionData } from "@/types/proposal";

export const objectivesSection = defineSection<ObjectivesSectionData>({
  key: "objectives",
  displayName: "Objectives",
  description: "What this engagement needs to achieve.",
  category: "lists",
  icon: FlagIcon,
  defaultData: { items: [] },
  defaultTitle: "Objectives",
  defaultDescription: "What this engagement needs to achieve.",
  recommendedFor: ["PROPOSAL", "SOW"],
  aiExpandable: true,
  Editor: ({ data, onChange }) => (
    <ObjectivesEditor
      items={data.items ?? []}
      onChange={(items) => onChange({ ...data, items })}
    />
  ),
  Preview: ({ data }) => (
    <div className="grid gap-4 md:grid-cols-2">
      {(data.items ?? []).map((item) => {
        const Icon = getObjectiveIcon(item.icon);
        return (
          <article
            key={item.id}
            className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
          >
            <div className="flex items-start gap-4">
              {Icon ? (
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] text-[var(--brand-700)]">
                  <Icon className="h-5 w-5" />
                </span>
              ) : null}
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--text-1)]">{item.title}</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{item.description}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  ),
});
