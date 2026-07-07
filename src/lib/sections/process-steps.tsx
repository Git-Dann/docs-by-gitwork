/** Section type: `process_steps` — a numbered step / workflow flow (infographic-inspired). */

import { ArrowLongRightIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { InlineTextArea, InlineAddButton, InlineRemoveButton } from "@/lib/sections/inline-text";
import type { ProcessStepsSectionData } from "@/types/proposal";

const num = (i: number) => String(i + 1).padStart(2, "0");

export const processStepsSection = defineSection<ProcessStepsSectionData>({
  key: "process_steps",
  displayName: "Process steps",
  description: "A numbered workflow — steps as connected pills, with an optional highlighted finish.",
  category: "lists",
  icon: ArrowLongRightIcon,
  defaultData: {
    steps: [
      { label: "Development" },
      { label: "Developer testing" },
      { label: "Deploy to staging" },
      { label: "QA testing" },
      { label: "Deploy to production" },
    ],
    highlightLast: true,
    arrows: true,
    layout: "row",
  },
  defaultTitle: "Process",
  defaultDescription: "A step-by-step workflow.",
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Layout</span>
        <select
          value={data.layout ?? "row"}
          onChange={(e) => onChange({ ...data, layout: e.target.value as ProcessStepsSectionData["layout"] })}
          className="app-select w-full"
        >
          <option value="row">Flowing row of pills</option>
          <option value="stack">Vertical stack</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={data.arrows ?? true}
          onChange={(e) => onChange({ ...data, arrows: e.target.checked })}
          className="app-checkbox"
        />
        Show connecting arrows
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={data.highlightLast ?? false}
          onChange={(e) => onChange({ ...data, highlightLast: e.target.checked })}
          className="app-checkbox"
        />
        Highlight the final step
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        Step labels and the intro are edited inline on the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    const steps = data.steps ?? [];
    const arrows = data.arrows ?? true;
    const highlightLast = data.highlightLast ?? false;
    const layout = data.layout ?? "row";

    if (editable && onChange) {
      const update = (i: number, patch: Partial<{ label: string; note: string }>) =>
        onChange({ ...data, steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
      return (
        <div className="space-y-3">
          <InlineTextArea
            value={data.intro ?? ""}
            onChange={(intro) => onChange({ ...data, intro })}
            placeholder="Intro (optional)"
            ariaLabel="Process intro"
            className="text-[13px] leading-6 text-[var(--text-3)]"
          />
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="group/row flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2">
                <span className="font-mono text-[10px] font-semibold text-[var(--text-4)]">{num(i)}</span>
                <div className="flex-1">
                  <InlineTextArea
                    value={step.label}
                    onChange={(label) => update(i, { label })}
                    placeholder="Step"
                    ariaLabel={`Step ${i + 1}`}
                    className="text-sm font-medium text-[var(--text-1)]"
                  />
                </div>
                <InlineRemoveButton onClick={() => onChange({ ...data, steps: steps.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <InlineAddButton label="Add step" onClick={() => onChange({ ...data, steps: [...steps, { label: "" }] })} />
        </div>
      );
    }

    if (steps.length === 0) return null;

    const Pill = ({ i, last }: { i: number; last: boolean }) => {
      const step = steps[i];
      const active = highlightLast && last;
      return (
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5"
          style={
            active
              ? { background: "var(--doc-accent, #4f5bd5)", borderColor: "transparent", color: "#fff" }
              : { background: "var(--doc-panel, #f7f5ef)", borderColor: "var(--doc-line, rgba(0,0,0,0.14))" }
          }
        >
          <span className="font-mono text-[10px] font-semibold" style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--doc-muted, #8a867c)" }}>
            {num(i)}
          </span>
          <span className="text-sm font-medium" style={{ color: active ? "#fff" : "var(--doc-ink, #1a1a17)" }}>
            {step.label}
          </span>
          {step.note ? (
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--doc-muted, #8a867c)" }}>
              {step.note}
            </span>
          ) : null}
        </span>
      );
    };

    return (
      <div className="proposal-block-avoid space-y-4">
        {data.intro ? <p className="text-[13px] leading-6 text-[var(--doc-ink-soft,#4b4a44)]">{data.intro}</p> : null}
        {layout === "stack" ? (
          <div className="space-y-2">
            {steps.map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Pill i={i} last={i === steps.length - 1} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {steps.map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Pill i={i} last={i === steps.length - 1} />
                {arrows && i < steps.length - 1 ? (
                  <ArrowLongRightIcon className="h-4 w-4" style={{ color: "var(--doc-muted, #8a867c)" }} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
});
