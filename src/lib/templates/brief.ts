/**
 * Meeting notes / Brief template blueprint.
 *
 * A short internal-or-shared note: context, decisions, actions. Lightweight — no
 * costing/timeline/sign-off. Generic blocks only.
 */

import type { SectionBlueprint } from "@/lib/default-template";

export const briefSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page.",
    data: {
      proposalTitle: "Brief",
      productName: "",
      clientName: "Client name",
      subtitle: "Meeting notes & actions",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Internal / shared as needed.",
      confidentialityMode: "INTERNAL",
      heroImage: "",
      coverStyle: "minimal",
      brandLockup: "GITWORK",
    },
  },
  {
    key: "prose",
    title: "Context",
    description: "Why we met and what this covers.",
    data: {
      content:
        "Set the scene in a sentence or two — who was there, what the meeting was about, and the date. Then summarise the discussion.",
    },
  },
  {
    key: "checklist",
    title: "Decisions",
    description: "What was agreed.",
    data: {
      polarity: "INCLUDE",
      intro: "We agreed the following:",
      items: [
        "Decision one (replace with specifics)",
        "Decision two",
      ],
    },
  },
  {
    key: "data_table",
    title: "Actions",
    description: "Who's doing what, by when.",
    data: {
      caption: "Owners and due dates.",
      columns: ["Action", "Owner", "Due"],
      rows: [
        ["", "", ""],
        ["", "", ""],
        ["", "", ""],
      ],
    },
  },
  {
    key: "prose",
    title: "Notes",
    description: "Anything else worth capturing.",
    data: {
      content:
        "Free space for anything that doesn't fit above — open questions, parking-lot items, links.",
    },
  },
];
