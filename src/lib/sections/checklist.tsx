/**
 * Section type: `checklist` — polarity-aware list (INCLUDE → green ticks, EXCLUDE → red crosses).
 *
 * P4.16 consolidation block: replaces the visual job of `assumptions` and `out_of_scope`. We
 * keep the old blocks in the registry for backwards compatibility (existing docs continue to
 * render) but new templates can use `checklist` for either polarity by flipping a flag.
 */

import { CheckCircleIcon, XCircleIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { SimpleForm } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { InlineStringList, InlineTextArea } from "@/lib/sections/inline-text";
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
  inlineEditable: true,
  hasOptions: true,
  // Options = polarity only; the intro + items are edited inline on the canvas.
  Editor: ({ data, onChange }) => (
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
                    ? "whitespace-nowrap rounded-[6px] bg-[var(--success-50)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--success-500)]"
                    : "whitespace-nowrap rounded-[6px] bg-[var(--danger-50)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--danger-500)]"
                  : "whitespace-nowrap rounded-[6px] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)] hover:text-[var(--text-2)]"
              }
            >
              {p === "INCLUDE" ? "Ticks" : "Crosses"}
            </button>
          ))}
        </div>
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        The intro and items are edited inline on the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    const Icon = data.polarity === "INCLUDE" ? CheckCircleIcon : XCircleIcon;
    const iconColor = data.polarity === "INCLUDE" ? "var(--success-500)" : "var(--danger-500)";

    if (editable && onChange) {
      return (
        <div className="space-y-3">
          <InlineTextArea
            value={data.intro ?? ""}
            onChange={(intro) => onChange({ ...data, intro })}
            placeholder="Intro (optional)…"
            ariaLabel="Checklist intro"
            className="text-sm leading-7 text-[var(--text-2)]"
          />
          <InlineStringList
            items={data.items ?? []}
            onChange={(items) => onChange({ ...data, items })}
            marker={() => <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />}
            placeholder={data.polarity === "INCLUDE" ? "What's in scope" : "What's out of scope"}
            addLabel="Add item"
          />
        </div>
      );
    }

    const items = (data.items ?? []).filter((item) => item.trim().length > 0);
    if (items.length === 0) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          Empty checklist — add items in the editor.
        </p>
      );
    }
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
