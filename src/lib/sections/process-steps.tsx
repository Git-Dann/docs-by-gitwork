/** Section type: `process_steps` — a numbered step / workflow flow (infographic-inspired). */

import { ArrowLongRightIcon } from "@heroicons/react/24/outline";
import { renderLines } from "@/lib/markdown";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { RichTextField } from "@/lib/sections/rich-text-lazy";
import { InlineTextArea, InlineAddButton, InlineRemoveButton } from "@/lib/sections/inline-text";
import { romanNumeral } from "@/lib/sections/variant-helpers";
import type { ProcessStepsSectionData } from "@/types/proposal";

const num = (i: number) => String(i + 1).padStart(2, "0");

export const processStepsSection = defineSection<ProcessStepsSectionData>({
  key: "process_steps",
  displayName: "Process steps",
  description: "A numbered workflow — connected pills, or stepped rows with roman numerals.",
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
  Editor: ({ data, onChange }) => {
    const style = data.style ?? "pills";
    return (
      <SimpleForm>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
          <select
            value={style}
            onChange={(e) => onChange({ ...data, style: e.target.value as ProcessStepsSectionData["style"] })}
            className="app-select w-full"
          >
            <option value="pills">Connected pills</option>
            <option value="stepped">Stepped rows (i. ii. iii.)</option>
          </select>
        </label>

        {style === "pills" ? (
          <>
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
          </>
        ) : null}

        <p className="text-xs leading-5 text-[var(--text-4)]">
          {style === "stepped"
            ? "Step titles and descriptions are edited inline on the canvas."
            : "Step labels and the intro are edited inline on the canvas."}
        </p>
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    const steps = data.steps ?? [];
    const arrows = data.arrows ?? true;
    const highlightLast = data.highlightLast ?? false;
    const layout = data.layout ?? "row";
    const style = data.style ?? "pills";
    const stepped = style === "stepped";

    if (editable && onChange) {
      const update = (i: number, patch: Partial<{ label: string; note: string; description: string }>) =>
        onChange({ ...data, steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
      return (
        <div className="space-y-3">
          <RichTextField
            value={data.intro ?? ""}
            onChange={(intro) => onChange({ ...data, intro })}
            placeholder="Intro (optional)"
            ariaLabel="Process intro"
            className="text-[13px] leading-6 text-[var(--text-3)]"
          />
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`group/row rounded-[10px] border border-[var(--border-2)] bg-white px-3 py-2 ${
                  stepped ? "flex items-start gap-3" : "flex items-center gap-3"
                }`}
              >
                <span
                  className={
                    stepped
                      ? "shrink-0 pt-1 font-[family-name:var(--font-display)] text-[15px] italic text-[var(--doc-accent,#4f5bd5)]"
                      : "font-mono text-[10px] font-semibold text-[var(--text-4)]"
                  }
                >
                  {stepped ? `${romanNumeral(i)}.` : num(i)}
                </span>
                <div className="min-w-0 flex-1">
                  <InlineTextArea
                    value={step.label}
                    onChange={(label) => update(i, { label })}
                    placeholder="Step"
                    ariaLabel={`Step ${i + 1}`}
                    className={
                      stepped
                        ? "font-[family-name:var(--font-display)] text-[17px] leading-tight text-[var(--text-1)]"
                        : "text-sm font-medium text-[var(--text-1)]"
                    }
                  />
                  {stepped ? (
                    <RichTextField
                      value={step.description ?? ""}
                      onChange={(description) => update(i, { description })}
                      placeholder="Description (optional)"
                      ariaLabel={`Step ${i + 1} description`}
                      className="mt-1 text-[13px] leading-6 text-[var(--text-3)]"
                    />
                  ) : null}
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

    // ── Stepped rows — serif-italic accent roman numeral in a gutter, serif title, muted line. ──
    if (stepped) {
      return (
        <div className="proposal-block-avoid space-y-4">
          {data.intro ? (
            <p className="text-[13px] leading-6 text-[var(--doc-ink-soft,#4b4a44)]">{data.intro}</p>
          ) : null}
          <div>
            {steps.map((step, i) => (
              <div
                key={i}
                className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 py-4 ${
                  i > 0 ? "border-t border-[var(--doc-line-soft,rgba(0,0,0,0.08))]" : ""
                }`}
              >
                <span
                  className="font-[family-name:var(--font-display)] text-[18px] italic leading-[1.5]"
                  style={{ color: "var(--doc-accent, #4f5bd5)" }}
                >
                  {romanNumeral(i)}.
                </span>
                <div className="min-w-0">
                  <p
                    className="font-[family-name:var(--font-display)] text-[19px] font-semibold leading-snug"
                    style={{ color: "var(--doc-ink, #1a1a17)" }}
                  >
                    {step.label}
                  </p>
                  {step.description ? (
                    <p className="mt-1.5 text-[13px] leading-6" style={{ color: "var(--doc-ink-soft, #4b4a44)" }}>
                      {renderLines(step.description, `step-${i}`)}
                    </p>
                  ) : null}
                  {step.note ? (
                    <p
                      className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: "var(--doc-muted, #8a867c)" }}
                    >
                      {step.note}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

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
