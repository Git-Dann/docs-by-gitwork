/**
 * Section-preview dispatcher. Looks up the preview for each section via the registry. Sections
 * whose registry entry sets `renderShell: false` (currently only `cover`) opt out of the
 * standard "Section NN" heading + body wrapper and render at full bleed.
 *
 * The previous ~900-line file with one switch case per section is now replaced by a tiny
 * registry-driven dispatcher; each section's preview lives in `src/lib/sections/{key}.tsx`.
 */

"use client";

import type { ReactNode } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { getSectionType } from "@/lib/sections/registry";
import { InlineTextArea } from "@/lib/sections/inline-text";
import { renderInline } from "@/lib/markdown";
import type { DocumentType, ProposalDocument, ProposalSection } from "@/types/proposal";

/**
 * Contract-style documents carry house clause numbering, so their sections get an accent-mono
 * `01` / `02` gutter number. Proposals, reports, briefs, handovers and decks do NOT — they read as
 * editorial documents and a numbered section would be noise.
 */
const NUMBERED_DOC_TYPES = new Set<DocumentType>(["SLA", "SOW", "MSA", "NDA", "CO", "DSA"]);

/** Stable identity for a section, matching the selection id used elsewhere in this file. */
function sectionRef(section: ProposalSection): string {
  return section.id ?? section.key;
}

/**
 * The section's position among the VISIBLE, shell-rendered content sections, zero-padded to two
 * digits — derived from the sections array on every render, so there's no stored field to drift and
 * inserting or hiding a block renumbers the rest for free. Continuous across the whole document
 * (not per page). Returns null when this document type isn't numbered, or the section isn't counted
 * (the cover and any `renderShell: false` block — `heading`, `divider` — are skipped).
 */
function sectionNumber(proposal: ProposalDocument, section: ProposalSection): string | null {
  if (!NUMBERED_DOC_TYPES.has(proposal.documentType)) return null;
  const target = sectionRef(section);
  let ordinal = 0;
  for (const entry of proposal.sections) {
    if (!entry.isVisible) continue;
    if (getSectionType(entry.key)?.renderShell === false) continue;
    ordinal += 1;
    if (sectionRef(entry) === target) return String(ordinal).padStart(2, "0");
  }
  return null;
}

function Graphic({
  title,
  url,
  caption,
  altText,
}: {
  title: string;
  url: string;
  caption?: string;
  altText: string;
}) {
  return (
    <figure className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={altText} className="h-56 w-full object-cover" />
      <figcaption className="space-y-1 p-4">
        <p className="text-sm font-semibold text-[var(--text-2)]">{title}</p>
        {caption ? <p className="text-sm leading-6 text-[var(--text-3)]">{caption}</p> : null}
      </figcaption>
    </figure>
  );
}

