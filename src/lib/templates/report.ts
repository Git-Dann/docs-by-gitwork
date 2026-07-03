/**
 * Customer support report template blueprint.
 *
 * A recurring, client-facing support summary for the Care module — ticket volume, support
 * performance, and product analytics for the reporting period. Generic blocks only (no
 * costing / timeline / sign-off).
 *
 * This is the skeleton a blank REPORT document starts from. To fill it with a client's real
 * numbers automatically, use **Care → (client) → Reports → Generate customer report**, which
 * pulls the connected analytics (e.g. Fellas) + ticket stats into these same sections in one
 * click. Editing this blueprint also refreshes the seeded "default-report" template on boot.
 */

import type { SectionBlueprint } from "@/lib/default-template";

export const reportSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page.",
    data: {
      proposalTitle: "Support Report",
      productName: "",
      clientName: "Client name",
      subtitle: "Monthly support summary",
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
    title: "Overview",
    description: "Summary of the month's support activity.",
    data: {
      content:
        "A short summary of support activity for this period — volume handled, overall responsiveness, and anything notable. " +
        "Tip: use “Generate customer report” in Care to auto-fill the figures below from this client's connected data, then edit this narrative.",
    },
  },
  {
    key: "kpi_strip",
    title: "Support performance",
    description: "Key service metrics for the period.",
    data: {
      items: [
        { value: "—", label: "Conversations" },
        { value: "—", label: "Resolved", context: "resolution rate" },
        { value: "—", label: "Avg first response" },
        { value: "—", label: "Within SLA", context: "target" },
      ],
    },
  },
  {
    key: "data_table",
    title: "Ticket volume",
    description: "Conversations by category.",
    data: {
      columns: ["Category", "Count"],
      rows: [
        ["Cancellations / churn", "—"],
        ["Billing / refunds", "—"],
        ["Account queries", "—"],
        ["Technical issues", "—"],
        ["Other", "—"],
      ],
      caption: "By category",
    },
  },
  {
    key: "data_table",
    title: "By priority",
    description: "Conversations by priority.",
    data: {
      columns: ["Priority", "Count"],
      rows: [
        ["Urgent", "—"],
        ["High", "—"],
        ["Normal", "—"],
        ["Low", "—"],
      ],
    },
  },
  {
    key: "data_table",
    title: "Product analytics",
    description: "Auto-filled from the client's connected analytics (e.g. Fellas) via Generate customer report.",
    data: {
      columns: ["Metric", "Value", "vs last month"],
      rows: [
        ["Add a connected metric", "—", "—"],
      ],
      caption: "Connect an Analytics source in Connectors, then Generate to fill this in.",
    },
  },
  {
    key: "callout",
    title: "Summary",
    description: "Closing note to the client.",
    data: {
      tone: "info",
      headline: "Looking ahead",
      body:
        "Thanks for your continued partnership. If you'd like to discuss any of the above or adjust priorities for next month, just reply to this report or reach out to your Gitwork contact.",
    },
  },
];
