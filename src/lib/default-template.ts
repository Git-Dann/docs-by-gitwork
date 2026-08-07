import { GITWORK } from "@/lib/gitwork";
import { DEFAULT_DOC_THEME } from "@/types/proposal";
import type {
  AssetInput,
  CostLineItemInput,
  CTAInput,
  ProposalMetadata,
  ProposalSection,
  ProposalSectionData,
  ProposalLinkInput,
  SectionKey,
  TimelinePhaseInput,
} from "@/types/proposal";

export interface SectionBlueprint {
  key: SectionKey;
  title: string;
  description: string;
  visible?: boolean;
  data: ProposalSectionData;
}

export const proposalSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Foundry by Gitwork",
      productName: "Proposal Builder",
      clientName: "Acme Health",
      subtitle: "Version 1.0",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Confidential: For internal stakeholder review only.",
      confidentialityMode: "INTERNAL",
      heroImage: "",
      brandLockup: "GITWORK",
    },
  },
  {
    key: "introduction",
    title: "Introduction",
    description: "Company statement and positioning summary.",
    data: {
      statement:
        "Foundry by Gitwork helps product and operations teams move from concept to launch with documentation that is clear, aligned, and execution-ready.",
      summary:
        "This proposal outlines a structured delivery plan for a proposal-builder workflow with strong governance and clear stakeholder checkpoints.",
      graphic: "",
    },
  },
  {
    key: "objectives",
    title: "Objectives",
    description: "Goals and outcomes for the proposal delivery.",
    data: {
      items: [
        {
          id: "obj-1",
          title: "Create faster client-ready proposals",
          description: "Reduce drafting and review cycle time through structured content blocks.",
          icon: "bolt",
        },
        {
          id: "obj-2",
          title: "Standardise proposal quality",
          description: "Use reusable templates and snippets with clear section ownership.",
          icon: "shield",
        },
      ],
    },
  },
  {
    key: "touchpoints",
    title: "Scope / Touchpoints",
    description: "Structured capability blocks that define what is included.",
    data: {
      items: [
        {
          id: "touch-1",
          title: "Submission engine",
          summary: "Configurable submission workflows and decision routing.",
          features: [
            "Multi-step capture flow",
            "Validation rules by client profile",
            "Submission status tracking",
          ],
          notes: "Scope includes baseline workflow templates and admin controls.",
          graphic: "",
          callout: "Integrates with existing CRM via webhook adapters.",
        },
        {
          id: "touch-2",
          title: "Admin dashboard",
          summary: "Internal controls for proposal lifecycle and collaboration.",
          features: ["Role-based access", "Review checkpoints", "Audit-ready updates"],
          notes: "Full analytics can be introduced in phase two.",
          graphic: "",
          callout: "Designed for low-friction handover between teams.",
        },
      ],
    },
  },
  {
    key: "costing",
    title: "Cost Breakdown",
    description: "Commercial structure, delivery allocation, and milestone billing.",
    data: {
      currency: "GBP",
      discount: 0,
      taxRate: 20,
      monthlyCostSummary: "£4,000 × 2 developers = £8,000 / month",
      durationSummary: "16 weeks ≈ 4 months",
      totalCostLabel: "Total MVP Engineering Cost",
      supportingNarrative:
        "This approach ensures clarity, accountability, and a predictable path to launch within the agreed budget.",
      paymentScheduleIntro:
        "To ensure clear accountability and smooth delivery, the project will follow a milestone-based payment structure aligned to the MVP delivery timeline.",
      paymentTerms: "All invoices are issued with a 7-day payment term.",
      vatNotice: "All prices are exclusive of VAT, which will be added at the prevailing rate.",
      ipTransferNotice:
        "Intellectual Property (IP) for the work delivered transfers to the client upon receipt of each corresponding payment.",
      assignmentTimelineMode: {},
      teamAllocations: [
        {
          id: "team-1",
          teamMemberName: "TBC",
          role: "Flutter Mobile Engineer",
          techStack: "Flutter, iOS, Android",
          monthsRequired: 4,
          dayRate: 190.4,
          monthlyRate: 4000,
          totalCost: 16000,
          included: false,
        },
        {
          id: "team-2",
          teamMemberName: "TBC",
          role: "Full Stack Engineer",
          techStack: "Next.js, Node.js, DB, Stripe, APIs",
          monthsRequired: 4,
          dayRate: 190.4,
          monthlyRate: 4000,
          totalCost: 16000,
          included: false,
        },
        {
          id: "team-3",
          teamMemberName: "TBC",
          role: "Product Manager",
          techStack: "Delivery oversight",
          monthsRequired: 4,
          dayRate: null,
          monthlyRate: null,
          totalCost: null,
          included: true,
        },
        {
          id: "team-4",
          teamMemberName: "Shahab Rasheed",
          role: "Technical Lead",
          techStack: "Architecture oversight",
          monthsRequired: 4,
          dayRate: null,
          monthlyRate: null,
          totalCost: null,
          included: true,
        },
      ],
      paymentSchedule: [
        {
          id: "payment-1",
          timelinePhaseId: "timeline-discovery",
          action: "Kick Start",
          periodCovered: "Week 1",
          includedWork: "Resource allocation, planning, onboarding, and commencement of MVP development",
          amount: 8000,
        },
        {
          id: "payment-2",
          timelinePhaseId: "timeline-build",
          action: "Month 2",
          periodCovered: "Week 5",
          includedWork: "Core platform modules completed, mobile app development, backend services operational",
          amount: 8000,
        },
        {
          id: "payment-3",
          timelinePhaseId: "timeline-build",
          action: "Month 3",
          periodCovered: "Week 9",
          includedWork: "Therapist tools, safeguarding workflows, and payments functionality delivered",
          amount: 8000,
        },
        {
          id: "payment-4",
          timelinePhaseId: "timeline-launch",
          action: "Delivery",
          periodCovered: "Week 16",
          includedWork: "Final QA, partner embed SDK, testing, and handover",
          amount: 8000,
        },
      ],
      additionalNotes: [
        "Invoiced in milestones aligned to delivery progress.",
        "7-day payment term from invoice date.",
        "UK-based product manager included throughout delivery.",
        "Optional post-launch support or a monthly development retainer can be scoped separately.",
      ],
    },
  },
  {
    key: "cta_next_steps",
    title: "CTA / Next Steps",
    description: "Primary and secondary calls to action.",
    data: {
      headline: "Ready to proceed?",
      body: "Choose a next step to keep implementation momentum.",
    },
  },
  {
    key: "signoff_footer",
    title: "Sign-off / Footer",
    description: "Prepared by details and Gitwork branding block.",
    data: {
      // Blank by default → the footer inherits the cover's "Prepared by" (metadata.owner) so the
      // document speaks with one voice. Set a value here only to override the footer line.
      preparedBy: "",
      team: "Product and Delivery",
      contactDetails: GITWORK.email,
      footerNote: "Foundry by Gitwork | Internal Business Proposal",
      showBrandingBlock: true,
      signatureName: "",
      signatureDate: "",
    },
  },
];

