/**
 * Change Order template blueprint.
 *
 * Used to amend an in-flight Statement of Work — scope, cost, or timeline. Pairs with the
 * Document.parentId relation (P5.18): the operator sets the parent SOW so both docs link in
 * the editor and the audit trail is preserved.
 *
 * **Important:** This is a starting scaffold. Legal counsel must review before sending. Gitwork
 * takes no responsibility for unreviewed contracts generated from this template.
 */

import type { SectionBlueprint } from "@/lib/default-template";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

export const coSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Change Order",
      productName: "",
      clientName: "Client name",
      subtitle: "Change Order against [REVIEW: parent SOW reference]",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Confidential. Between the parties named on the cover.",
      confidentialityMode: "EXTERNAL",
      heroImage: "",
      brandLockup: "GITWORK",
    },
  },
  {
    key: "parties",
    title: "Parties",
    description: "Counterparties to this Change Order.",
    data: {
      intro:
        "This Change Order is entered into between the same parties as the underlying Statement of Work (the “SOW”) and is governed by the Master Service Agreement between them:",
      parties: [
        {
          id: id(),
          name: "Gitwork Ltd",
          role: "Service Provider",
          organization: "Gitwork Ltd",
          email: "hello@gitwork.io",
          signatureRequired: true,
        },
        {
          id: id(),
          name: "Client Name",
          role: "Customer",
          organization: "Client organisation",
          email: "[REVIEW] client primary contact email",
          signatureRequired: true,
        },
      ],
    },
  },
  {
    key: "prose",
    title: "Background",
    description: "Why this Change Order exists.",
    data: {
      content:
        "Reference SOW: [REVIEW: parent SOW reference, e.g. “SOW-2026-007 — Phase 2 discovery”].\n\nThis Change Order documents an agreed change to the referenced SOW. Once signed by both Parties, it amends that SOW. All other terms of the SOW and the underlying Master Service Agreement remain in full force.",
    },
  },
  {
    key: "prose",
    title: "What is changing",
    description: "Plain-English description of the change.",
    data: {
      content:
        "[REVIEW] Describe in 2–4 sentences what is changing about the engagement: what was previously scoped, what the Parties now want, and the rationale. Be specific — vague Change Orders cause delivery disputes.",
    },
  },
  {
    key: "checklist",
    title: "Now in scope",
    description: "Specific items added to the engagement by this Change Order.",
    data: {
      polarity: "INCLUDE",
      intro: "The following work is added to the SOW:",
      items: [
        "[REVIEW] First new deliverable, written so anyone can tell if it’s done",
        "[REVIEW] Second new deliverable",
      ],
    },
  },
  {
    key: "checklist",
    title: "Now out of scope (removals)",
    description: "Items that were in the original SOW but are being removed by this Change Order.",
    data: {
      polarity: "EXCLUDE",
      intro: "The following work is removed from the SOW (if any):",
      items: [
        "[REVIEW] First removed item, or “None” if this is an additive change",
      ],
    },
  },
  {
    key: "costing",
    title: "Cost impact",
    description: "How fees change as a result of this Change Order.",
    data: {
      currency: "GBP",
      discount: 0,
      taxRate: 20,
      monthlyCostSummary: "",
      durationSummary: "",
      totalCostLabel: "Net change to SOW total",
      supportingNarrative:
        "Shows only the delta against the original SOW. Positive numbers add to the SOW total; negative numbers reduce it.",
      paymentScheduleIntro:
        "Payment terms follow the underlying SOW unless explicitly varied below.",
      paymentTerms: "",
      vatNotice: "",
      ipTransferNotice: "",
      teamAllocations: [],
      paymentSchedule: [],
      additionalNotes: [],
    },
  },
  {
    key: "timeline",
    title: "Timeline impact",
    description: "How the engagement schedule shifts.",
    data: {
      viewMode: "LIST",
    },
  },
  {
    key: "prose",
    title: "No other amendments",
    description: "Confirm that everything else stays as it was.",
    data: {
      content:
        "All terms of the referenced SOW and the underlying Master Service Agreement that are not explicitly varied by this Change Order remain in full force. In the event of any conflict between this Change Order and the SOW it amends, this Change Order prevails for the items it expressly varies.",
    },
  },
  {
    key: "signatures",
    title: "Signatures",
    description: "Authorised signatories for each party.",
    data: {
      intro: "Signed for and on behalf of:",
      blocks: [
        {
          id: id(),
          type: "gitwork",
          variableName: "gitwork_signature",
          partyName: "Gitwork Ltd",
          signatoryName: "[REVIEW] Authorised Gitwork signatory",
          signatoryRole: "Director",
          signatoryEmail: "hello@gitwork.io",
          signatureDate: "",
        },
        {
          id: id(),
          type: "client",
          variableName: "client_signature",
          partyName: "Client organisation",
          signatoryName: "[REVIEW] Authorised client signatory",
          signatoryRole: "Authorised representative",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
      ],
    },
  },
];
