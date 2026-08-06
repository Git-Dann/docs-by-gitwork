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
import { PencilSquareIcon, PlusIcon } from "@heroicons/react/24/outline";
import { getSectionType } from "@/lib/sections/registry";
import { InlineTextArea } from "@/lib/sections/inline-text";
import { resolveSectionNumber } from "@/lib/sections/section-number";
import { renderInline } from "@/lib/markdown";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

/**
 * The accent-mono `01` gutter number beside a section title. The rule itself (clause-authored when
 * the document is clause-numbered, positional otherwise) lives in the pure, unit-tested
 * `@/lib/sections/section-number`; all this does is hand it the registry's shell-render answer,
 * which that module deliberately doesn't import.
 */
function sectionNumber(proposal: ProposalDocument, section: ProposalSection): string | null {
  return resolveSectionNumber({
    documentType: proposal.documentType,
    sections: proposal.sections,
    section,
    isShellRendered: (entry) => getSectionType(entry.key)?.renderShell !== false,
  });
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
  onInsertAfter,
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
  /**
   * Editor-only: add a block directly after this one, from the page.
   *
   * ⚠️ Takes the section's ID, not its index, and that is deliberate — it mirrors
   * `onSelectSection` for the same reason. `PagedDocument` renders blocks inside a per-page
   * `map`, so the `index` prop here is the block's position ON ITS PAGE: block 1 of page 3 has
   * index 0. Handing that to `handleAddSection` would insert at the top of the document. Passing
   * the id lets the editor layout — which owns the ordered list — resolve the real position, so
   * the mistake is not available to make.
   */
  onInsertAfter?: (id: string) => void;
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
        {onInsertAfter ? (
          /* Sits in the 32px gap below the block (`space-y-8`), so it reads as "insert HERE"
             rather than as another control belonging to this block. Same hover/opacity grammar
             as the ✎ above — appears on hover, stays on keyboard focus. */
          <button
            type="button"
            onClick={() => onInsertAfter(selectionId)}
            aria-label={`Add a block after ${section.title}`}
            title="Add a block here"
            className="absolute -bottom-4 left-1/2 z-10 inline-flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-white text-[var(--text-3)] opacity-0 shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:text-[var(--brand-700)] focus-visible:opacity-100 group-hover/block:opacity-100"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
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
        {/* The caption is an OVERLINE — above the title, not under it. Mono small-caps under a
            display serif reads as a stranded subtitle; above it, it does the job the section
            number does elsewhere in the house style and hierarchy reads top-to-bottom. */}
        <InlineTextArea
          value={section.description ?? ""}
          onChange={(description) => onMetaChange({ description })}
          placeholder="Caption (optional)"
          ariaLabel="Section caption"
          className="font-mono text-[10px] font-semibold uppercase leading-5 tracking-[0.12em] text-[var(--doc-muted)]"
        />
        {/* `doc-serif` is required on the EDITABLE title: a <textarea> doesn't inherit font-family,
            so without it the inline editor showed sans while the read-only render was serif. */}
        <InlineTextArea
          value={section.title}
          onChange={(title) => onMetaChange({ title })}
          placeholder="Section title"
          ariaLabel="Section title"
          className="doc-serif text-[24px] leading-[1.3] tracking-[-0.01em] text-[var(--doc-ink)] sm:text-[26px]"
        />
      </>
    ) : (
      <>
        {/* Overline first — see the note on the editable branch above. */}
        {section.description ? (
          <p className="font-mono text-[10px] font-semibold uppercase leading-5 tracking-[0.12em] text-[var(--doc-muted)]">
            {renderInline(section.description, `sec-desc-${section.id ?? section.key}`)}
          </p>
        ) : null}
        {/* leading-[1.3] (not 1.15) so serif descenders — the g/y/p in a title — aren't clipped. */}
        <h2 className="doc-serif text-[24px] leading-[1.3] tracking-[-0.01em] text-[var(--doc-ink)] sm:text-[26px]">
          {renderInline(section.title, `sec-title-${section.id ?? section.key}`)}
        </h2>
      </>
    );

  return wrapSelectable(
    <section id={sectionId} className="proposal-block-avoid space-y-4">
      <header className="max-w-3xl space-y-1.5">
        {number ? (
          // The number is an OVERLINE above the title (`01 · PARTIES`), not a left gutter — this
          // is the Gitwork reference's section header, where hierarchy reads top-to-bottom:
          // mono accent overline, then the bold display title, then the caption.
          //
          // The gutter it replaced put the number in a fixed 3rem column beside the title, which
          // is a table-of-contents idiom, not a section header: it indented every heading away
          // from the text column below it, so nothing on the page shared a left edge.
          <>
            <p className="font-[var(--font-mono),'JetBrains_Mono',monospace] text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-[var(--doc-accent)]">
              {number}
              <span aria-hidden="true"> · </span>
              {section.title}
            </p>
            {titleBlock}
          </>
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
