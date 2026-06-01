export type SiteLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type ProductPage = {
  slug: "docs" | "proof" | "codeclear";
  name: string;
  eyebrow: string;
  summary: string;
  heroTitle: string;
  heroCopy: string;
  audience: string;
  primaryCta: SiteLink;
  secondaryCta: SiteLink;
  quickHits: string[];
  featureCards: Array<{ title: string; copy: string }>;
  workflow: Array<{ title: string; copy: string }>;
  outcomes: string[];
  metric: {
    value: string;
    label: string;
  };
};

export const siteNavigation: SiteLink[] = [
  { label: "Products", href: "/products" },
  { label: "Pricing", href: "/pricing" },
  { label: "Customers", href: "/customers" },
  { label: "Company", href: "/company" },
];

export const headerActions: SiteLink[] = [
  { label: "Open Platform", href: "/app/proposals" },
  { label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true },
];

export const partnerLogos = [
  "ANS",
  "Uber",
  "Venturi",
  "Same Day Smile",
  "GigPig",
  "LGB Medical",
  "Campfire",
  "Activate",
];

export const deliveryStats = [
  { value: "50+", label: "Software Engineers" },
  { value: "80+", label: "Projects Delivered" },
  { value: "92%", label: "CSAT Score" },
  { value: "14 Days", label: "Typical Onboarding Window" },
];

export const serviceOffers = [
  {
    title: "Embedded Developers",
    copy: "Senior developers who join your team, work UK hours, and slot into your delivery rhythm without a long hiring cycle.",
    points: ["Zero-term daily rate available", "Monthly retainers for steady velocity", "Dedicated PM support when needed"],
  },
  {
    title: "Product Delivery",
    copy: "A UK-led delivery team that can own discovery, scope, design, engineering, and launch when you need outcomes, not just hands.",
    points: ["Wireframe to release", "Milestone-based commercials", "One delivery partner across the project"],
  },
  {
    title: "Hiring Signal",
    copy: "Code helps hiring companies frame the work properly and surface stronger-fit developers before the shortlist call.",
    points: ["Structured brief capture", "Higher-signal matching", "Agency-led review when you want it"],
  },
];

