/** Section type: `objectives` — what the engagement needs to achieve. */

import { FlagIcon } from "@heroicons/react/24/outline";
import { ObjectivesEditor } from "@/components/proposals/objectives-editor";
import { getObjectiveIcon } from "@/components/proposals/icon-select";
import { renderLines } from "@/lib/markdown";
import { defineSection } from "@/lib/sections/types";
import { RichTextField } from "@/lib/sections/rich-text-lazy";
import { InlineAddButton, InlineRemoveButton, InlineTextArea } from "@/lib/sections/inline-text";
import type { ObjectivesSectionData } from "@/types/proposal";

function newObjectiveId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `obj-${Math.random().toString(36).slice(2, 10)}`;
}

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
  inlineEditable: true,
  hasOptions: true,
  // Options = per-objective icon picker (ObjectivesEditor); title + description are edited inline.
  Editor: ({ data, onChange }) => (
    <ObjectivesEditor
      items={data.items ?? []}
      onChange={(items) => onChange({ ...data, items })}
    />
  ),
  Preview: ({ data, editable, onChange }) => {
    const items = data.items ?? [];
    if (editable && onChange) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const Icon = getObjectiveIcon(item.icon);
            return (
              <article
                key={item.id}
                className="group/row proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
              >
                <div className="flex items-start gap-4">
                  {Icon ? (
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] text-[var(--brand-700)]">
                      <Icon className="h-5 w-5" />
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <InlineTextArea
                      value={item.title}
                      onChange={(title) =>
                        onChange({
                          ...data,
                          items: items.map((it) => (it.id === item.id ? { ...it, title } : it)),
                        })
                      }
                      placeholder="Objective"
                      ariaLabel="Objective title"
                      className="text-base font-semibold text-[var(--text-1)]"
                    />
                    <div className="mt-2">
                      <RichTextField
                        value={item.description}
                        onChange={(description) =>
                          onChange({
                            ...data,
                            items: items.map((it) =>
                              it.id === item.id ? { ...it, description } : it,
                            ),
                          })
                        }
                        placeholder="What it means…"
                        ariaLabel="Objective description"
                        className="text-sm leading-7 text-[var(--text-2)]"
                      />
                    </div>
                  </div>
                  <InlineRemoveButton
                    onClick={() => onChange({ ...data, items: items.filter((it) => it.id !== item.id) })}
                  />
                </div>
              </article>
            );
          })}
          <div className="md:col-span-2">
            <InlineAddButton
              label="Add objective"
              onClick={() =>
                onChange({
                  ...data,
                  items: [...items, { id: newObjectiveId(), title: "", description: "", icon: "" }],
                })
              }
            />
          </div>
        </div>
      );
    }
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
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
                  <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{renderLines(item.description, "obj")}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  },
});
