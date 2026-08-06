/**
 * What is on this cover — the elements you can turn on and off, and the detail strip you compose.
 *
 * ── The problem this solves ──────────────────────────────────────────────────────────────
 *
 * The cover had SIX optional elements governed by FIVE different rules, none of them stated:
 *
 *   Covers strip        implicit — hidden when the textarea is blank
 *   Contents list       an explicit toggle
 *   Parties row         implicit — appears when the `parties` (or `signatures`) BLOCK has data
 *   Executive summary   implicit — hidden when empty, and owned by the `introduction` block
 *   Detail strip        always on, and its rows hard-coded
 *   Branding & logos    behind a disclosure
 *
 * So an author could not tell what would be on the page without rendering it, and could not tell
 * whether something was OFF or merely UNFILLED. That is what "the cover edit doesn't feel
 * optimised" actually was.
 *
 * ⚠️ **Hidden and empty are separate here, deliberately.** `coverElementVisible` decides whether an
 * element is switched on; `coverElementEmpty` only says whether there is anything to draw. The
 * panel shows the second as a quiet hint ("on, nothing to show yet"). Collapsing the two — which is
 * what the old implicit rules did — is precisely the ambiguity being removed. A visible-but-empty
 * element still renders nothing on the page; no empty frames.
 *
 * The shape here — a registry of optional parts, a `defaultOn` per part, an explicit stored value
 * that always wins, and empty kept distinct from hidden — is the pattern a second block should
 * copy. It is deliberately NOT abstracted into a generic mechanism yet: one caller is not enough to
 * design one, and the second block that needs it should shape it.
 */

import type {
  CoverDetailRow,
  CoverDetailSource,
  CoverElementId,
  CoverSectionData,
  ProposalDocument,
} from "@/types/proposal";
import { coverContentsEntries } from "@/lib/sections/cover-contents";

/** Everything the resolvers need, gathered once by the caller. */
export interface CoverElementContext {
  documentType?: string;
  sections: ProposalDocument["sections"];
  /** The resolved lead paragraph (Introduction statement → document summary). */
  executiveSummary?: string;
  /** True when a `parties` or `signatures` block supplies at least one party. */
  hasParties: boolean;
  /** The resolved confidentiality sentence (workspace branding → the cover's own text). */
  confidentiality?: string;
}

export interface CoverElementDef {
  id: CoverElementId;
  label: string;
  /** What it puts on the page, in the author's language — shown under the toggle. */
  blurb: string;
  /** Which block actually owns the data, when it is not the cover. Surfaced in the panel so
   *  editing it from the cover reads as deliberate rather than magic. */
  ownedBy?: "parties" | "introduction";
  defaultOn: (ctx: CoverElementContext) => boolean;
  isEmpty: (data: CoverSectionData, ctx: CoverElementContext) => boolean;
}

const isProposal = (ctx: CoverElementContext) => ctx.documentType === "PROPOSAL";

export const COVER_ELEMENTS: CoverElementDef[] = [
  {
    id: "executiveSummary",
    label: "Executive summary",
    blurb: "The lead paragraph under the title.",
    ownedBy: "introduction",
    // Always on where there is one — it is the cover's only prose and was never optional before.
    defaultOn: () => true,
    isEmpty: (_data, ctx) => !ctx.executiveSummary?.trim(),
  },
  {
    id: "contents",
    label: "Contents list",
    blurb: "A numbered INSIDE list of the document's own blocks.",
    // A proposal is read front to back and wants navigating; a one-page NDA listing its own
    // clauses on the front is noise. (This is #547's `coverContentsEnabled`, moved here so there
    // is ONE place a cover element's default lives.)
    defaultOn: isProposal,
    isEmpty: (_data, ctx) => coverContentsEntries(ctx.sections).length === 0,
  },
  {
    id: "covers",
    label: "Covers strip",
    blurb: "A bordered one-line COVERS · … scope readout.",
    // Historically implicit: on iff filled in. Preserved as a default so no existing cover moves.
    defaultOn: () => true,
    isEmpty: (data) => (data.covers ?? []).every((item) => !(item ?? "").trim()),
  },
  {
    id: "parties",
    label: "Parties",
    blurb: "Who is bound — replaces the detail strip on a contract.",
    ownedBy: "parties",
    defaultOn: () => true,
    isEmpty: (_data, ctx) => !ctx.hasParties,
  },
  {
    id: "stats",
    label: "Stat tiles",
    blurb: "Sections · Phases · Touchpoints · Value.",
    // Lightweight docs get a clean cover rather than zeroed-out metrics — the existing rule.
    defaultOn: isProposal,
    isEmpty: () => false,
  },
  {
    id: "confidentiality",
    label: "Confidentiality note",
    blurb: "The classification sentence in the cover footer.",
    defaultOn: () => true,
    isEmpty: (_data, ctx) => !ctx.confidentiality?.trim(),
  },
];

