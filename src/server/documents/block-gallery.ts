/**
 * The block gallery — ONE document containing every block Docs can render, with example content.
 *
 * Docs has 38 block types and no single place to see them. Reviewing a design change, or checking
 * that a theme reads correctly, meant assembling a document by hand and inevitably missing three
 * blocks — the ones that then shipped wrong. This builds that document instead.
 *
 * Two rules make it stay true:
 *
 *  1. **Every registered block appears exactly once**, enforced by
 *     `__tests__/block-gallery.test.ts` against the live registry. Add a block and forget the
 *     gallery and the test fails, which is the only reason a gallery like this is worth having —
 *     one that silently falls behind is worse than none, because it looks complete.
 *  2. **Each section's `description` is the block's registry key.** That is the reference the
 *     gallery exists to give you: see something wrong on the page, read the key, open
 *     `src/lib/sections/<key>.tsx`.
 *
 * The content is deliberately plausible-but-obviously-sample — a fictional client, round numbers —
 * so a page from it can never be mistaken for a real document if it escapes into a deck.
 */

import type {
  BreakdownSectionData,
  CalloutSectionData,
  CategoryChecklistSectionData,
  ChecklistSectionData,
  CodeSnippetSectionData,
  ComparisonTableSectionData,
  CostingSectionData,
  CostLineItemInput,
  CoverSectionData,
  CtaSectionData,
  DataTableSectionData,
  DividerSectionData,
  DoDontSectionData,
  EscalationSectionData,
  ExclusionsSectionData,
  FaqSectionData,
  HeadingSectionData,
  ImageSectionData,
  IntroductionSectionData,
  KpiStripSectionData,
  ListSectionData,
  ObjectivesSectionData,
  PartiesSectionData,
  PenaltiesSectionData,
  PricingTiersSectionData,
  PrinciplesGridSectionData,
  ProcessStepsSectionData,
  ProductOverviewSectionData,
  ProposalSection,
  ProposalSectionData,
  ProseSectionData,
  ResponseTimesSectionData,
  SectionKey,
  ServiceTiersSectionData,
  SignaturesSectionData,
  SignoffFooterSectionData,
  SupportingLinksSectionData,
  TermSectionData,
  TimelinePhaseInput,
  TimelineSectionData,
  TouchpointsSectionData,
  VideoEmbedSectionData,
} from "@/types/proposal";

export const BLOCK_GALLERY_TITLE = "Block gallery — every Docs block";

/** The fictional client. Obvious enough that a stray screenshot can't read as a real deal. */
const CLIENT = "Northwind Labs";

/**
 * One gallery entry. `data` is annotated at each call site with the block's own interface, so a
 * shape change in `types/proposal.ts` breaks this file rather than producing a section that
 * renders empty.
 */
function block(key: SectionKey, title: string, data: ProposalSectionData) {
  return { key, title, data };
}

