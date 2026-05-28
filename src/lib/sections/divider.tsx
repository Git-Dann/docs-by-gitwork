/** Section type: `divider` — visual rule, spacer, or page break for print layout control. */

import { MinusIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import type { DividerSectionData } from "@/types/proposal";

const VARIANT_LABEL: Record<DividerSectionData["variant"], string> = {
  rule: "Horizontal rule",
  spacer: "Spacer",
  "page-break": "Page break",
};

const VARIANT_HINT: Record<DividerSectionData["variant"], string> = {
  rule: "A subtle hairline rule between sections.",
  spacer: "Empty whitespace — control with the spacing slider.",
  "page-break": "Forces the next section onto a new page when printed.",
};

export const dividerSection = defineSection<DividerSectionData>({
  key: "divider",
  displayName: "Divider",
  description: "Visual rule, spacer, or page break.",
  category: "structure",
  icon: MinusIcon,
  defaultData: { variant: "rule", spacing: 24 },
  defaultTitle: "Divider",
  defaultDescription: "Visual rule, spacer, or page break.",
  aiExpandable: false,
  // Divider has no body to render in a numbered section wrapper.
  renderShell: false,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Variant</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VARIANT_LABEL) as DividerSectionData["variant"][]).map((variant) => {
            const active = data.variant === variant;
            return (
              <button
                key={variant}
                type="button"
                onClick={() => onChange({ ...data, variant })}
                className={
                  active
                    ? "inline-flex items-center rounded-[6px] border-2 border-[var(--brand-500)] bg-[var(--surface-brand-soft)] px-3 py-2 text-sm font-medium text-[var(--brand-700)]"
                    : "inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)]"
                }
              >
                {VARIANT_LABEL[variant]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--text-4)]">{VARIANT_HINT[data.variant]}</p>
      </label>
      {data.variant === "spacer" ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Spacing (px)</span>
          <input
            type="range"
            min={8}
            max={120}
            step={8}
            value={data.spacing ?? 24}
            onChange={(e) => onChange({ ...data, spacing: Number(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-[var(--text-4)]">{data.spacing ?? 24}px gap</p>
        </label>
      ) : null}
    </SimpleForm>
  ),
  Preview: ({ data }) => {
    if (data.variant === "rule") {
      return <hr className="my-6 border-0 border-t border-[var(--border-2)]" />;
    }
    if (data.variant === "spacer") {
      return <div style={{ height: `${data.spacing ?? 24}px` }} aria-hidden="true" />;
    }
    // page-break: visible on screen as a subtle marker, breaks the page on print
    return (
      <div
        className="my-6 flex items-center gap-3"
        style={{ breakBefore: "page", pageBreakBefore: "always" }}
      >
        <div className="h-px flex-1 bg-[var(--border-2)]" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
          Page break
        </span>
        <div className="h-px flex-1 bg-[var(--border-2)]" />
      </div>
    );
  },
});
