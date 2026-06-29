/**
 * Status report / update template blueprint.
 *
 * A recurring client-facing progress update — lightweight, no costing/timeline/sign-off. Generic
 * blocks only.
 */

import type { SectionBlueprint } from "@/lib/default-template";

export const reportSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page.",
    data: {
      proposalTitle: "Status Report",
      productName: "",
      clientName: "Client name",
      subtitle: "Progress update",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Prepared for the client named above.",
      confidentialityMode: "EXTERNAL",
      heroImage: "",
      coverStyle: "light",
      brandLockup: "CLIENT_X_GITWORK",
    },
  },
  {
    key: "callout",
    title: "This period at a glance",
    description: "Headline status for the reporting period.",
    data: {
      tone: "success",
      headline: "On track",
      body:
        "One or two sentences on overall status for this period. Change the tone (success / info / warning) to reflect whether things are on track, steady, or need attention.",
    },
  },
  {
    key: "checklist",
    title: "Completed this period",
    description: "What got done.",
    data: {
      polarity: "INCLUDE",
      intro: "Since the last update we've delivered:",
      items: [
        "Item one (replace with specifics)",
        "Item two",
        "Item three",
      ],
    },
  },
  {
    key: "prose",
    title: "In progress",
    description: "What's underway now.",
    data: {
      content:
        "Describe what's currently in flight and roughly where it sits. Keep it to the things the client cares about — outcomes, not task minutiae.",
    },
  },
  {
    key: "callout",
    title: "Blockers & risks",
    description: "Anything slowing things down or worth flagging.",
    data: {
      tone: "warning",
      headline: "Needs attention",
      body:
        "List anything blocking progress or any risk worth flagging — and what you need from the client to clear it. If there's nothing, say \"No blockers this period\" and switch the tone to neutral.",
    },
  },
  {
    key: "checklist",
    title: "Planned for next period",
    description: "What's coming up.",
    data: {
      polarity: "INCLUDE",
      intro: "Next up:",
      items: [
        "Item one (replace with specifics)",
        "Item two",
      ],
    },
  },
];