export function ProposalSectionPreview({
  section,
  proposal,
  onSelectSection,
  editable,
  onChange,
  onMetaChange,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
  index: number;
  /** Editor-only: the currently-selected block's id. Absent on public view. */
  activeSectionId?: string | null;
  /** Editor-only: click a NON-inline block to open its inspector. Absent on public view. */
  onSelectSection?: (id: string) => void;
  /** Editor-only: canvas is in edit mode (text-first blocks render inline-editable fields). */
  editable?: boolean;
  /** Editor-only: write this block's data back to the draft (for inline editing). */
  onChange?: (next: ProposalSection["data"]) => void;
  /** Editor-only: write this block's own title/caption back to the draft. Available on EVERY
   *  shell-rendered block so its heading + caption are editable inline, not just its body. */
  onMetaChange?: (meta: { title?: string; description?: string }) => void;
}) {
  if (!section.isVisible) {
    return null;
  }

  const sectionType = getSectionType(section.key);
  if (!sectionType) {
    return null;
  }

  // Inline editing: text-first blocks render their text as editable fields directly on the canvas
  // (click in and type — no selection box, no drawer). Everything else stays static and, in the
  // editor, gets a subtle click-to-open-inspector affordance.
  const inlineEditing = Boolean(editable && sectionType.inlineEditable && onChange);
  const Preview = sectionType.Preview;
  const previewElement = (
    <Preview
      data={section.data}
      proposal={proposal}
      section={section}
      editable={inlineEditing}
      onChange={inlineEditing ? onChange : undefined}
    />
  );

  // In the editor every block gets a `data-canvas-block` wrapper (scroll-spy anchor). Content is
  // edited inline directly; non-content SETTINGS live behind a per-block hover "Options" button
  // that opens the docked Options panel. The block body itself is NOT a click target, so editing
  // inline text never accidentally pops a panel. All of this is skipped on the public/print view.
  const selectionId = section.id ?? section.key;
  const editorMode = Boolean(editable) || Boolean(onSelectSection);
  // The cover is edited inline (title/subtitle) with its settings always available in the outline
  // drill-in, so the floating canvas ✎ would be a redundant, dead-feeling control — skip it there.
  const showOptions =
    Boolean(onSelectSection) &&
    section.key !== "cover" &&
    (sectionType.hasOptions ?? !sectionType.inlineEditable);

  function wrapSelectable(content: ReactNode) {
    if (!editorMode) return content;
    return (
      <div
        data-canvas-block={selectionId}
        className="group/block relative scroll-mt-24 rounded-[10px]"
      >
        {showOptions ? (
          <button
            type="button"
            onClick={() => onSelectSection?.(selectionId)}
            aria-label={`Edit ${section.title} options`}
            title="Edit options"
            className="absolute -top-2.5 right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-white text-[var(--text-3)] opacity-0 shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:text-[var(--brand-700)] focus-visible:opacity-100 group-hover/block:opacity-100"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {content}
      </div>
    );
  }

  // Sections that render their own full-page layout (cover) opt out of the standard shell.
  if (sectionType.renderShell === false) {
    return wrapSelectable(previewElement);
  }

  const sectionId = `section-${section.id ?? section.key}`;
  const sectionAssets = proposal.assets.filter((asset) => asset.placement === section.key);
  const number = sectionNumber(proposal, section);

  const titleBlock =
    editable && onMetaChange ? (
      <>
        {/* Title + caption are editable inline on EVERY block (they live on the section, not
            its data) — so even blocks whose body isn't inline-editable can have their heading
            and caption changed straight on the canvas. */}
        <InlineTextArea
          value={section.title}
          onChange={(title) => onMetaChange({ title })}
          placeholder="Section title"
          ariaLabel="Section title"
          className="text-[24px] leading-[1.15] tracking-[-0.01em] text-[var(--doc-ink)] sm:text-[26px]"
        />
        <InlineTextArea
          value={section.description ?? ""}
          onChange={(description) => onMetaChange({ description })}
          placeholder="Caption (optional)"
          ariaLabel="Section caption"
          className="font-[var(--font-mono),'JetBrains_Mono',monospace] text-[10px] font-semibold uppercase leading-5 tracking-[0.12em] text-[var(--doc-muted)]"
        />
      </>
    ) : (
      <>
        <h2 className="text-[24px] leading-[1.15] tracking-[-0.01em] text-[var(--doc-ink)] sm:text-[26px]">
          {renderInline(section.title, `sec-title-${section.id ?? section.key}`)}
        </h2>
        {section.description ? (
          <p className="font-[var(--font-mono),'JetBrains_Mono',monospace] text-[10px] font-semibold uppercase leading-5 tracking-[0.12em] text-[var(--doc-muted)]">
            {renderInline(section.description, `sec-desc-${section.id ?? section.key}`)}
          </p>
        ) : null}
      </>
    );

  return wrapSelectable(
    <section id={sectionId} className="proposal-block-avoid space-y-4">
      <header className="max-w-3xl space-y-1.5">
        {number ? (
          // Contract numbering: accent mono in a fixed 3rem gutter (sized for two digits + space,
          // so 10/11/12 don't widen it), the title column `min-w-0` so long titles wrap under
          // themselves and never collide with the number.
          <div className="flex items-start">
            <span className="w-12 shrink-0 pt-1.5 font-[var(--font-mono),'JetBrains_Mono',monospace] text-[13px] font-medium leading-none tracking-[0.04em] text-[var(--doc-accent)]">
              {number}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">{titleBlock}</div>
          </div>
        ) : (
          titleBlock
        )}
      </header>

      {previewElement}

      {sectionAssets.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sectionAssets.map((asset) => (
            <Graphic
              key={asset.id ?? `${asset.title}-${asset.url}`}
              title={asset.title}
              url={asset.url}
              caption={asset.caption}
              altText={asset.altText}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
