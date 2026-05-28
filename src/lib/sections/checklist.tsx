/**
 * Section type: `checklist` — polarity-aware list (INCLUDE → green ticks, EXCLUDE → red crosses).
 *
 * P4.16 consolidation block: replaces the visual job of `assumptions` and `out_of_scope`. We
 * keep the old blocks in the registry for backwards compatibility (existing docs continue to
 * render) but new templates can use `checklist` for either polarity by flipping a flag.
 */

import { PlusIcon, TrashIcon, CheckCircleIcon, XCircleIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormTextArea } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import type { ChecklistSectionData } from "@/types/proposal";

export const checklistSection = defineSection<ChecklistSectionData>({
  key: "checklist",
  displayName: "Checklist",
  description: "Polarity-aware list — green ticks for inclusions or red crosses for exclusions.",
  category: "lists",
  icon: ClipboardDocumentCheckIcon,
  defaultData: { polarity: "INCLUDE", intro: "", items: [""] },
  defaultTitle: "What's included",
  defaultDescription: "Tick / cross list of inclusions or exclusions.",
  recommendedFor: ["PROPOSAL", "SOW", "SLA", "MSA"],
  aiExpandable: true,
  Editor: ({ data, onChange }) => {
    const items = data.items ?? [];

    function update(index: number, value: string) {
      onChange({ ...data, items: items.map((item, i) => (i === index ? value : item)) });
    }
    function add() {
      onChange({ ...data, items: [...items, ""] });
    }
    function remove(index: number) {
      if (items.length <= 1) return;
      onChange({ ...data, items: items.filter((_, i) => i !== index) });
    }

    return (
      <SimpleForm>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Polarity</span>
          <div className="inline-flex rounded-[8px] border border-[var(--border-2)] bg-white p-0.5">
            {(["INCLUDE", "EXCLUDE"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ ...data, polarity: p })}
                className={
                  data.polarity === p
                    ? p === "INCLUDE"
                      ? "rounded-[6px] bg-[var(--success-50)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--success-500)]"
                      : "rounded-[6px] bg-[var(--danger-50)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--danger-500)]"
                    : "rounded-[6px] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] hover:text-[var(--text-2)]"
                }
              >
                {p === "INCLUDE" ? "Include / ticks" : "Exclude / crosses"}
              </button>
            ))}
          </div>
        </label>

        <FormTextArea
          label="Intro (optional)"
          value={data.intro ?? ""}
          onChange={(intro) => onChange({ ...data, intro })}
          rows={2}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-2)]">Items</span>
            <button
              type="button"
              onClick={add}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add item
            </button>
          </div>
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={item}
                  onChange={(e) => update(i, e.target.value)}
                  className="app-input text-sm"
                  placeholder={data.polarity === "INCLUDE" ? "What's in scope" : "What's out of scope"}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={items.length <= 1}
                  aria-label="Remove item"
                  className="text-rose-600 hover:text-rose-700 disabled:opacity-30"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </SimpleForm>
    );
  },
  Preview: ({ data }) => {
    const items = (data.items ?? []).filter((item) => item.trim().length > 0);
    if (items.length === 0) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          Empty checklist — add items in the editor.
        </p>
      );
    }
    const Icon = data.polarity === "INCLUDE" ? CheckCircleIcon : XCircleIcon;
    const iconColor = data.polarity === "INCLUDE" ? "var(--success-500)" : "var(--danger-500)";

    return (
      <div className="proposal-block-avoid space-y-3">
        {data.intro ? <p className="text-sm leading-7 text-[var(--text-2)]">{data.intro}</p> : null}
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-7 text-[var(--text-2)]">
              <Icon className="mt-1 h-4 w-4 shrink-0" style={{ color: iconColor }} />
              <span className="flex-1">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  },
});
