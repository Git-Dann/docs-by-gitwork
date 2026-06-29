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
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
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

  // In the editor every block gets a `data-canvas-block` wrapper (scroll-spy anchor). Content is
  // edited inline directly; non-content SETTINGS live behind a per-block hover "Options" button
  // that opens the docked Options panel. The block body itself is NOT a click target, so editing
  // inline text never accidentally pops a panel. All of this is skipped on the public/print view.
  const selectionId = section.id ?? section.key;
  const editorMode = Boolean(editable) || Boolean(onSelectSection);
  const showOptions =
    Boolean(onSelectSection) && (sectionType.hasOptions ?? !sectionType.inlineEditable);
  const isActive = activeSectionId === selectionId;

  function wrapSelectable(content: ReactNode) {
    if (!editorMode) return content;
    return (
      <div
        data-canvas-block={selectionId}
        className={`group/block relative scroll-mt-24 rounded-[10px] transition-shadow ${
          isActive ? "shadow-[0_0_0_2px_var(--brand-600)]" : ""
        }`}
      >
        {showOptions ? (
          <button
            type="button"
            onClick={() => onSelectSection?.(selectionId)}
            aria-label={`Options for ${section.title}`}
            className="absolute -top-2 right-2 z-10 inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] opacity-0 shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:text-[var(--text-1)] focus-visible:opacity-100 group-hover/block:opacity-100"
          >
            <Cog6ToothIcon className="h-3 w-3" />
            Options
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