const ENTRIES: Array<{ key: SectionKey; title: string; data: ProposalSectionData }> = [
  block("cover", "Cover", {
    proposalTitle: "Block gallery",
    productName: "Foundry Docs",
    clientName: CLIENT,
    subtitle: "Every block Docs can render, in one document, with sample content.",
    date: "2026-08-05",
    confidentiality: "Sample document — not for circulation",
    confidentialityMode: "INTERNAL",
    brandLockup: "CLIENT_X_GITWORK",
  } satisfies CoverSectionData),

  block("heading", "Heading", {
    level: "h2",
    eyebrow: "Section",
    text: "Headings set the shape of a document",
    subtitle: "Three levels plus this banner style, which sets off a major part of a document.",
    // Banner, because the subtitle is a banner-only field — set it on a plain heading and it
    // silently renders nothing. (The gallery's own coverage test caught exactly that.)
    style: "banner",
  } satisfies HeadingSectionData),

  block("introduction", "Introduction", {
    statement: "A document should read like it was written for one reader, not assembled from parts.",
    summary:
      "This gallery exists so every block can be seen together — in the theme, at the right type scale, on the page it will actually print on. If a block reads wrong here, it reads wrong everywhere.",
  } satisfies IntroductionSectionData),

  block("prose", "Prose", {
    content:
      "Prose is the workhorse. It takes **bold**, *italic*, `inline code` and [links](https://gitwork.co.uk), and it renders bullet lists:\n\n- One idea per bullet\n- No trailing full stops\n- Sentence case throughout\n\nA blank line starts a new paragraph. Everything else is left alone deliberately — a document editor that reformats your writing is one you stop trusting.",
    style: "prose",
  } satisfies ProseSectionData),

  block("product_overview", "Product overview", {
    platformDescription:
      "A booking and scheduling platform for independent clinics, replacing three spreadsheets and a phone line.",
    audience: "Clinic owners, front-desk staff, and the patients who book with them.",
    valueProposition:
      "Cut no-shows by making rescheduling a two-tap job rather than a phone call nobody makes.",
    platformsSupported: "Web · iOS · Android",
  } satisfies ProductOverviewSectionData),

  block("callout", "Callout", {
    tone: "info",
    headline: "Six tones, one shape",
    body: "Info, success, warning, danger, neutral and outline. Reach for one when a sentence genuinely changes what the reader should do — a document where everything is highlighted highlights nothing.",
  } satisfies CalloutSectionData),

  block("kpi_strip", "KPI strip", {
    items: [
      { value: "12", label: "Weeks", context: "Discovery to launch", emphasis: true },
      { value: "3", label: "Developers", context: "Two full-time, one part-time" },
      { value: "99.9%", label: "Uptime target", context: "Measured monthly" },
      { value: "£0", label: "Licence cost", context: "You own the code" },
    ],
  } satisfies KpiStripSectionData),

  block("objectives", "Objectives", {
    items: [
      {
        id: "obj-1",
        title: "Replace the spreadsheet",
        description: "One source of truth for appointments, with an audit trail nobody has to maintain by hand.",
      },
      {
        id: "obj-2",
        title: "Make rescheduling self-serve",
        description: "A patient should be able to move an appointment without speaking to anyone.",
      },
      {
        id: "obj-3",
        title: "Leave you able to run it",
        description: "Handover includes the repo, the runbook and two sessions with your team.",
      },
    ],
  } satisfies ObjectivesSectionData),

  block("touchpoints", "Touchpoints", {
    items: [
      {
        id: "tp-1",
        title: "Patient booking",
        summary: "The public-facing flow, from finding a slot to confirming it.",
        features: ["Slot search by clinician", "Two-tap reschedule", "Calendar invite on confirm"],
        callout: "The only screen most patients will ever see.",
      },
      {
        id: "tp-2",
        title: "Front desk",
        summary: "The day view the reception team lives in.",
        features: ["Drag to move an appointment", "Walk-in queue", "Same-day cancellations"],
      },
    ],
  } satisfies TouchpointsSectionData),

  block("process_steps", "Process steps", {
    intro: "How a build runs, start to finish.",
    steps: [
      { label: "Discovery", note: "2 weeks", description: "Interviews, a walk-through of the current process, and a written scope." },
      { label: "Design", note: "3 weeks", description: "Flows first, then screens. Reviewed weekly." },
      { label: "Build", note: "6 weeks", description: "Two-week sprints, each ending in something you can click." },
      { label: "Handover", note: "1 week", description: "Repo, runbook, and training." },
    ],
    style: "stepped",
    highlightLast: true,
  } satisfies ProcessStepsSectionData),

  block("principles_grid", "Principles grid", {
    items: [
      { title: "Ship weekly", detail: "Something clickable every week beats a demo at the end.", highlighted: true },
      { title: "Write it down", detail: "A decision that only exists in a call did not happen." },
      { title: "No surprise invoices", detail: "Scope changes are priced before they start." },
      { title: "You own it", detail: "The repo is yours from day one, not on handover." },
    ],
    columns: 2,
    style: "cards",
  } satisfies PrinciplesGridSectionData),

  block("do_dont", "Do / Don't", {
    doTitle: "What works",
    doItems: [
      "Send feedback in one batch per week",
      "Name one decision-maker per area",
      "Tell us early when a date moves",
    ],
    dontTitle: "What slows us down",
    dontItems: [
      "Feedback in five channels at once",
      "Approvals that need a committee",
      "Scope added mid-sprint",
    ],
    footnote: "None of this is unusual — it is just worth agreeing before week one rather than week six.",
    style: "ledger",
  } satisfies DoDontSectionData),

  block("breakdown", "Breakdown", {
    items: [
      { label: "Screens", count: "24", description: "Across patient, front desk and admin." },
      { label: "Integrations", count: "3", description: "Payments, SMS, and the existing patient record system." },
      { label: "User roles", count: "4", description: "Patient, receptionist, clinician, owner." },
    ],
  } satisfies BreakdownSectionData),

  block("category_checklist", "Category checklist", {
    groups: [
      { title: "Included", items: ["Design", "Build", "Testing", "Handover"] },
      { title: "Optional", items: ["Ongoing support", "Analytics dashboard", "Second language"] },
      { title: "By you", items: ["Content", "Domain and DNS", "Payment provider account"] },
    ],
    columns: 3,
  } satisfies CategoryChecklistSectionData),

  block("checklist", "Checklist", {
    polarity: "INCLUDE",
    intro: "What we will need from you before week one.",
    items: [
      "A named point of contact",
      "Access to the current booking spreadsheet",
      "Brand assets, or permission to design them",
      "A test account on your payment provider",
    ],
    marker: "arrow",
    columns: 1,
  } satisfies ChecklistSectionData),

  block("data_table", "Data table", {
    columns: ["Field", "Type", "Required", "Notes"],
    rows: [
      ["appointment_id", "uuid", "Yes", "Primary key"],
      ["patient_email", "string", "Yes", "Used for the confirmation"],
      ["starts_at", "timestamptz", "Yes", "Always stored in UTC"],
      ["clinician_id", "uuid", "No", "Null for a walk-in"],
    ],
    caption: "The ingestion contract. Any column not listed here is ignored.",
    showHeader: true,
  } satisfies DataTableSectionData),

  block("comparison_table", "Comparison table", {
    usLabel: "Gitwork",
    themLabel: "Typical agency",
    rows: [
      { label: "You own the code", us: true, them: false },
      { label: "Weekly working software", us: true, them: "Monthly demo" },
      { label: "Fixed price", us: true, them: true },
      { label: "Handover included", us: true, them: "Priced separately" },
    ],
    showHeader: true,
  } satisfies ComparisonTableSectionData),

  block("code_snippet", "Code / schema", {
    language: "TypeScript",
    filename: "src/lib/booking.ts",
    code: `export async function reschedule(id: string, startsAt: Date) {
  const slot = await findSlot(startsAt);
  if (!slot) throw new SlotUnavailableError(startsAt);

  // A reschedule is a move, not a delete-and-create: the id is the patient's
  // reference and it appears on their confirmation email.
  return db.appointment.update({
    where: { id },
    data: { startsAt, clinicianId: slot.clinicianId },
  });
}`,
    caption: "Line numbers and wrapping are both per-block settings — wrapping is on by default, because a horizontally scrolling block silently cuts off on a printed page.",
    showLineNumbers: true,
    wrapLines: true,
  } satisfies CodeSnippetSectionData),

  block("faq", "FAQ", {
    intro: "The four questions we are asked every time.",
    items: [
      { question: "What happens if the scope changes?", answer: "We price the change before starting it. Nothing lands on an invoice you have not already seen." },
      { question: "Who owns the code?", answer: "You do, from the first commit. The repository is in your organisation, not ours." },
      { question: "What if a developer leaves?", answer: "Everything is documented in the repo and at least two people know each area." },
      { question: "Can we take it in-house later?", answer: "Yes — that is what the handover week is for." },
    ],
  } satisfies FaqSectionData),

  block("image", "Image", {
    url: "/gitwork-header.png",
    altText: "Sample image placeholder in the block gallery",
    caption: "Images take a size and an alignment. Alt text is required — a document is read aloud more often than people expect.",
    size: "large",
    alignment: "center",
  } satisfies ImageSectionData),

  block("video_embed", "Video embed", {
    url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    caption: "YouTube, Loom and Vimeo render a player. Anything else falls back to a captioned link — which is also what prints, since a player cannot.",
    aspectRatio: "16:9",
  } satisfies VideoEmbedSectionData),

  block("divider", "Divider", {
    variant: "rule",
  } satisfies DividerSectionData),

  block("timeline", "Timeline", {
    viewMode: "MILESTONE",
  } satisfies TimelineSectionData),

  block("costing", "Costing", {
    currency: "GBP",
    discount: 0,
    taxRate: 20,
    monthlyCostSummary: "£24,000 per month while the team is engaged",
    durationSummary: "12 weeks",
    totalCostLabel: "Total project cost",
    supportingNarrative:
      "Priced by team and duration rather than by feature, because the scope below is what we agreed and the team is what delivers it.",
    paymentScheduleIntro: "Invoiced monthly in arrears against the phases below.",
    paymentTerms: "Net 14 days from invoice date.",
    vatNotice: "All figures exclude VAT, charged at the prevailing rate.",
    ipTransferNotice: "All intellectual property transfers to the client on final payment.",
    teamAllocations: [
      {
        id: "alloc-1",
        teamMemberName: "Lead developer",
        role: "Full-stack",
        techStack: "TypeScript · Next.js · Postgres",
        monthsRequired: 3,
        dayRate: 550,
        monthlyRate: 11000,
        totalCost: 33000,
        included: true,
      },
      {
        id: "alloc-2",
        teamMemberName: "Mobile developer",
        role: "iOS + Android",
        techStack: "Swift · Kotlin",
        monthsRequired: 2,
        dayRate: 500,
        monthlyRate: 10000,
        totalCost: 20000,
        included: true,
      },
    ],
    paymentSchedule: [
      {
        id: "pay-1",
        phaseLabel: "Discovery + design",
        phaseDuration: "5 weeks",
        action: "Invoice on kickoff",
        periodCovered: "Weeks 1–5",
        paymentPercent: 40,
        includedWork: "Interviews, scope, flows and screens.",
        amount: 21200,
      },
      {
        id: "pay-2",
        phaseLabel: "Build + handover",
        phaseDuration: "7 weeks",
        action: "Invoice on delivery",
        periodCovered: "Weeks 6–12",
        paymentPercent: 60,
        includedWork: "Build, testing, deployment, runbook and training.",
        amount: 31800,
      },
    ],
    additionalNotes: [
      "Third-party costs (SMS, hosting) are billed at cost and listed separately.",
      "Any scope change is quoted and approved before work starts on it.",
    ],
  } satisfies CostingSectionData),

  block("pricing_tiers", "Pricing tiers", {
    intro: "Ongoing support, once the build is live. Cancel with 30 days' notice.",
    tiers: [
      {
        name: "Essential",
        price: "£1,200",
        cadence: "per month",
        tagline: "Keep the lights on.",
        features: ["Business-hours support", "Security patches", "Uptime monitoring"],
      },
      {
        name: "Standard",
        price: "£2,800",
        cadence: "per month",
        tagline: "Keep it moving.",
        features: ["Everything in Essential", "2 developer days a month", "Quarterly roadmap review"],
        highlighted: true,
        badgeLabel: "Most chosen",
      },
      {
        name: "Extended",
        price: "£5,500",
        cadence: "per month",
        tagline: "Keep building.",
        features: ["Everything in Standard", "5 developer days a month", "Named lead developer"],
      },
    ],
    style: "recommended",
  } satisfies PricingTiersSectionData),

  block("assumptions", "Assumptions", {
    items: [
      "Content and imagery are supplied by you before build starts.",
      "One round of consolidated feedback per deliverable.",
      "The existing patient record system exposes a documented API.",
      "Sign-off comes from a single named decision-maker.",
    ],
  } satisfies ListSectionData),

  block("out_of_scope", "Out of scope", {
    items: [
      "Migration of historical appointments older than 24 months",
      "Native tablet layouts",
      "Clinical decision support of any kind",
      "Ongoing content authoring",
    ],
  } satisfies ListSectionData),

  block("parties", "Parties", {
    intro: "This agreement is between the following parties.",
    parties: [
      {
        id: "party-1",
        name: "Gitwork Ltd",
        role: "Service Provider",
        organization: "Gitwork Ltd",
        email: "dan@gitwork.co.uk",
        signatureRequired: true,
        definedTerm: "the Supplier",
        details: ["Registered in England and Wales", "Company no. 00000000"],
      },
      {
        id: "party-2",
        name: CLIENT,
        role: "Customer",
        organization: `${CLIENT} Ltd`,
        email: "ops@northwind.example",
        signatureRequired: true,
        definedTerm: "the Customer",
      },
    ],
  } satisfies PartiesSectionData),

  block("service_tiers", "Service tiers", {
    intro: "Support is delivered at one of the tiers below, as stated in the order form.",
    tiers: [
      {
        id: "tier-1",
        name: "Standard",
        services: "Bug fixes, security patches, uptime monitoring.",
        uptimeTarget: "99.5%",
        supportHours: "Mon–Fri 09:00–18:00 UK",
      },
      {
        id: "tier-2",
        name: "Premium",
        services: "Everything in Standard, plus out-of-hours cover for P1 incidents.",
        uptimeTarget: "99.9%",
        supportHours: "24/7 for P1, Mon–Fri 09:00–18:00 UK otherwise",
      },
    ],
  } satisfies ServiceTiersSectionData),

  block("response_times", "Response times", {
    intro: "Measured from the time a ticket is raised in the agreed channel.",
    priorities: [
      {
        id: "pri-1",
        priority: "P1 — Critical",
        definition: "The service is unavailable, or patient bookings cannot be taken.",
        firstResponse: "Within 1 business hour",
        resolution: "Within 4 business hours",
      },
      {
        id: "pri-2",
        priority: "P2 — High",
        definition: "A major function is degraded, with no workaround.",
        firstResponse: "Within 4 business hours",
        resolution: "Within 2 business days",
      },
      {
        id: "pri-3",
        priority: "P3 — Normal",
        definition: "A minor fault, or a fault with a workaround.",
        firstResponse: "Within 1 business day",
        resolution: "Next scheduled release",
      },
    ],
  } satisfies ResponseTimesSectionData),

  block("escalation", "Escalation", {
    intro: "If a response time is missed, escalate in this order.",
    levels: [
      {
        id: "esc-1",
        level: 1,
        contact: "Account Manager",
        timeframe: "After the first-response target is missed",
        criteria: "Any priority.",
      },
      {
        id: "esc-2",
        level: 2,
        contact: "Delivery Lead",
        timeframe: "After 4 hours without a substantive update",
        criteria: "P1 and P2 only.",
      },
      {
        id: "esc-3",
        level: 3,
        contact: "Founder",
        timeframe: "After 1 business day on an unresolved P1",
        criteria: "P1 only.",
      },
    ],
  } satisfies EscalationSectionData),

  block("exclusions", "Exclusions", {
    intro: "The service levels above do not apply in the following circumstances.",
    items: [
      {
        id: "exc-1",
        exclusion: "Scheduled maintenance",
        rationale: "Announced at least 5 business days in advance and run outside business hours.",
      },
      {
        id: "exc-2",
        exclusion: "Third-party outages",
        rationale: "We cannot commit to a target we do not control; we will keep you informed throughout.",
      },
      {
        id: "exc-3",
        exclusion: "Changes made outside the agreed process",
        rationale: "A deployment we did not make is one we cannot support.",
      },
    ],
  } satisfies ExclusionsSectionData),

  block("penalties", "Service credits", {
    intro: "Credits are applied to the following month's invoice, on request.",
    tiers: [
      { id: "pen-1", trigger: "Uptime below 99.5% in a calendar month", credit: "10% of the monthly fee", cap: "—" },
      { id: "pen-2", trigger: "Uptime below 99.0% in a calendar month", credit: "25% of the monthly fee", cap: "—" },
      { id: "pen-3", trigger: "Uptime below 95.0% in a calendar month", credit: "50% of the monthly fee", cap: "Capped at 50%" },
    ],
  } satisfies PenaltiesSectionData),

  block("term", "Term & termination", {
    effectiveDate: "2026-09-01",
    initialTermMonths: 12,
    autoRenew: true,
    renewalTerm: "Successive 12-month periods",
    noticePeriodDays: 60,
    governingLaw: "England and Wales",
    terminationForCause:
      "Either party may terminate immediately on written notice if the other commits a material breach and fails to remedy it within 30 days of being notified.",
  } satisfies TermSectionData),

  block("supporting_links_assets", "Supporting links & assets", {
    notes: "Everything referenced above lives in the shared folder. Links expire 90 days after the document is signed.",
  } satisfies SupportingLinksSectionData),

  block("cta_next_steps", "Call to action", {
    headline: "Ready when you are",
    body: "Sign below and we will book a kickoff for the following Monday. If anything here needs changing first, reply on this document — comments land with us straight away.",
    style: "contact",
    contact: { name: "Dan Lindsay", role: "Founder", email: "dan@gitwork.co.uk" },
    buttonLabel: "Book a kickoff call",
    buttonUrl: "https://gitwork.co.uk",
    legalNote: "This document is an offer, open for 30 days from the date on the cover.",
  } satisfies CtaSectionData),

  block("signatures", "Signatures", {
    intro: "Signed by the duly authorised representatives of each party.",
    blocks: [
      {
        id: "sig-1",
        partyName: "Gitwork Ltd",
        signatoryName: "Dan Lindsay",
        signatoryRole: "Founder",
        signatoryEmail: "dan@gitwork.co.uk",
        signatureDate: "",
      },
      {
        id: "sig-2",
        partyName: `${CLIENT} Ltd`,
        signatoryName: "",
        signatoryRole: "Director",
        signatoryEmail: "ops@northwind.example",
        signatureDate: "",
      },
    ],
    note: "This block shows who signs. Collecting a signature is done from the Signatures tab.",
  } satisfies SignaturesSectionData),

  block("signoff_footer", "Sign-off footer", {
    preparedBy: "Dan Lindsay",
    team: "Gitwork",
    contactDetails: "dan@gitwork.co.uk · gitwork.co.uk",
    footerNote: "Sample document generated by the block gallery. Not a real offer.",
    showBrandingBlock: true,
    signatureName: "Dan Lindsay",
    signatureDate: "2026-08-05",
  } satisfies SignoffFooterSectionData),
];

