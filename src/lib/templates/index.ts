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
import {
  proposalSectionBlueprints,
  type SectionBlueprint,
} from "@/lib/default-template";
import { slaSectionBlueprints } from "@/lib/templates/sla";
import { sowSectionBlueprints } from "@/lib/templates/sow";

export const TEMPLATES_BY_TYPE: Record<DocumentType, SectionBlueprint[]> = {
  PROPOSAL: proposalSectionBlueprints,
  SLA: slaSectionBlueprints,
  SOW: sowSectionBlueprints,
  // Stub out the rest with the proposal blueprint for now — they each get their own template
  // file when we're ready to invest the legal review time for each.
  MSA: proposalSectionBlueprints,
  NDA: proposalSectionBlueprints,
  CO: proposalSectionBlueprints,
  OTHER: proposalSectionBlueprints,
};

export function getTemplateBlueprintsForType(type: DocumentType): SectionBlueprint[] {
  return TEMPLATES_BY_TYPE[type] ?? proposalSectionBlueprints;
}

/** Slug used for the DocumentTemplate row seeded into Postgres. */
export const TEMPLATE_SLUG_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "default-proposal",
  SLA: "default-sla",
  SOW: "default-sow",
  MSA: "default-msa",
  NDA: "default-nda",
  CO: "default-co",
  OTHER: "default-other",
};

export const TEMPLATE_NAME_BY_TYPE: Record<DocumentType, string> = {
  PROPOSAL: "Proposal — default",
  SLA: "SLA — default",
  SOW: "SOW — default",
  MSA: "MSA — default",
  NDA: "NDA — default",
  CO: "Change Order — default",
  OTHER: "Document — default",
};