export const DEFAULT_PROPOSAL_METADATA: ProposalMetadata = {
  client: "Acme Health",
  owner: "",
  expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    .toISOString()
    .slice(0, 10),
  version: "v1.0",
  notes: "Internal drafting notes (not included in export).",
  internalComments: "Awaiting legal review on SLA language.",
  productSignOff: false,
  techSignOff: false,
  approvalChecked: false,
  // Gitwork FIRST — every document is brand-themed unless explicitly switched. `normalizeMetadata`
  // spreads this first, so docs whose stored JSON predates the key adopt it too.
  docTheme: DEFAULT_DOC_THEME,
};

export const EMPTY_PROPOSAL_METADATA: ProposalMetadata = {
  client: "",
  owner: "",
  expiryDate: "",
  version: "",
  notes: "",
  internalComments: "",
  productSignOff: false,
  techSignOff: false,
  approvalChecked: false,
  docTheme: DEFAULT_DOC_THEME,
};

export const defaultCostLineItems: CostLineItemInput[] = [
  {
    category: "Mobile Engineer",
    itemName: "custom-role:mobile-engineer",
    description: "Swift, JavaScript",
    quantity: 4,
    unitCost: 4000,
    subtotal: 16000,
    costKind: "ONE_OFF",
    sortOrder: 0,
  },
  {
    category: "Full Stack Engineer",
    itemName: "custom-role:full-stack-engineer",
    description: "React, TypeScript, PostgreSQL, Azure",
    quantity: 4,
    unitCost: 4000,
    subtotal: 16000,
    costKind: "ONE_OFF",
    sortOrder: 1,
  },
  {
    category: "Product Manager",
    itemName: "custom-role:product-manager",
    description: "GitHub, AWS",
    quantity: 1,
    unitCost: 0,
    subtotal: 0,
    costKind: "ONE_OFF",
    sortOrder: 2,
  },
  {
    category: "Technical Lead",
    itemName: "custom-role:technical-lead",
    description: "Kubernetes, GCP, Redis",
    quantity: 1,
    unitCost: 0,
    subtotal: 0,
    costKind: "ONE_OFF",
    sortOrder: 3,
  },
];

