/** Section type: `do_dont` — paired "do" (green ticks) / "don't" (red crosses) panels. */

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { InlineTextArea, InlineStringList } from "@/lib/sections/inline-text";
import type { DoDontSectionData } from "@/types/proposal";

export const doDontSection = defineSection<DoDontSectionData>({
  key: "do_dont",
  displayName: "Do / Don't",
  description: "Two panels — what to do (green ticks) beside what to avoid (red crosses).",
  category: "lists",
  icon: ShieldCheckIcon,
  defaultData: {
    doTitle: "Do",
    doItems: ["", "", ""],
    dontTitle: "Don't",
    dontItems: ["", "", ""],
    dontStyle: "dark",
  },
  defaultTitle: "Do / Don't",
  defaultDescription: "What to do beside what to avoid.",
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">&ldquo;Don&rsquo;t&rdquo; panel style</span>
        <select
          value={data.dontStyle ?? "dark"}
          onChange={(e) => onChange({ ...data, dontStyle: e.target.value as DoDontSectionData["dontStyle"] })}
          className="app-select w-full"
        >
          <option value="dark">Dark (navy)</option>
          <option value="light">Light</option>
        </select>
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        Titles, list items and the footnote are edited inline on the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    const dark = (data.dontStyle ?? "dark") === "dark";
    const doItems = data.doItems ?? [];
    const dontItems = data.dontItems ?? [];

    if (editable && onChange) {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <InlineTextArea
              value={data.doTitle ?? ""}
              onChange={(doTitle) => onChange({ ...data, doTitle })}
              placeholder="Do"
              ariaLabel="Do title"
              className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
            />
            <InlineStringList
              items={doItems}
              onChange={(doItems) => onChange({ ...data, doItems })}
              marker={() => <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" />}
              placeholder="What to do"
              addLabel="Add item"
            />
          </div>
          <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <InlineTextArea
              value={data.dontTitle ?? ""}
              onChange={(dontTitle) => onChange({ ...data, dontTitle })}
              placeholder="Don't"
              ariaLabel="Don't title"
              className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
            />
            <InlineStringList
              items={dontItems}
              onChange={(dontItems) => onChange({ ...data, dontItems })}
              marker={() => <XMarkIcon className="h-3.5 w-3.5 text-[var(--danger-500)]" />}
              placeholder="What to avoid"
              addLabel="Add item"
            />
            <div className="mt-3">
              <InlineTextArea
                value={data.footnote ?? ""}
                onChange={(footnote) => onChange({ ...data, footnote })}
                placeholder="Footnote (optional)"
                ariaLabel="Footnote"
                className="text-xs leading-6 text-[var(--text-4)]"
              />
            </div>
          </div>
        </div>
      );
    }

    const cleanDo = doItems.filter((i) => i.trim());
    const cleanDont = dontItems.filter((i) => i.trim());
    return (
      <div className="proposal-block-avoid grid gap-3 md:grid-cols-2">
        {/* Do */}
        <div className="rounded-[10px] border border-[var(--doc-line,rgba(0,0,0,0.14))] bg-[var(--doc-panel,#f7f5ef)] p-5">
          {data.doTitle ? (
            <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--doc-muted,#8a867c)]">
              {data.doTitle}
            </p>
          ) : null}
          <ul className="space-y-2.5">
            {cleanDo.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-6 text-[var(--doc-ink,#1a1a17)]">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-500)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Don't */}
        <div
          className="rounded-[10px] p-5"
          style={
            dark
              ? { background: "#191817", color: "#fff" }
              : { background: "var(--doc-panel, #f7f5ef)", border: "1px solid var(--doc-line, rgba(0,0,0,0.14))" }
          }
        >
          {data.dontTitle ? (
            <p
              className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: dark ? "rgba(255,255,255,0.5)" : "var(--doc-muted, #8a867c)" }}
            >
              {data.dontTitle}
            </p>
          ) : null}
          <ul className="space-y-2.5">
            {cleanDont.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-sm leading-6"
                style={{ color: dark ? "rgba(255,255,255,0.85)" : "var(--doc-ink, #1a1a17)" }}
              >
                <XMarkIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {data.footnote ? (
            <p
              className="mt-4 border-t pt-3 text-xs leading-6"
              style={{
                color: dark ? "rgba(255,255,255,0.55)" : "var(--doc-muted, #8a867c)",
                borderColor: dark ? "rgba(255,255,255,0.14)" : "var(--doc-line, rgba(0,0,0,0.14))",
              }}
            >
              {data.footnote}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
});
