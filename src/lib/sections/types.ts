/**
 * Section type registry — the canonical shape every section type implements.
 *
 * Before this refactor, adding a new section type required edits in three places:
 *   - `src/types/proposal.ts` (data shape + SectionKey union)
 *   - `src/components/proposals/proposal-section-editor.tsx` (switch case)
 *   - `src/components/proposals/proposal-section-preview.tsx` (switch case)
 *
 * After this refactor, adding a new section type is:
 *   - Add the data shape + SectionKey union entry in `types/proposal.ts` (unchanged)
 *   - Create `src/lib/sections/{key}.tsx` exporting an `SectionType` (this file's interface)
 *   - Register it in `src/lib/sections/registry.ts`
 *
 * The dispatcher in section-editor.tsx + section-preview.tsx becomes a single registry lookup.
 *
 * **Why this shape?**
 *   - `data` + `onChange` is the simplest case (introduction, exclusions, term).
 *   - `proposal` + `onProposalChange` is the escape hatch for sections that mutate sibling
 *     collections (timeline phases, cost line items) or read other sections (cover reading
 *     introduction for executive summary, signoff_footer reading workspace branding).
 *
 * Editors should prefer `onChange` (own data) over `onProposalChange` (whole proposal). Use the
 * proposal-level callback only for cross-section edits.
 */

import type { ComponentType, ReactNode } from "react";
import type { DocumentType, ProposalDocument, ProposalSection, ProposalSectionData, SectionKey } from "@/types/proposal";

/**
 * Block taxonomy used by the slide-in palette to group related blocks together. Each section
 * type declares one category — the palette renders one collapsible group per category.
 */
export type SectionCategory =
  | "structure"   // cover, headings, dividers, spacers — defines doc shape
  | "narrative"   // intro, product overview, prose, callouts — long-form writing
  | "lists"       // objectives, touchpoints, assumptions, exclusions — repeating items
  | "tables"      // service tiers, response times, penalties, costing — tabular data
  | "people"      // parties, signatures, signoff — counterparties + signers
  | "commercials" // costing, timeline — money + dates
  | "closing"     // CTA, supporting links, signatures — end-of-doc
  | "media";      // images, supporting links — visual content

export const SECTION_CATEGORIES: Array<{ key: SectionCategory; label: string; hint: string }> = [
  { key: "structure",   label: "Structure",   hint: "Cover, headings, dividers" },
  { key: "narrative",   label: "Narrative",   hint: "Long-form writing and prose" },
  { key: "lists",       label: "Lists",       hint: "Repeating items, checklists" },
  { key: "tables",      label: "Tables",      hint: "Structured tabular data" },
  { key: "people",      label: "People",      hint: "Parties, signatures, sign-off" },
  { key: "commercials", label: "Commercials", hint: "Pricing and timeline" },
  { key: "media",       label: "Media",       hint: "Images and links" },
  { key: "closing",     label: "Closing",     hint: "Calls to action and footers" },
];

export interface SectionEditorProps<TData = ProposalSectionData> {
  data: TData;
  /** Update just this section's data. Wraps the proposal-level callback so editors don't need
   *  to know their own index in the section array. */
  onChange: (next: TData) => void;
  /** Full proposal — used by editors that need to read sibling sections (e.g. cover reading
   *  introduction for an executive-summary preview). */
  proposal: ProposalDocument;
  /** Section index — used by editors that need to know their position (e.g. drag-reorder). */
  sectionIndex: number;
  /** Escape hatch for mutating the whole proposal (e.g. timeline section editing the parallel
   *  timelinePhases collection). Use sparingly. */
  onProposalChange: (next: ProposalDocument) => void;
}

export interface SectionPreviewProps<TData = ProposalSectionData> {
  data: TData;
  proposal: ProposalDocument;
  section: ProposalSection;
  /**
   * Editor-only: when true, the Preview renders its text as inline editable fields (click into
   * the doc and type) instead of static text. Omitted on the public/print views → read-only.
   * Only blocks marked `inlineEditable` in the registry receive this.
   */
  editable?: boolean;
  /** Editor-only: write this block's data back to the draft (paired with `editable`). */
  onChange?: (next: TData) => void;
}

/**
 * Optional builder-panel "header action" — e.g. the "Add objective" button that the touchpoints
 * editor surfaces in the panel header. Renders inside the Builder panel's `headerAction` slot.
 */
export interface SectionHeaderActionProps<TData = ProposalSectionData> {
  data: TData;
  onChange: (next: TData) => void;
  proposal: ProposalDocument;
  onProposalChange: (next: ProposalDocument) => void;
}

export interface SectionType<TData = ProposalSectionData> {
  /** Stable key matching the SectionKey union and Prisma DocumentSection.key. */
  key: SectionKey;
  /** Human label for picker UI and the builder panel title. */
  displayName: string;
  /** Short description shown under the section in the builder panel + add menu. */
  description: string;
  /** Category for grouping in the slide-in palette. */
  category: SectionCategory;
  /**
   * Heroicons component used as the block's icon in the outline + palette. Stored as the
   * component itself so the palette can render at any size; we use heroicons throughout the
   * platform so they're already in the bundle.
   */
  icon: ComponentType<{ className?: string }>;
  /**
   * Document types where this block is recommended (shown at the top of the palette). All
   * blocks are still available under "All blocks" regardless. Omit for "universal" blocks
   * that suit every document type.
   */
  recommendedFor?: DocumentType[];
  /** Whether this section is prose-heavy enough to benefit from "Expand with AI". */
  aiExpandable?: boolean;
  /**
   * Whether this block's Preview supports inline canvas editing (renders its text as editable
   * fields when passed `editable`). Text-first blocks (heading, prose, callout, introduction,
   * cover) set this; structured blocks (costing, timeline…) leave it off and edit via the
   * inspector instead.
   */
  inlineEditable?: boolean;
  /** Default data shape used when the palette inserts a fresh instance. */
  defaultData: TData;
  /** Default visibility when inserted. Almost always true; cover defaults to true too. */
  defaultVisible?: boolean;
  /** Default title shown in the outline when first inserted. Used by the palette. */
  defaultTitle: string;
  /** Default description used for the section card under its title. */
  defaultDescription?: string;
  /** The Builder-panel editor for this section type. */
  Editor: ComponentType<SectionEditorProps<TData>>;
  /** The print/preview render for this section type. */
  Preview: ComponentType<SectionPreviewProps<TData>>;
  /** Optional header-action slot (e.g. "Add row" buttons that live in the panel header). */
  HeaderAction?: ComponentType<SectionHeaderActionProps<TData>>;
  /**
   * Optional override for the section's visual rendering inside the proposal preview. Most
   * section types accept the default wrapper (numbered eyebrow + h2 title + body); the `cover`
   * type returns its own full-page DocumentCover so it opts out via `renderShell: false`.
   */
  renderShell?: boolean;
}

/** Helper so registry consumers can wrap typed editors without losing their data type. */
export function defineSection<TData extends ProposalSectionData>(
  spec: SectionType<TData>,
): SectionType<ProposalSectionData> {
  return spec as unknown as SectionType<ProposalSectionData>;
}

/** Re-export ReactNode for consumers that need to type optional renderShell wrappers. */
export type { ReactNode };