export const defaultTimelinePhases: TimelinePhaseInput[] = [
  {
    id: "timeline-discovery",
    name: "Discovery",
    duration: "Week 1",
    summary: "Workshop, stakeholder mapping, and acceptance criteria.",
    deliverables: ["Discovery brief", "Implementation plan"],
    sortOrder: 0,
    viewMode: "LIST",
  },
  {
    id: "timeline-build",
    name: "Build",
    duration: "Weeks 2-4",
    summary: "Core editor, data model, and proposal preview implementation.",
    deliverables: ["MVP release", "QA checklist"],
    sortOrder: 1,
    viewMode: "LIST",
  },
  {
    id: "timeline-launch",
    name: "Launch",
    duration: "Week 5",
    summary: "Pilot rollout, export readiness, and team handover.",
    deliverables: ["Launch report", "Support playbook"],
    sortOrder: 2,
    viewMode: "LIST",
  },
];

export const defaultLinks: ProposalLinkInput[] = [
  {
    label: "Solution deck",
    url: "https://example.com/deck",
    type: "DECK_LINK",
    notes: "Overview slides",
    sortOrder: 0,
  },
  {
    label: "Reference website",
    url: "https://gitwork.io",
    type: "EXTERNAL_URL",
    notes: "Public product information",
    sortOrder: 1,
  },
];

export const defaultCtas: CTAInput[] = [
  {
    role: "PRIMARY",
    label: "Book a call",
    destination: `mailto:${GITWORK.email}?subject=Proposal%20Review`,
    destinationType: "EMAIL_LINK",
    sortOrder: 0,
  },
  {
    role: "SECONDARY",
    label: "View deck",
    destination: "https://example.com/deck",
    destinationType: "DECK_LINK",
    sortOrder: 1,
  },
];

export const defaultAssets: AssetInput[] = [
  {
    type: "COVER_IMAGE",
    title: "Proposal cover",
    url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80",
    altText: "Desk with notebook and documents",
    placement: "cover",
    caption: "Prepared for client stakeholders",
    size: "FULL",
    alignment: "FULL",
    sortOrder: 0,
  },
];

export function getDefaultProposalSections(): ProposalSection[] {
  return proposalSectionBlueprints.map((blueprint, index) => ({
    key: blueprint.key,
    title: blueprint.title,
    description: blueprint.description,
    sortOrder: index,
    isVisible: blueprint.visible ?? true,
    data: blueprint.data,
  }));
}

function getBlankProposalSectionData(key: SectionKey): ProposalSectionData {
  switch (key) {
    case "cover":
      return {
        proposalTitle: "",
        productName: "",
        clientName: "",
        subtitle: "",
        date: "",
        confidentiality: "",
        confidentialityMode: "INTERNAL",
        heroImage: "",
        brandLockup: "GITWORK",
      };
    case "introduction":
      return {
        statement: "",
        summary: "",
        graphic: "",
      };
    case "product_overview":
      return {
        platformDescription: "",
        audience: "",
        valueProposition: "",
        platformsSupported: "",
        workflowGraphic: "",
      };
    case "objectives":
      return {
        items: [],
      };
    case "touchpoints":
      return {
        items: [],
      };
    case "timeline":
      return {
        viewMode: "LIST",
      };
    case "costing":
      return {
        currency: "GBP",
        discount: 0,
        taxRate: 0,
        monthlyCostSummary: "",
        durationSummary: "",
        totalCostLabel: "",
        supportingNarrative: "",
        paymentScheduleIntro: "",
        paymentTerms: "",
        vatNotice: "",
        ipTransferNotice: "",
        teamAllocations: [],
        paymentSchedule: [],
        additionalNotes: [],
      };
    case "cta_next_steps":
      return {
        headline: "",
        body: "",
      };
    case "supporting_links_assets":
      return {
        notes: "",
      };
    case "assumptions":
    case "out_of_scope":
      return {
        items: [],
      };
    case "signoff_footer":
      return {
        preparedBy: "",
        team: "",
        contactDetails: "",
        footerNote: "",
        showBrandingBlock: true,
        signatureName: "",
        signatureDate: "",
      };
    default:
      return {
        items: [],
      } as ProposalSectionData;
  }
}

export function getEmptyProposalSections(): ProposalSection[] {
  return proposalSectionBlueprints.map((blueprint, index) => ({
    key: blueprint.key,
    title: blueprint.title,
    description: blueprint.description,
    sortOrder: index,
    isVisible: blueprint.visible ?? true,
    data: getBlankProposalSectionData(blueprint.key),
  }));
}
