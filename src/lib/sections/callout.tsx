/** Section type: `callout` — highlighted note (info / warning / success / danger / neutral). */

import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { InlineTextArea } from "@/lib/sections/inline-text";
import type { CalloutSectionData } from "@/types/proposal";

const TONE_PALETTE: Record<CalloutSectionData["tone"], { border: string; bg: string; eyebrow: string }> = {
  info:     { border: "var(--brand-700)",   bg: "var(--brand-200)",  eyebrow: "var(--brand-700)" },
  warning:  { border: "#D97706",            bg: "#FEF3C7",           eyebrow: "#92400E" },
  success:  { border: "var(--success-500)", bg: "var(--success-50)", eyebrow: "var(--success-500)" },
  danger:   { border: "var(--danger-500)",  bg: "var(--danger-50)",  eyebrow: "var(--danger-500)" },
  neutral:  { border: "var(--text-3)",      bg: "var(--surface-1)",  eyebrow: "var(--text-4)" },
};

const TONE_LABEL: Record<CalloutSectionData["tone"], string> = {
  info: "Info",
  warning: "Warning",
  success: "Success",
  danger: "Danger",
  neutral: "Neutral",
};

export const calloutSection = defineSection<CalloutSectionData>({
  key: "callout",
  displayName: "Callout",
  description: "A highlighted note. Useful for important reminders or asides.",
  category: "narrative",
  icon: InformationCircleIcon,
  defaultData: { tone: "info", headline: "", body: "" },
  defaultTitle: "Callout",
  defaultDescription: "A highlighted note.",
  aiExpandable: true,
  inlineEditable: true,
  hasOptions: true,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Tone</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TONE_PALETTE) as CalloutSectionData["tone"][]).map((tone) => {
            const active = data.tone === tone;
            const palette = TONE_PALETTE[tone];
            return (
              <button
                key={tone}
                type="button"
                onClick={() => onChange({ ...data, tone })}
                className={
                  active
                    ? "inline-flex items-center rounded-[6px] px-3 py-2 text-sm font-medium"
                    : "inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)]"
                }
                style={active ? { background: palette.bg, color: palette.eyebrow, borderColor: palette.border, borderWidth: 2, borderStyle: "solid" } : undefined}
              >
                {TONE_LABEL[tone]}
              </button>
            );
          })}
        </div>
      </label>
      <p className="text-xs leading-5 text-[var(--text-4)]">
        The headline and body are edited inline on the canvas.
      </p>
    </SimpleForm>
  ),
  Preview: ({ data, editable, onChange }) => {
    const palette = TONE_PALETTE[data.tone];
    if (editable && onChange) {
      return (
        <div
          className="proposal-block-avoid rounded-[10px] px-5 py-4"
          style={{ background: palette.bg, borderLeft: `3px solid ${palette.border}` }}
        >
          <InlineTextArea
            value={data.headline ?? ""}
            onChange={(headline) => onChange({ ...data, headline })}
            placeholder="Headline (optional)"
            ariaLabel="Callout headline"
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: palette.eyebrow }}
          />
          <div className="mt-2">
            <InlineTextArea
              value={data.body}
              onChange={(body) => onChange({ ...data, body })}
              placeholder="Callout body…"
              ariaLabel="Callout body"
              className="text-sm leading-7 text-[var(--text-1)]"
            />
          </div>
        </div>
      );
    }
    return (
      <div
        className="proposal-block-avoid rounded-[10px] px-5 py-4"
        style={{ background: palette.bg, borderLeft: `3px solid ${palette.border}` }}
      >
        {data.headline ? (
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: palette.eyebrow }}
          >
            {data.headline}
          </p>
        ) : null}
        <p
          className={`text-sm leading-7 text-[var(--text-1)] ${data.headline ? "mt-2" : ""}`}
        >
          {data.body || <span className="italic text-[var(--text-4)]">Empty callout — add a body in the editor.</span>}
        </p>
      </div>
    );
  },
});