export const pricingPlans = [
  {
    name: "Daily Rate",
    price: "£350",
    period: "/day",
    description: "Flexible developer hire with zero term commitment.",
    highlight: false,
    cta: { label: "Discuss Plan", href: "https://calendly.com/gitworkgroup/30min", external: true },
    features: [
      "1 full stack developer",
      "Working UK hours",
      "Dedicated project manager",
      "Ideal for focused delivery sprints",
    ],
  },
  {
    name: "Monthly Retainer",
    price: "£4,000",
    period: "/month",
    description: "Consistent delivery capacity for ongoing product work.",
    highlight: true,
    cta: { label: "Discuss Plan", href: "https://calendly.com/gitworkgroup/30min", external: true },
    features: [
      "1 full stack developer",
      "3-month commitment",
      "Working UK hours",
      "Regular review cadence with Gitwork",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Scaled teams and delivery leadership for larger builds.",
    highlight: false,
    cta: { label: "Talk to Us", href: "https://calendly.com/gitworkgroup/30min", external: true },
    features: [
      "3+ full stack developers",
      "Custom working hours",
      "Full-time product manager included",
      "Tailored commercial structure",
    ],
  },
];

export const customerStories = [
  {
    company: "GD Online",
    author: "Managing Director",
    quote:
      "After taking over a business with an existing development team, we needed deeper expertise quickly. Gitwork understood the product fast and became part of the team.",
    impact: "Stabilised an ageing platform and expanded delivery capacity after acquisition.",
  },
  {
    company: "Freeway",
    author: "Founder & CEO",
    quote:
      "Gitwork made a difficult UK brand project feel straightforward. They moved quickly, communicated clearly, and delivered quality that would have been hard to source locally.",
    impact: "Delivered an industry-first digital journey for a major UK-facing project.",
  },
  {
    company: "Gaia Learning",
    author: "Learning Director",
    quote:
      "Their responsiveness and technical depth changed what we could offer learners. Gitwork helped turn the product vision into a platform we were proud to launch.",
    impact: "Built a stronger e-learning platform with better learner experience and delivery confidence.",
  },
  {
    company: "InHaus",
    author: "CEO",
    quote:
      "Gitwork took pressure out of recruitment and delivery at the same time. The developers were strong, reliable, and easy to work with.",
    impact: "Reduced hiring overhead while keeping product execution moving.",
  },
];

export const faqs = [
  {
    question: "How quickly can Gitwork start?",
    answer:
      "Most engagements begin within 14 days. We align on scope first, then match the right delivery shape, developer profile, or squad around that work.",
  },
  {
    question: "Do you only work with startups?",
    answer:
      "No. Gitwork supports in-house product teams, agencies, and established businesses that need embedded capacity or end-to-end delivery ownership.",
  },
  {
    question: "What is the difference between Docs, Proof, and Code?",
    answer:
      "Docs structures briefs and commercial scope, Proof turns source material into stronger proposals, and Code helps hiring teams frame demand and surface better-fit developer matches.",
  },
  {
    question: "Can Gitwork take a project from brief to launch?",
    answer:
      "Yes. Gitwork can own discovery, planning, design, engineering, and launch as a UK-led delivery partner, or slot into your existing team where you need support most.",
  },
  {
    question: "Do you offer fixed packages and flexible engagements?",
    answer:
      "Both. There is a daily rate for short, flexible needs, a monthly retainer for sustained capacity, and an enterprise option for larger, multi-role delivery.",
  },
];

export const companyValues = [
  {
    title: "Sharper intake",
    copy: "Every delivery motion starts with a better brief. Gitwork uses its own tools to reduce ambiguity before work starts.",
  },
  {
    title: "Calmer delivery",
    copy: "Clients get a UK-facing team, visible progress, and clearer operating rhythms instead of ad hoc agency chaos.",
  },
  {
    title: "Higher-signal matching",
    copy: "When hiring support is needed, Gitwork uses Code to frame demand and improve match quality before interviews begin.",
  },
];

export const deliveryTimeline = [
  {
    title: "Frame the work",
    copy: "Capture the brief, constraints, budget shape, and delivery goals so everyone is solving the same problem.",
  },
  {
    title: "Recommend the shape",
    copy: "Choose the right mix of embedded developers, fixed delivery, or product support rather than forcing one model onto every client.",
  },
  {
    title: "Ship with rhythm",
    copy: "Run the work through structured proposals, milestone reviews, and a clearer operating cadence from kickoff to launch.",
  },
];

export const products: ProductPage[] = [
  {
    slug: "docs",
    name: "Docs",
    eyebrow: "Structured briefs",
    summary: "Turn scattered discovery notes into clearer project documents, commercial scope, and client-ready proposals.",
    heroTitle: "Scope product work before the chaos starts.",
    heroCopy:
      "Docs is Gitwork’s front-door system for turning raw project inputs into structured briefs, commercial framing, and cleaner client conversations.",
    audience: "For agencies, founders, and product teams that need a sharper scope before delivery begins.",
    primaryCta: { label: "Open Docs", href: "/app/proposals" },
    secondaryCta: { label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true },
    quickHits: [
      "Capture discovery and commercial detail in one place",
      "Generate clearer proposal structures",
      "Reduce back-and-forth before sign-off",
    ],
    featureCards: [
      {
        title: "Brief structure",
        copy: "Keep goals, deliverables, risks, and assumptions aligned instead of spreading them across calls and notes.",
      },
      {
        title: "Commercial framing",
        copy: "Build proposals against real delivery shape, timeline logic, and clearer pricing conversations.",
      },
      {
        title: "Reusable system",
        copy: "Bring repeatability to intake so every new opportunity starts from a stronger baseline.",
      },
    ],
    workflow: [
      { title: "Collect the brief", copy: "Bring in raw scope, objectives, and context from calls, forms, or notes." },
      { title: "Shape the proposal", copy: "Turn that source material into a document structure the client can actually understand." },
      { title: "Move into delivery", copy: "Carry the same structured assumptions into staffing, timelines, and execution." },
    ],
    outcomes: ["Fewer scope gaps", "Cleaner proposal reviews", "Better commercial confidence"],
    metric: { value: "1 System", label: "for brief capture, scope, and proposal prep" },
  },
  {
    slug: "proof",
    name: "Proof",
    eyebrow: "Proposal intelligence",
    summary: "Analyse source material, sharpen delivery recommendations, and turn vague inputs into stronger project proposals.",
    heroTitle: "Convert source material into delivery-ready proposals.",
    heroCopy:
      "Proof helps Gitwork teams interrogate the brief, surface what matters, and structure proposals around clearer delivery choices.",
    audience: "For teams that want higher-quality proposal work without slowing down their sales or delivery process.",
    primaryCta: { label: "Open Proof", href: "/app/proof" },
    secondaryCta: { label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true },
    quickHits: [
      "Analyse documents and source context quickly",
      "Recommend delivery shape with more confidence",
      "Support better handoff into project kickoff",
    ],
    featureCards: [
      {
        title: "Source analysis",
        copy: "Bring PDFs, notes, and background material together so proposal decisions are grounded in actual evidence.",
      },
      {
        title: "Delivery framing",
        copy: "Use Proof to shape recommendations around timeline, team structure, and risk instead of intuition alone.",
      },
      {
        title: "Stronger handoff",
        copy: "Carry clearer rationale from proposal stage into the build itself, reducing reinvention after sign-off.",
      },
    ],
    workflow: [
      { title: "Load the evidence", copy: "Bring in the source documents that normally live in disconnected threads and folders." },
      { title: "Interrogate the brief", copy: "Highlight unknowns, dependencies, and scope pressure before the proposal gets written." },
      { title: "Export the recommendation", copy: "Turn analysis into a clearer delivery plan that the client and team can act on." },
    ],
    outcomes: ["Better proposal quality", "Faster turnaround", "Clearer delivery rationale"],
    metric: { value: "Fewer Rewrites", label: "when the brief has already been properly interrogated" },
  },
  {
    slug: "codeclear",
    name: "Code",
    eyebrow: "Hiring signal",
    summary: "Give hiring companies a better public-facing way to frame demand and surface stronger-fit Gitwork developer matches.",
    heroTitle: "A sharper front door for hiring companies.",
    heroCopy:
      "Code helps companies describe the work, timeframe, and delivery shape, then moves the strongest-fit matches into a proper Gitwork review.",
    audience: "For companies that want more signal before interviews and for Gitwork teams that want better framed hiring demand.",
    primaryCta: { label: "Open Code", href: "/app/codeclear" },
    secondaryCta: { label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true },
    quickHits: [
      "Capture the role and project need properly",
      "Surface stronger-fit developers faster",
      "Turn a shortlist into an agency-led recommendation",
    ],
    featureCards: [
      {
        title: "Public intake",
        copy: "Let a hiring team explain the build they need in plain language instead of starting with a weak role description.",
      },
      {
        title: "Better-fit shortlists",
        copy: "Combine stack fit, availability, and delivery context to present more useful matches early.",
      },
      {
        title: "Agency review layer",
        copy: "Code does not stop at developer discovery. Gitwork can step in with staffing guidance and delivery ownership.",
      },
    ],
    workflow: [
      { title: "Describe the project", copy: "Capture the work type, timeline, team shape, and delivery expectations." },
      { title: "Review the shortlist", copy: "Present the best-fit options in a way that is easier for hiring teams to compare." },
      { title: "Move into engagement", copy: "Take the shortlist into Gitwork-led review, delivery planning, and staffing." },
    ],
    outcomes: ["Stronger briefs", "Better match quality", "Faster first-call clarity"],
    metric: { value: "3 Top Matches", label: "highlighted before the shortlist conversation" },
  },
];

export const footerColumns: Array<{ title: string; links: SiteLink[] }> = [
  {
    title: "Products",
    links: products.map((product) => ({ label: product.name, href: `/products/${product.slug}` })),
  },
  {
    title: "Explore",
    links: [
      { label: "Products", href: "/products" },
      { label: "Pricing", href: "/pricing" },
      { label: "Customers", href: "/customers" },
      { label: "Company", href: "/company" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Open Platform", href: "/app/proposals" },
      { label: "Open Proof", href: "/app/proof" },
      { label: "Open Code", href: "/app/codeclear" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true },
      { label: "Gitwork.co.uk", href: "https://www.gitwork.co.uk/", external: true },
    ],
  },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