/**
 * Cost line items and timeline phases live on the DOCUMENT, not on the block.
 *
 * `costing` renders `proposal.costLineItems` and `timeline` renders `proposal.timelinePhases` —
 * their own `data` holds only the presentation settings around them. Seed a gallery without these
 * and those two blocks come out blank, which is exactly the kind of quietly-incomplete gallery
 * this file is supposed to prevent.
 */
export const BLOCK_GALLERY_COSTS: CostLineItemInput[] = [
  {
    category: "Discovery",
    itemName: "Discovery and scope",
    description: "Interviews, a walk-through of the current process, and a written scope.",
    quantity: 2,
    unitCost: 5500,
    subtotal: 11000,
    costKind: "ONE_OFF",
    sortOrder: 0,
  },
  {
    category: "Design",
    itemName: "Product design",
    description: "Flows first, then screens. Reviewed weekly.",
    quantity: 3,
    unitCost: 5000,
    subtotal: 15000,
    costKind: "ONE_OFF",
    sortOrder: 1,
  },
  {
    category: "Build",
    itemName: "Engineering",
    description: "Two-week sprints, each ending in something you can click.",
    quantity: 6,
    unitCost: 4000,
    subtotal: 24000,
    costKind: "ONE_OFF",
    sortOrder: 2,
  },
  {
    category: "Support",
    itemName: "Standard support",
    description: "Business-hours cover once the build is live.",
    quantity: 1,
    unitCost: 2800,
    subtotal: 2800,
    costKind: "RECURRING",
    sortOrder: 3,
  },
];

