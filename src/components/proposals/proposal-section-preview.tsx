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
import { getSectionType } from "@/lib/sections/registry";
import type { ProposalDocument, ProposalSection } from "@/types/proposal";

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
  index,
  activeSectionId,
  onSelectSection,
  editable,
  onChange,
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

  // In the editor every block gets a `data-canvas-block` wrapper so the outline can scroll-spy the
  // section in view. Non-inline blocks additionally become a quiet click-to-edit target that opens
  // the inspector. Both are skipped on the public/print view → that DOM stays byte-for-byte read-only.
  const selectionId = section.id ?? section.key;
  const editorMode = Boolean(editable) || Boolean(onSelectSection);
  const selectable = Boolean(onSelectSection) && !inlineEditing;
  const isActive = selectable && activeSectionId === selectionId;

  function wrapSelectable(content: ReactNode) {
    if (!editorMode) return content;
    if (!selectable) {
      // Inline-editable blocks: just the scroll-spy anchor — clicks fall through to the text fields.
      return (
        <div data-canvas-block={selectionId} className="scroll-mt-24">
          {content}
        </div>
      );
    }
    return (
      <div
        data-canvas-block={selectionId}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${section.title}`}
        onClick={() => onSelectSection?.(selectionId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectSection?.(selectionId);
          }
        }}
        className={`relative scroll-mt-24 cursor-pointer rounded-[10px] outline-none transition-colors ${
          isActive ? "bg-[var(--surface-brand)]/40" : "hover:bg-[var(--surface-1)]"
        }`}
      >
        {content}
      </div>
    );
  }

  // Sections that render their own full-page layout (cover) opt out of the standard shell.
  if (sectionType.renderShell === false) {
    return wrapSelectable(previewElement);
  }

  const sectionId = `section-${section.id ?? section.key}`;
  const sectionNumber = String(index + 1).padStart(2, "0");
  const sectionAssets = proposal.assets.filter((asset) => asset.placement === section.key);

  return wrapSelectable(
    <section
      id={sectionId}
      className="proposal-block-avoid space-y-6 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8"
    >
      <header className="max-w-3xl space-y-3">
        <p className="app-eyebrow">Section {sectionNumber}</p>
        <h2 className="text-[32px] font-semibold tracking-[-0.04em] text-[var(--text-1)] sm:text-[36px]">
          {section.title}
        </h2>
        {section.description ? (
          <p className="max-w-2xl text-sm leading-7 text-[var(--text-3)]">{section.description}</p>
        ) : null}
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