export function coverElementDef(id: CoverElementId): CoverElementDef {
  const def = COVER_ELEMENTS.find((entry) => entry.id === id);
  if (!def) throw new Error(`Unknown cover element: ${id}`);
  return def;
}

/**
 * Is this element switched on?
 *
 * An explicit stored choice always wins, so turning something off sticks rather than being
 * re-applied by the default on the next render. Absent → the element's own default.
 *
 * ⚠️ `showContents` is read as a fallback for `elements.contents`. It was the #547 shape and some
 * documents were saved with it; dropping it would silently flip those covers back on.
 */
export function coverElementVisible(
  id: CoverElementId,
  data: CoverSectionData,
  ctx: CoverElementContext,
): boolean {
  const explicit = data.elements?.[id];
  if (typeof explicit === "boolean") return explicit;
  if (id === "contents" && typeof data.showContents === "boolean") return data.showContents;
  return coverElementDef(id).defaultOn(ctx);
}

/** Is there anything to draw? Never a visibility decision — see the header. */
export function coverElementEmpty(
  id: CoverElementId,
  data: CoverSectionData,
  ctx: CoverElementContext,
): boolean {
  return coverElementDef(id).isEmpty(data, ctx);
}

// ── The detail strip ────────────────────────────────────────────────────────────────────

export type { CoverDetailRow, CoverDetailSource, CoverElementId };

export const DETAIL_SOURCE_LABELS: Record<CoverDetailSource, string> = {
  client: "Client",
  preparedBy: "Prepared by",
  date: "Date",
  version: "Version",
  status: "Status",
  documentNumber: "Document no.",
};

/** The values the auto rows read from. Gathered by the caller, already formatted for display. */
export interface CoverDetailContext {
  client?: string;
  preparedBy?: string;
  date?: string;
  version?: string;
  status?: string;
  documentNumber?: string;
}

/**
 * ⚠️ The default strip — what every cover showed before it could be composed.
 *
 * `Client · Prepared by · Date · Version`, in this order. **This is a back-compat contract, not a
 * suggestion:** a document that has never had its strip edited must render byte-identically, and
 * that includes the thousands already sent to clients. Changing this list changes those covers.
 */
export const DEFAULT_DETAIL_ROWS: CoverDetailRow[] = [
  { kind: "auto", source: "client" },
  { kind: "auto", source: "preparedBy" },
  { kind: "auto", source: "date" },
  { kind: "auto", source: "version" },
];

/**
 * Rows → the `{ label, value }` pairs the cover renders.
 *
 * Empty rows are dropped, matching what the hard-coded strip did: it only pushed `Client` when
 * there was a client, and `Version` when there was a version. A row reading `PREPARED BY —` on a
 * client's front page is worse than no row at all.
 */
export function resolveCoverDetails(
  rows: CoverDetailRow[] | undefined,
  ctx: CoverDetailContext,
): { label: string; value: string }[] {
  return (rows ?? DEFAULT_DETAIL_ROWS)
    .map((row) =>
      row.kind === "custom"
        ? { label: row.label.trim(), value: row.value.trim() }
        : {
            label: (row.label ?? DETAIL_SOURCE_LABELS[row.source]).trim(),
            value: (ctx[row.source] ?? "").trim(),
          },
    )
    // A blank LABEL is allowed — a value-only row is a legitimate cover design. A blank VALUE is
    // not: there is nothing to say.
    .filter((row) => row.value.length > 0);
}
