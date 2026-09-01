/**
 * SOW (Statement of Work) template blueprint.
 *
 * Heavily reuses the proposal's existing section types:
 *   - `introduction` becomes the SOW "Scope of Work" prose block
 *   - `touchpoints` becomes "Deliverables" — each touchpoint is a deliverable + acceptance criteria
 *   - `timeline` is the project schedule
 *   - `costing` is the fee schedule
 *   - `assumptions` covers Customer dependencies + project assumptions
 *
 * Additions on top of proposal's blueprint:
 *   - `parties` (new from SLA work) — names the counterparties
 *   - `signatures` (new from SLA work) — signature blocks
 *
 * As with the SLA template, default copy is tagged `[REVIEW]` where legal review is required.
 */

import type { SectionBlueprint } from "@/lib/default-template";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

export const sowSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Statement of Work",
      productName: "",
      clientName: "Client name",
      subtitle: "v1.0",
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
    description: "Counterparties to this Statement of Work.",
    data: {
      intro:
        "This Statement of Work (“SOW”) is executed under the parties' existing Master Service Agreement (“MSA”) dated [REVIEW]. Capitalised terms not defined herein have the meanings given in the MSA.",
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
    key: "introduction",
    title: "Scope of Work",
    description: "Project objectives, scope boundaries, and approach.",
    data: {
      statement:
        "Gitwork will deliver the engagement described below in accordance with the deliverables, timeline, and fees set out in this SOW.",
      summary:
        "The Service Provider shall provide the following services to the Customer. Anything not expressly included is out of scope and subject to a Change Order.",
      graphic: "",
    },
  },
  {
    key: "touchpoints",
    title: "Deliverables",
    description: "Specific outputs the Service Provider will produce.",
    data: {
      items: [
        {
          id: id(),
          title: "Deliverable 1",
          summary: "[REVIEW] describe the deliverable and its acceptance criteria.",
          features: ["Acceptance criterion 1", "Acceptance criterion 2"],
          notes: "",
          callout: "",
        },
      ],
    },
  },
  {
    key: "timeline",
    title: "Project Schedule",
    description: "Phases, durations, and target milestone dates.",
    data: {
      viewMode: "MILESTONE",
    },
  },
  {
    key: "costing",
    title: "Fees",
    description: "Fee schedule and payment milestones for this SOW.",
    data: {
      currency: "GBP",
      discount: 0,
      taxRate: 20,
      monthlyCostSummary: "",
      durationSummary: "",
      totalCostLabel: "",
      supportingNarrative: "",
      paymentScheduleIntro: "Fees are invoiced according to the milestones below. Net 30 unless otherwise agreed.",
      paymentTerms: "Net 30",
      vatNotice: "All amounts are exclusive of VAT, which is added at the prevailing rate where applicable.",
      ipTransferNotice: "Intellectual property created under this SOW transfers to the Customer on full payment of all fees due.",
      additionalNotes: [],
      paymentSchedule: [
        {
          id: id(),
          action: "On signature",
          periodCovered: "On execution of this SOW",
          paymentPercent: 30,
          includedWork: "Project mobilisation and kick-off",
          amount: null,
        },
        {
          id: id(),
          action: "On Deliverable 1 acceptance",
          periodCovered: "[REVIEW] date or trigger",
          paymentPercent: 40,
          includedWork: "Discovery and design",
          amount: null,
        },
        {
          id: id(),
          action: "On final acceptance",
          periodCovered: "[REVIEW] date or trigger",
          paymentPercent: 30,
          includedWork: "Delivery, testing, and handover",
          amount: null,
        },
      ],
      teamAllocations: [],
    },
  },
  {
    key: "assumptions",
    title: "Customer Dependencies & Assumptions",
    description: "What the Customer must provide and the assumptions this SOW depends on.",
    data: {
      items: [
        "The Customer will provide timely access to required systems, data, and stakeholders.",
        "The Customer will nominate a single point of contact for decision-making and acceptance.",
        "Third-party software licences required for the project are procured by the Customer unless explicitly listed in Fees.",
        "Review cycles will be completed within 5 business days; delays may impact the schedule.",
      ],
    },
  },
  {
    key: "out_of_scope",
    title: "Out of Scope",
    description: "Items expressly excluded from this SOW.",
    data: {
      items: [
        "Ongoing support and maintenance beyond the engagement (covered by a separate SLA).",
        "Discovery and design work for features not listed in Deliverables.",
        "Migration of legacy data or systems unless explicitly stated.",
      ],
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
          variableName: "Gitwork Signature",
          partyName: "Gitwork Ltd",
          signatoryName: "[REVIEW] authorised signatory name",
          signatoryRole: "Director",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
        {
          id: id(),
          type: "client",
          variableName: "Client Signature",
          partyName: "Client organisation",
          signatoryName: "[REVIEW] authorised signatory name",
          signatoryRole: "[REVIEW] role",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
      ],
    },
  },
];
