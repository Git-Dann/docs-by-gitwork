/**
 * Blank / Freeform document blueprint (DocumentType.OTHER).
 *
 * The base for ad-hoc documents — just a cover and a single prose block. Add any generic blocks
 * (heading, prose, callout, image, list, table…) from the builder's Add-block palette. No
 * costing, timeline, or sign-off track.
 */

import type { SectionBlueprint } from "@/lib/default-template";

export const otherSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page.",
    data: {
      proposalTitle: "Untitled Document",
      productName: "",
      clientName: "",
      subtitle: "",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "",
      confidentialityMode: "INTERNAL",
      heroImage: "",
      coverStyle: "minimal",
      brandLockup: "GITWORK",
    },
  },
  {
    key: "prose",
    title: "Section",
    description: "Start writing — add more blocks from the Add-block palette.",
    data: {
      content: "Start writing here. Use the Add-block button to add headings, callouts, lists, tables, and images.",
    },
  },
];