export const BLOCK_GALLERY_PHASES: TimelinePhaseInput[] = [
  {
    name: "Discovery",
    duration: "2 weeks",
    summary: "Understand the current process before changing any of it.",
    deliverables: ["Written scope", "Prioritised backlog", "Risk register"],
    sortOrder: 0,
    viewMode: "MILESTONE",
  },
  {
    name: "Design",
    duration: "3 weeks",
    summary: "Flows, then screens, reviewed weekly.",
    deliverables: ["User flows", "Clickable prototype", "Design system"],
    sortOrder: 1,
    viewMode: "MILESTONE",
  },
  {
    name: "Build",
    duration: "6 weeks",
    summary: "Three sprints, each ending in working software.",
    deliverables: ["Patient booking", "Front desk", "Admin and reporting"],
    sortOrder: 2,
    viewMode: "MILESTONE",
  },
  {
    name: "Handover",
    duration: "1 week",
    summary: "Leave the team able to run it without us.",
    deliverables: ["Runbook", "Two training sessions", "Repository transfer"],
    sortOrder: 3,
    viewMode: "MILESTONE",
  },
];

/**
 * The gallery as sections, in order.
 *
 * `description` is the block's registry key on purpose — it is what the outline shows, and it is
 * how you get from "this looks wrong" to the file that draws it.
 */
export function buildBlockGallery(): ProposalSection[] {
  return ENTRIES.map((entry, index) => ({
    key: entry.key,
    title: entry.title,
    description: entry.key,
    sortOrder: index,
    isVisible: true,
    data: entry.data,
  }));
}

/** Exposed for the coverage test — the keys this gallery claims to cover. */
export function galleryKeys(): SectionKey[] {
  return ENTRIES.map((entry) => entry.key);
}
