/**
 * Central registry mapping `SectionKey` → `SectionType`.
 *
 * Importers:
 *   - `proposal-section-editor.tsx` — looks up the Editor component for the current section
 *   - `proposal-section-preview.tsx` — looks up the Preview component for the current section
 *   - AI draft endpoint — uses `aiExpandable` flag to decide which sections to ask the model
 *     to fill, and uses `displayName` + `description` as prompt context
 *
 * Add a new section type:
 *   1. Add the data shape + SectionKey union entry in `src/types/proposal.ts`
 *   2. Create `src/lib/sections/{kebab-key}.tsx` exporting a `defineSection({...})` SectionType
 *   3. Add an entry below
 */

import { assumptionsSection } from "@/lib/sections/assumptions";
import { calloutSection } from "@/lib/sections/callout";
import { checklistSection } from "@/lib/sections/checklist";
import { codeSnippetSection } from "@/lib/sections/code-snippet";
import { comparisonTableSection } from "@/lib/sections/comparison-table";
import { costingSection } from "@/lib/sections/costing";
import { coverSection } from "@/lib/sections/cover";
import { ctaNextStepsSection } from "@/lib/sections/cta-next-steps";
import { dataTableSection } from "@/lib/sections/data-table";
import { dividerSection } from "@/lib/sections/divider";
import { escalationSection } from "@/lib/sections/escalation";
import { exclusionsSection } from "@/lib/sections/exclusions";
import { faqSection } from "@/lib/sections/faq";
import { headingSection } from "@/lib/sections/heading";
import { imageSection } from "@/lib/sections/image";
import { introductionSection } from "@/lib/sections/introduction";
import { kpiStripSection } from "@/lib/sections/kpi-strip";
import { objectivesSection } from "@/lib/sections/objectives";
import { outOfScopeSection } from "@/lib/sections/out-of-scope";
import { partiesSection } from "@/lib/sections/parties";
import { penaltiesSection } from "@/lib/sections/penalties";
import { pricingTiersSection } from "@/lib/sections/pricing-tiers";
import { productOverviewSection } from "@/lib/sections/product-overview";
import { proseSection } from "@/lib/sections/prose";
import { responseTimesSection } from "@/lib/sections/response-times";
import { serviceTiersSection } from "@/lib/sections/service-tiers";
import { signaturesSection } from "@/lib/sections/signatures";
import { signoffFooterSection } from "@/lib/sections/signoff-footer";
import { supportingLinksAssetsSection } from "@/lib/sections/supporting-links-assets";
import { termSection } from "@/lib/sections/term";
import { timelineSection } from "@/lib/sections/timeline";
import { touchpointsSection } from "@/lib/sections/touchpoints";
import { videoEmbedSection } from "@/lib/sections/video-embed";
import type { SectionType } from "@/lib/sections/types";
import type { DocumentType, SectionKey } from "@/types/proposal";

export const SECTION_REGISTRY: Record<SectionKey, SectionType> = {
  cover: coverSection,
  heading: headingSection,
  divider: dividerSection,
  introduction: introductionSection,
  prose: proseSection,
  product_overview: productOverviewSection,
  callout: calloutSection,
  kpi_strip: kpiStripSection,
  objectives: objectivesSection,
  touchpoints: touchpointsSection,
  timeline: timelineSection,
  costing: costingSection,
  pricing_tiers: pricingTiersSection,
  cta_next_steps: ctaNextStepsSection,
  image: imageSection,
  video_embed: videoEmbedSection,
  supporting_links_assets: supportingLinksAssetsSection,
  assumptions: assumptionsSection,
  out_of_scope: outOfScopeSection,
  checklist: checklistSection,
  data_table: dataTableSection,
  comparison_table: comparisonTableSection,
  faq: faqSection,
  code_snippet: codeSnippetSection,
  signoff_footer: signoffFooterSection,
  parties: partiesSection,
  service_tiers: serviceTiersSection,
  response_times: responseTimesSection,
  escalation: escalationSection,
  exclusions: exclusionsSection,
  penalties: penaltiesSection,
  term: termSection,
  signatures: signaturesSection,
};

/** Look up a section type by key. Falls back to `undefined` for unknown keys (callers should
 *  guard with a "not configured" fallback in their UI). */
export function getSectionType(key: SectionKey): SectionType | undefined {
  return SECTION_REGISTRY[key];
}

/** All registered keys, in dispatch order. */
export function allSectionKeys(): SectionKey[] {
  return Object.keys(SECTION_REGISTRY) as SectionKey[];
}

/** Section keys that the AI flow can target with the per-section expand action. */
export function aiExpandableSectionKeys(): SectionKey[] {
  return allSectionKeys().filter((key) => SECTION_REGISTRY[key].aiExpandable === true);
}

/**
 * Sort section keys for the palette: blocks recommended for the given doc type come first
 * (in registry order), followed by everything else. Used by the slide-in palette to put
 * doc-type-appropriate blocks at the top without hiding the rest.
 */
export function sortedKeysForDocumentType(documentType: DocumentType | undefined): SectionKey[] {
  const all = allSectionKeys();
  if (!documentType) return all;

  const recommended: SectionKey[] = [];
  const rest: SectionKey[] = [];
  for (const key of all) {
    const section = SECTION_REGISTRY[key];
    const isRecommended =
      section.recommendedFor === undefined || section.recommendedFor.includes(documentType);
    (isRecommended ? recommended : rest).push(key);
  }
  return [...recommended, ...rest];
}

/** Group section keys by category, preserving the SECTION_CATEGORIES order. */
export function sectionsByCategory(keys: SectionKey[]): Array<{
  category: string;
  keys: SectionKey[];
}> {
  const groups = new Map<string, SectionKey[]>();
  for (const key of keys) {
    const cat = SECTION_REGISTRY[key].category;
    const list = groups.get(cat) ?? [];
    list.push(key);
    groups.set(cat, list);
  }
  return Array.from(groups.entries()).map(([category, keys]) => ({ category, keys }));
}
