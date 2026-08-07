/**
 * Section type: `cta_next_steps` — closing call-to-action.
 *
 * Two styles, chosen in Options: `default` (the original eyebrow + headline + body + the
 * proposal-level PRIMARY/SECONDARY `Cta` buttons) and `contact` — the MD's live proposal, which
 * closes with a named contact card, one full-width accent button, and a small-print legal line.
 */

import { ArrowRightCircleIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { CTAEditor } from "@/components/proposals/cta-editor";
import { buttonStyles } from "@/components/ui/button-styles";
import { defineSection } from "@/lib/sections/types";
import { asTrimmedText, FormInput, SimpleForm } from "@/lib/sections/_shared";
import { ItemCard, EditorSectionHeader, EmptyHint, makeMover } from "@/components/proposals/editor-primitives";
import { MarkdownField } from "@/components/proposals/markdown-field";
import { Markdown, safeUrl } from "@/lib/markdown";
import type { CtaSectionData } from "@/types/proposal";

export const ctaNextStepsSection = defineSection<CtaSectionData>({
  key: "cta_next_steps",
  displayName: "Next steps",
  description: "Closing CTA — action buttons, or a contact card with one accent button.",
  category: "closing",
  icon: ArrowRightCircleIcon,
  defaultData: { headline: "", body: "" },
  defaultTitle: "Next steps",
  defaultDescription: "Closing call to action.",
  recommendedFor: ["PROPOSAL"],
  aiExpandable: true,
  hasOptions: true,
  Editor: ({ data, onChange, proposal, onProposalChange }) => {
    const style = data.style ?? "default";
    const alsoOn = data.alsoOn ?? [];
    const moveAlsoOn = makeMover(alsoOn, (next) => onChange({ ...data, alsoOn: next }));
    const contact = data.contact ?? {};
    return (
      <div className="space-y-3">
        <SimpleForm>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
            <select
              value={style}
              onChange={(e) => onChange({ ...data, style: e.target.value as CtaSectionData["style"] })}
              className="app-select w-full"
            >
              <option value="default">Action buttons</option>
              <option value="contact">Contact card + accent button</option>
            </select>
          </label>

          <FormInput
            label="Section headline"
            value={data.headline}
            onChange={(headline) => onChange({ ...data, headline })}
          />
          <MarkdownField
            label="Body"
            value={data.body}
            onChange={(body) => onChange({ ...data, body })}
            rows={4}
          />

          {style === "contact" ? (
            <>
              <FormInput
                label="Contact name"
                value={contact.name ?? ""}
                onChange={(name) => onChange({ ...data, contact: { ...contact, name } })}
                placeholder="Leave blank to hide the card"
              />
              <FormInput
                label="Contact role"
                value={contact.role ?? ""}
                onChange={(role) => onChange({ ...data, contact: { ...contact, role } })}
              />
              <FormInput
                label="Contact email"
                value={contact.email ?? ""}
                onChange={(email) => onChange({ ...data, contact: { ...contact, email } })}
              />
              <FormInput
                label="Button label"
                value={data.buttonLabel ?? ""}
                onChange={(buttonLabel) => onChange({ ...data, buttonLabel })}
                placeholder="Falls back to the primary CTA"
              />
              <FormInput
                label="Button URL"
                value={data.buttonUrl ?? ""}
                onChange={(buttonUrl) => onChange({ ...data, buttonUrl })}
              />
              <MarkdownField
                label="Small print (optional)"
                value={data.legalNote ?? ""}
                onChange={(legalNote) => onChange({ ...data, legalNote })}
                rows={2}
              />
            </>
          ) : null}
        </SimpleForm>

        {style === "contact" ? (
          <div className="space-y-2">
            <EditorSectionHeader
              label="Also on this engagement"
              action={
                <button
                  type="button"
                  onClick={() => onChange({ ...data, alsoOn: [...alsoOn, { name: "" }] })}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
                >
                  Add person
                </button>
              }
            />
            {alsoOn.length === 0 ? (
              <EmptyHint>No one else listed — the secondary list is hidden.</EmptyHint>
            ) : (
              alsoOn.map((person, i) => (
                <ItemCard
                  key={i}
                  label={person.name || `Person ${i + 1}`}
                  ariaLabel={`person ${i + 1}`}
                  onMoveUp={() => moveAlsoOn(i, -1)}
                  onMoveDown={() => moveAlsoOn(i, 1)}
                  onDelete={() => onChange({ ...data, alsoOn: alsoOn.filter((_, j) => j !== i) })}
                >
                  <div className="grid gap-2 @[26rem]:grid-cols-2">
                    <FormInput
                      label="Name"
                      value={person.name}
                      onChange={(name) =>
                        onChange({ ...data, alsoOn: alsoOn.map((p, j) => (j === i ? { ...p, name } : p)) })
                      }
                    />
                    <FormInput
                      label="Role"
                      value={person.role ?? ""}
                      onChange={(role) =>
                        onChange({ ...data, alsoOn: alsoOn.map((p, j) => (j === i ? { ...p, role } : p)) })
                      }
                    />
                  </div>
                </ItemCard>
              ))
            )}
          </div>
        ) : (
          <CTAEditor ctas={proposal.ctas} onChange={(ctas) => onProposalChange({ ...proposal, ctas })} />
        )}
      </div>
    );
  },
  Preview: ({ data, proposal }) => {
    const primary = proposal.ctas.find((cta) => cta.role === "PRIMARY");
    const secondary = proposal.ctas.find((cta) => cta.role === "SECONDARY");

    // ── Contact card + one full-width accent button + optional small print. ──
    if ((data.style ?? "default") === "contact") {
      const contact = data.contact ?? {};
      const alsoOn = (data.alsoOn ?? []).filter((person) => asTrimmedText(person?.name));
      const buttonLabel = data.buttonLabel?.trim() || primary?.label;
      const buttonHref = safeUrl(data.buttonUrl?.trim() || primary?.destination || "") ?? "#";
      const mutedLabel = "font-mono text-[9px] font-semibold uppercase tracking-[0.18em]";
      return (
        <div className="proposal-block-avoid space-y-5">
          {data.headline ? (
            <p
              className="font-[family-name:var(--font-display)] text-[26px] leading-snug"
              style={{ color: "var(--doc-ink, #1a1a17)" }}
            >
              {data.headline}
            </p>
          ) : null}
          {data.body ? (
            // `Markdown` sets its own type scale ON the paragraph, so the size has to be applied to
            // the children — a size on the wrapper alone is silently ignored (which is why the small
            // print below rendered at body size the first time).
            <Markdown
              compact
              className="max-w-[62ch] space-y-3 [&>*]:text-[13px] [&>*]:leading-6 [&>*]:text-[var(--doc-ink-soft,#4b4a44)]"
            >
              {data.body}
            </Markdown>
          ) : null}

          {contact.name?.trim() ? (
            <div
              className="rounded-[10px] border p-5"
              style={{
                borderColor: "var(--doc-line, rgba(0,0,0,0.14))",
                background: "var(--doc-panel, #f7f5ef)",
              }}
            >
              <p className={mutedLabel} style={{ color: "var(--doc-muted, #8a867c)" }}>
                Your point of contact
              </p>
              <p
                className="mt-2.5 font-[family-name:var(--font-display)] text-[20px] leading-tight"
                style={{ color: "var(--doc-ink, #1a1a17)" }}
              >
                {contact.name}
              </p>
              {contact.role ? (
                <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--doc-ink-soft, #4b4a44)" }}>
                  {contact.role}
                </p>
              ) : null}
              {contact.email ? (
                <p className="mt-1 font-mono text-[12px]" style={{ color: "var(--doc-accent, #4f5bd5)" }}>
                  {contact.email}
                </p>
              ) : null}

              {alsoOn.length > 0 ? (
                <div
                  className="mt-4 border-t pt-3"
                  style={{ borderColor: "var(--doc-line-soft, rgba(0,0,0,0.08))" }}
                >
                  <p className={mutedLabel} style={{ color: "var(--doc-muted, #8a867c)" }}>
                    Also on this engagement
                  </p>
                  <ul className="mt-2 space-y-1">
                    {alsoOn.map((person, i) => (
                      <li key={i} className="text-[13px] leading-6" style={{ color: "var(--doc-ink-soft, #4b4a44)" }}>
                        <span style={{ color: "var(--doc-ink, #1a1a17)" }}>{person.name}</span>
                        {person.role ? ` — ${person.role}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {buttonLabel ? (
            <a
              href={buttonHref}
              rel="noopener noreferrer nofollow"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
              style={{ background: "var(--doc-accent, #4f5bd5)", color: "#fff" }}
            >
              {buttonLabel}
              <ArrowRightIcon className="h-4 w-4" aria-hidden />
            </a>
          ) : null}

          {data.legalNote ? (
            <Markdown
              compact
              className="max-w-[80ch] space-y-2 [&>*]:text-[11px] [&>*]:leading-5 [&>*]:text-[var(--doc-muted,#8a867c)]"
            >
              {data.legalNote}
            </Markdown>
          ) : null}
        </div>
      );
    }

    return (
      <div className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-brand-soft)_100%)] p-6">
        <p className="app-eyebrow">Next Step</p>
        <p className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
          {data.headline}
        </p>
        <Markdown className="mt-3 max-w-3xl space-y-3 text-sm leading-7 text-[var(--text-2)]">
          {data.body}
        </Markdown>
        <div className="mt-5 flex flex-wrap gap-2">
          {primary ? (
            <a href={safeUrl(primary.destination) ?? "#"} rel="noopener noreferrer nofollow" className={buttonStyles({ variant: "primary", size: "md" })}>
              {primary.label}
            </a>
          ) : null}
          {secondary ? (
            <a href={safeUrl(secondary.destination) ?? "#"} rel="noopener noreferrer nofollow" className={buttonStyles({ variant: "secondary", size: "md" })}>
              {secondary.label}
            </a>
          ) : null}
        </div>
      </div>
    );
  },
});
