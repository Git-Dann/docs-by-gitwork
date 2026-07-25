/**
 * Document template registry.
 *
 * Maps a {@link DocumentType} to its default section blueprints. Used by the create endpoint and
 * by `ensureBaseRecords` (bootstrap) to seed DocumentTemplate rows.
 *
 * Adding a new doc type:
 *   1. Add the value to the `DocumentType` enum in prisma/schema.prisma + run db push
 *   2. Add a TYPE_PREFIX entry in `src/server/documents.ts`
 *   3. Create `src/lib/templates/{type}.ts` with the section blueprints
 *   4. Add an entry in TEMPLATES_BY_TYPE below
 */

import type { DocumentType } from "@prisma/client";
import type { ProposalMetadata } from "@/types/proposal";
import {
  proposalSectionBlueprints,
  type SectionBlueprint,
} from "@/lib/default-template";
import { briefSectionBlueprints } from "@/lib/templates/brief";
import { deckSectionBlueprints } from "@/lib/templates/deck";
import { coSectionBlueprints } from "@/lib/templates/co";
import { dsaSectionBlueprints } from "@/lib/templates/dsa";
import { handoverSectionBlueprints } from "@/lib/templates/handover";
import { msaSectionBlueprints } from "@/lib/templates/msa";
import { ndaSectionBlueprints } from "@/lib/templates/nda";
import { otherSectionBlueprints } from "@/lib/templates/other";
import { reportSectionBlueprints } from "@/lib/templates/report";
import { slaSectionBlueprints } from "@/lib/templates/sla";
import { sowSectionBlueprints } from "@/lib/templates/sow";

export const TEMPLATES_BY_TYPE: Record<DocumentType, SectionBlueprint[]> = {
  PROPOSAL: proposalSectionBlueprints,
  SLA: slaSectionBlueprints,
  SOW: sowSectionBlueprints,
  MSA: msaSectionBlueprints,
  NDA: ndaSectionBlueprints,
  CO: coSectionBlueprints,
  DSA: dsaSectionBlueprints,
  HANDOVER: handoverSectionBlueprints,
  REPORT: reportSectionBlueprints,
  BRIEF: briefSectionBlueprints,
  DECK: deckSectionBlueprints,
  OTHER: otherSectionBlueprints,
};

export function getTemplateBlueprintsForType(type: DocumentType): SectionBlueprint[] {
  return TEMPLATES_BY_TYPE[type] ?? proposalSectionBlueprints;
}

/**
 * Per-type behaviour config.
 *  - `usesApprovalTrack` — whether the internal review track (Product / Tech / MD sign-off) applies
 *    by default. Proposals and contracts keep it; the lightweight everyday docs skip it. A
 *    per-document `metadata.approvalTrackEnabled` overrides this.
 *  - `adminOnly` — whether this is an admin/staff document type. Developers (without the
 *    `docs.viewAdminTypes` permission) never see, open, or create these; they get the lightweight
 *    types only. Enforced server-side (see allowedDocTypesForUser) and reflected in the UI.
 */
export const DOC_TYPE_CONFIG: Record<DocumentType, { usesApprovalTrack: boolean; adminOnly: boolean }> = {
  PROPOSAL: { usesApprovalTrack: true, adminOnly: true },
  SLA: { usesApprovalTrack: true, adminOnly: true },
  SOW: { usesApprovalTrack: true, adminOnly: true },
  MSA: { usesApprovalTrack: true, adminOnly: true },
  NDA: { usesApprovalTrack: true, adminOnly: true },
  CO: { usesApprovalTrack: true, adminOnly: true },
  DSA: { usesApprovalTrack: true, adminOnly: true },
  HANDOVER: { usesApprovalTrack: false, adminOnly: false },
  REPORT: { usesApprovalTrack: false, adminOnly: false },
  BRIEF: { usesApprovalTrack: false, adminOnly: false },
  // A deck has no sections and no sign-off track — its content is the slides.
  DECK: { usesApprovalTrack: false, adminOnly: false },
  OTHER: { usesApprovalTrack: false, adminOnly: false },
};

const ALL_DOC_TYPES = Object.keys(DOC_TYPE_CONFIG) as DocumentType[];

/** Document types any role (incl. developers) may see/create. */
export const LIGHTWEIGHT_DOC_TYPES: DocumentType[] = ALL_DOC_TYPES.filter(
  (type) => !DOC_TYPE_CONFIG[type].adminOnly,
);

/** Admin/staff-only document types (proposals + contracts). */
export const ADMIN_DOC_TYPES: DocumentType[] = ALL_DOC_TYPES.filter(
  (type) => DOC_TYPE_CONFIG[type].adminOnly,
);

/**
 * The document types a viewer may access. `canViewAdminTypes` (Super Admin, or the
 * `docs.viewAdminTypes` permission) → all types; otherwise the lightweight types only.
 */
export function allowedDocTypes(canViewAdminTypes: boolean): DocumentType[] {
  return canViewAdminTypes ? ALL_DOC_TYPES : LIGHTWEIGHT_DOC_TYPES;
}

/**
 * Resolve whether the internal review/sign-off track applies to a document: the per-document
 * toggle wins, otherwise fall back to the type default.
 */
export function approvalTrackApplies(
  type: DocumentType,
  metadata?: Pick<ProposalMetadata, "approvalTrackEnabled"> | null,
): boolean {
  return metadata?.approvalTrackEnabled ?? DOC_TYPE_CONFIG[type].usesApprovalTrack;
}

/** Slug used for the DocumentTemplate row seeded into Postgres. */
export const TEMPLATE_SLUG_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "default-proposal",
  SLA: "default-sla",
  SOW: "default-sow",
  MSA: "default-msa",
  NDA: "default-nda",
  CO: "default-co",
  DSA: "default-dsa",
  HANDOVER: "default-handover",
  REPORT: "default-report",
  BRIEF: "default-brief",
  DECK: "default-deck",
  OTHER: "default-other",
};

export const TEMPLATE_NAME_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "Proposal — default",
  SLA: "SLA — default",
  SOW: "SOW — default",
  MSA: "MSA — default",
  NDA: "NDA — default",
  CO: "Change Order — default",
  DSA: "Data Sharing Agreement — default",
  HANDOVER: "Handover — default",
  REPORT: "Status report — default",
  BRIEF: "Brief / meeting notes — default",
  DECK: "Deck — slides",
  OTHER: "Blank document",
};

/** Plain-English descriptions for the default templates — shown in the template gallery. Kept
 *  brand-neutral (no "Foundry"): the gallery already sits inside the product. */
export const TEMPLATE_DESCRIPTION_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "A structured client proposal — objectives, scope, timeline and costs.",
  SLA: "A service level agreement — service tiers, response times and penalties.",
  SOW: "A statement of work — scope, deliverables, timeline and acceptance.",
  MSA: "A master service agreement — umbrella terms for an ongoing engagement.",
  NDA: "A mutual non-disclosure agreement — confidentiality between two parties.",
  CO: "A change order — a scoped, priced change to an existing statement of work.",
  DSA: "A data sharing agreement — how personal data is shared and protected.",
  HANDOVER: "A project handover — access, architecture and everything the next team needs.",
  REPORT: "A recurring status report — progress, metrics and what's next.",
  BRIEF: "A short brief or meeting notes — context, decisions and next steps.",
  DECK: "A slide deck, authored in Deck. Pick a starting template when you create it.",
  OTHER: "A blank document — a clean page with just the essentials.",
};
