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
      proposalTitle: "Docs by Gitwork",
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
        "Gitwork helps product and operations teams move from concept to launch with documentation that is clear, aligned, and execution-ready.",
      summary:
        "This proposal outlines a structured delivery plan for a proposal-builder workflow with strong governance and clear stakeholder checkpoints.",
      graphic: "",
    },
  },
  {
    key: "product_overview",
    title: "Product Overview",
    description: "What the platform is, who it is for, and why it matters.",
    data: {
      platformDescription:
        "Docs by Gitwork is a template-driven platform for generating client-ready proposals and documentation from structured content blocks.",
      audience:
        "Built for delivery leads, operations teams, and account managers who need consistent and auditable proposal output.",
      valueProposition:
        "Reduce proposal turnaround time while increasing quality and reusability across projects.",
      platformsSupported: "Web (Desktop-first), responsive mobile editing and preview",
      workflowGraphic: "",
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
    key: "timeline",
    title: "Timeline",
    description: "Phases, duration, and deliverables.",
    data: {
      viewMode: "LIST",
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
          teamMemberName: "Daniel Lindsay",
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
          action: "Kick Start",
          periodCovered: "Week 1",
          includedWork: "Resource allocation, planning, onboarding, and commencement of MVP development",
          amount: 8000,
        },
        {
          id: "payment-2",
          action: "Month 2",
          periodCovered: "Week 5",
          includedWork: "Core platform modules completed, mobile app development, backend services operational",
          amount: 8000,
        },
        {
          id: "payment-3",
          action: "Month 3",
          periodCovered: "Week 9",
          includedWork: "Therapist tools, safeguarding workflows, and payments functionality delivered",
          amount: 8000,
        },
        {
          id: "payment-4",
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
    key: "supporting_links_assets",
    title: "Supporting Links & Assets",
    description: "External references, decks, and documents.",
    data: {
      notes: "Reference material and linked assets used in this proposal.",
    },
  },
  {
    key: "assumptions",
    title: "Assumptions",
    description: "Delivery assumptions that shape scope and price.",
    data: {
      items: [
        "Client stakeholders will provide feedback within two business days.",
        "Existing brand assets and copy will be provided before phase two.",
      ],
    },
  },
  {
    key: "out_of_scope",
    title: "Out of Scope",
    description: "Explicitly excluded work items for this proposal.",
    data: {
      items: [
        "Third-party procurement negotiations",
        "Custom BI dashboard implementation",
      ],
    },
  },
  {
    key: "signoff_footer",
    title: "Sign-off / Footer",
    description: "Prepared by details and Gitwork branding block.",
    data: {
      preparedBy: "Gitwork Delivery Team",
      team: "Product and Delivery",
      contactDetails: "hello@gitwork.io",
      footerNote: "Docs by Gitwork | Internal Business Proposal",
      showBrandingBlock: true,
      signaturePlaceholder: true,
    },
  },
];

export const DEFAULT_PROPOSAL_METADATA: ProposalMetadata = {
  client: "Acme Health",
  owner: "Daniel Lindsay",
  expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    .toISOString()
    .slice(0, 10),
  version: "v1.0",
  notes: "Internal drafting notes (not included in export).",
  internalComments: "Awaiting legal review on SLA language.",
  productSignOff: false,
  techSignOff: false,
  approvalChecked: false,
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
};

export const defaultCostLineItems: CostLineItemInput[] = [
  {
    category: "Mobile Engineer",
    itemName: "",
    description: "Swift, JavaScript",
    quantity: 4,
    unitCost: 4000,
    subtotal: 16000,
    costKind: "ONE_OFF",
    sortOrder: 0,
  },
  {
    category: "Full Stack Engineer",
    itemName: "",
    description: "React, TypeScript, PostgreSQL, Azure",
    quantity: 4,
    unitCost: 4000,
    subtotal: 16000,
    costKind: "ONE_OFF",
    sortOrder: 1,
  },
  {
    category: "Product Manager",
    itemName: "",
    description: "GitHub, AWS",
    quantity: 1,
    unitCost: 0,
    subtotal: 0,
    costKind: "ONE_OFF",
    sortOrder: 2,
  },
  {
    category: "Technical Lead",
    itemName: "",
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
    name: "Discovery",
    duration: "Week 1",
    summary: "Workshop, stakeholder mapping, and acceptance criteria.",
    deliverables: ["Discovery brief", "Implementation plan"],
    sortOrder: 0,
    viewMode: "LIST",
  },
  {
    name: "Build",
    duration: "Weeks 2-4",
    summary: "Core editor, data model, and proposal preview implementation.",
    deliverables: ["MVP release", "QA checklist"],
    sortOrder: 1,
    viewMode: "LIST",
  },
  {
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
    destination: "mailto:hello@gitwork.io?subject=Proposal%20Review",
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
        signaturePlaceholder: false,
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
