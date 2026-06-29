/**
 * End-of-project Handover template blueprint.
 *
 * A lightweight, client-facing wrap-up document — no costing, timeline, or sign-off track. Built
 * entirely from generic blocks so it reads as a clean editorial doc rather than a proposal.
 */

import type { SectionBlueprint } from "@/lib/default-template";

export const handoverSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page.",
    data: {
      proposalTitle: "Project Handover",
      productName: "",
      clientName: "Client name",
      subtitle: "End-of-project handover",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Prepared for the client named above.",
      confidentialityMode: "EXTERNAL",
      heroImage: "",
      coverStyle: "light",
      brandLockup: "CLIENT_X_GITWORK",
    },
  },
  {
    key: "prose",
    title: "Project summary",
    description: "What the project set out to do and where it landed.",
    data: {
      content:
        "This document marks the formal handover of the project. It summarises what was delivered, how to access it, the support arrangements going forward, and our recommended next steps.\n\nReplace this paragraph with a short summary of the project — the goal, the scope delivered, and the outcome.",
    },
  },
  {
    key: "checklist",
    title: "What was delivered",
    description: "The scope completed and handed over.",
    data: {
      polarity: "INCLUDE",
      intro: "The following was delivered as part of this engagement:",
      items: [
        "Core product / feature set (replace with specifics)",
        "Source code repositories transferred to the client organisation",
        "Documentation and any runbooks",
        "Design files and brand assets",
      ],
    },
  },
  {
    key: "callout",
    title: "A note on credentials",
    description: "Security reminder.",
    data: {
      tone: "warning",
      headline: "Don't store live passwords here",
      body:
        "List where each system lives and who owns the account — share the actual secrets through a password manager or a secure share, never in this document.",
    },
  },
  {
    key: "data_table",
    title: "Access & ownership",
    description: "Systems, where they live, and who owns the account.",
    data: {
      caption: "Where everything lives and who holds the keys.",
      columns: ["System", "URL / location", "Account owner", "Notes"],
      rows: [
        ["Hosting", "", "", ""],
        ["Domain / DNS", "", "", ""],
        ["Database", "", "", ""],
        ["Repository", "", "", ""],
        ["Analytics", "", "", ""],
      ],
    },
  },
  {
    key: "prose",
    title: "Support & maintenance",
    description: "How support works after handover.",
    data: {
      content:
        "Describe the support arrangement from here — whether there's an ongoing retainer, how to raise issues, expected response times, and who to contact. If there's no ongoing support, state that clearly and note what the client is now responsible for.",
    },
  },
  {
    key: "checklist",
    title: "Recommended next steps",
    description: "What we suggest the client does next.",
    data: {
      polarity: "INCLUDE",
      intro: "To get the most from what's been built, we recommend:",
      items: [
        "Confirm all account ownership has transferred",
        "Set up monitoring / backups if not already in place",
        "Plan the next phase of work (replace with specifics)",
      ],
    },
  },
  {
    key: "callout",
    title: "Your point of contact",
    description: "Who to reach.",
    data: {
      tone: "info",
      headline: "Questions?",
      body:
        "Add the primary Gitwork contact name and email here. We're glad to have worked with you.",
    },
  },
];
