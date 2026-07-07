/** Section type: `heading` — visual heading break, with an optional full-bleed navy banner. */

import { HashtagIcon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { InlineTextArea } from "@/lib/sections/inline-text";
import type { HeadingSectionData } from "@/types/proposal";

const SIZE_LABEL: Record<HeadingSectionData["level"], string> = {
  h1: "Page heading",
  h2: "Section heading",
  h3: "Subsection",
};

export const headingSection = defineSection<HeadingSectionData>({
  key: "heading",
  displayName: "Heading",
  description: "A visual heading break — plain, or a full-bleed navy banner.",
  category: "structure",
  icon: HashtagIcon,
  defaultData: { level: "h2", text: "New heading", style: "default" },
  defaultTitle: "Heading",
  defaultDescription: "Visual heading break.",
  // Universally useful — no recommendedFor, shows for all doc types.
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  // Heading already provides its own visual title — opt out of the standard wrapper so it
  // doesn't render as "Section NN — Heading" with the actual heading underneath.
  renderShell: false,
  Editor: ({ data, onChange }) => {
    const style = data.style ?? "default";
    return (
      <SimpleForm>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
          <select
            value={style}
            onChange={(event) => onChange({ ...data, style: event.target.value as HeadingSectionData["style"] })}
            className="app-select w-full"
          >
            <option value="default">Plain heading</option>
            <option value="banner">Navy banner</option>
          </select>
        </label>

        {style === "default" ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Level</span>
            <div className="flex flex-wrap gap-2">
              {(["h1", "h2", "h3"] as const).map((level) => {
                const active = data.level === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onChange({ ...data, level })}
                    className={
                      active
                        ? "inline-flex items-center rounded-[6px] border border-[var(--brand-500)] bg-[var(--surface-brand-soft)] px-3 py-2 text-sm font-medium text-[var(--brand-700)]"
                        : "inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--border-1)]"
                    }
                  >
                    {level.toUpperCase()} <span className="ml-2 text-[var(--text-4)]">{SIZE_LABEL[level]}</span>
                  </button>
                );
              })}
            </div>
          </label>
        ) : null}

        <p className="text-xs leading-5 text-[var(--text-4)]">
          {style === "banner"
            ? "The eyebrow, title and lead paragraph are edited inline on the canvas."
            : "The heading text and eyebrow are edited inline on the canvas."}
        </p>
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    const style = data.style ?? "default";

    // ── Navy banner — full-bleed dark band, mono eyebrow + serif title (accent period) + lead. ──
    if (style === "banner") {
      const serif = "var(--font-display), 'DM Serif Display', Georgia, serif";
      const cleanTitle = (data.text || "").replace(/\s*\.\s*$/, "");
      const band = {
        background: "linear-gradient(135deg, #14132b 0%, #0f172a 55%, #191740 100%)",
        borderRadius: 14,
        padding: "clamp(24px, 5vw, 44px)",
        color: "#fff",
      } as const;
      if (editable && onChange) {
        return (
          <div style={band} className="proposal-block-avoid">
            <InlineTextArea
              value={data.eyebrow ?? ""}
              onChange={(eyebrow) => onChange({ ...data, eyebrow })}
              placeholder="Eyebrow (optional)"
              ariaLabel="Banner eyebrow"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
            />
            <div className="mt-3">
              <InlineTextArea
                value={data.text}
                onChange={(text) => onChange({ ...data, text })}
                placeholder="Banner title"
                ariaLabel="Banner title"
                style={{ fontFamily: serif, fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#fff" }}
              />
            </div>
            <div className="mt-3 max-w-[62ch]">
              <InlineTextArea
                value={data.subtitle ?? ""}
                onChange={(subtitle) => onChange({ ...data, subtitle })}
                placeholder="Lead paragraph (optional)"
                ariaLabel="Banner lead"
                className="font-mono text-[13px] leading-7 text-white/70"
              />
            </div>
          </div>
        );
      }
      return (
        <div style={band} className="proposal-block-avoid">
          {data.eyebrow ? (
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              {data.eyebrow}
            </p>
          ) : null}
          <h2
            style={{ fontFamily: serif, fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#fff", margin: data.eyebrow ? "12px 0 0" : 0 }}
          >
            {cleanTitle}
            <span style={{ color: "#8b93f8" }}>.</span>
          </h2>
          {data.subtitle ? (
            <p className="mt-3 max-w-[62ch] font-mono text-[13px] leading-7 text-white/70">
              {data.subtitle}
            </p>
          ) : null}
        </div>
      );
    }

    // ── Plain heading ──
    const fontSize = data.level === "h1" ? 44 : data.level === "h2" ? 32 : 22;
    const headingStyle = {
      fontFamily: "var(--font-display), serif",
      fontSize,
      fontWeight: 400,
      letterSpacing: "-0.025em",
      lineHeight: 1.15,
      color: "var(--doc-ink, #0F172A)",
      margin: 0,
    };
    if (editable && onChange) {
      return (
        <div className="space-y-2">
          <InlineTextArea
            value={data.eyebrow ?? ""}
            onChange={(eyebrow) => onChange({ ...data, eyebrow })}
            placeholder="Eyebrow (optional)"
            ariaLabel="Heading eyebrow"
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
          />
          <InlineTextArea
            value={data.text}
            onChange={(text) => onChange({ ...data, text })}
            placeholder="Heading"
            ariaLabel="Heading text"
            style={headingStyle}
          />
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {data.eyebrow ? (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            {data.eyebrow}
          </p>
        ) : null}
        <h2 style={headingStyle}>{data.text}</h2>
      </div>
    );
  },
});
