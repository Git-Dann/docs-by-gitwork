/**
 * Demo scan seed — run with:  npx tsx prisma/seed-demo.ts
 *
 * Creates a completed Pulse scan for "Estato" — a UK property-tech SaaS —
 * including full agent data, AI analysis, discovery kit, and 90+ checks.
 * Safe to re-run (idempotent by projectName + inputGithubRepo).
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_WORKSPACE_SLUG = "gitwork";

// ─────────────────────────────────────────────────────────────────────────────

const LLM_ANALYSIS = {
  projectClassification: {
    type: "Property-Tech SaaS",
    subtype: "UK Landlord & Tenancy Management Platform",
    confidence: "HIGH",
    signals: [
      "Domain name and copy reference 'landlords', 'tenancies', and 'rent collection'",
      "Stripe integration detected — subscription billing model",
      "GOV.UK Notify API calls present in codebase (Right to Rent checks)",
      "GDPR consent banner partially implemented",
      "Supabase Row Level Security policies visible in schema migration files",
    ],
    verticalInsights: [
      "UK property-tech is heavily regulated — ICO registration, Right to Rent compliance, and deposit protection scheme integrations are expected by enterprise landlords",
      "Larger letting agents evaluate platforms on their ability to white-label — no white-labelling support is a blocker for agency deals worth 50–200+ seats",
      "Churn in this vertical is driven by integrations (Rightmove, Zoopla, Open Banking rent verification) — platforms without these lose accounts to competitors who have them",
      "GDPR exposure is acute: tenant personal data (income, ID documents, employment history) makes a data breach exceptionally damaging",
      "The move to Section 21 abolition creates urgency for landlords to digitise compliance workflows — this is a strong near-term sales angle",
    ],
  },
  executiveSummary:
    "Estato is a credible early-stage property-tech SaaS with a solid Next.js / Supabase stack and a clear product direction, currently serving a small base of private landlords and small letting agencies. At a health score of 63/100, the platform has sound foundations but carries significant security and compliance debt that would block growth into the SME letting-agency market. Critical gaps include missing security headers, no server-side error monitoring, absent GDPR data processing documentation, and a Stripe webhook handler with no idempotency protection — the combination of which represents meaningful legal and operational risk.",
  healthNarrative:
    "The infrastructure scores well on fundamentals: HTTPS is enforced, the platform is deployed on Vercel with a valid SSL certificate, response times are acceptable, and basic SEO signals are present. However, the security posture degrades sharply on inspection — there is no Content Security Policy, no HSTS header, and no subresource integrity on third-party scripts. The codebase contains 3 known open-source vulnerabilities (1 high severity in jsonwebtoken, 2 medium in undici), branch protection is disabled on main, and fewer than 1 in 5 pull requests receive a review before merging. Lighthouse performance is 58 — driven by a 3.8s LCP and 0.18 CLS — which will affect conversion on paid acquisition channels. The property-tech market is trust-driven: landlords and tenants both expect visible compliance signals (privacy policy, GDPR notices, Right to Rent documentation) that are currently incomplete.",
  strengths: [
    {
      title: "Modern, scalable stack",
      detail:
        "Next.js 15 App Router with Supabase and Vercel is an excellent foundation — edge-deployable, real-time capable, and well-supported. The architecture supports growth to thousands of users without a rewrite.",
    },
    {
      title: "Payments already live",
      detail:
        "Stripe subscription billing is integrated and processing real transactions. This is the hardest milestone for early-stage SaaS — it's done.",
    },
    {
      title: "GOV.UK API integrations",
      detail:
        "GOV.UK Notify integration for Right to Rent notifications is a genuine differentiator — most competitors use manual email flows. This is a strong enterprise buying signal.",
    },
    {
      title: "Core product velocity",
      detail:
        "3.5 commits per week with 2 active contributors shows a healthy, active development pace. The feature set is moving forward.",
    },
  ],
  criticalGaps: [
    {
      category: "Security",
      gap: "No Content Security Policy — XSS attacks can exfiltrate tenant identity documents stored in Supabase Storage",
      impact: "A successful XSS attack on a landlord session would expose all tenants' passports, employment records, and bank statements. ICO fine: up to 4% of annual turnover.",
      urgency: "CRITICAL",
    },
    {
      category: "Security",
      gap: "1 high-severity vulnerability in jsonwebtoken (CVE-2022-23529) — JWT forgery risk in tenant auth flow",
      impact: "An attacker could forge a tenant JWT and access any other tenant's property data, messages, and documents without authentication.",
      urgency: "CRITICAL",
    },
    {
      category: "Compliance",
      gap: "No GDPR Data Processing Agreement (DPA) documentation or Records of Processing Activities (ROPA)",
      impact: "ICO non-compliance. Any letting agency client operating under GDPR is legally required to sign a DPA with all data processors. Without one, they cannot onboard Estato.",
      urgency: "CRITICAL",
    },
    {
      category: "Reliability",
      gap: "Stripe webhook handler has no idempotency key validation — duplicate payment events could trigger double rent allocations",
      impact: "Duplicate webhook processing has already occurred twice (visible in Vercel error logs). At scale this creates incorrect rent ledger entries and tenant disputes.",
      urgency: "HIGH",
    },
    {
      category: "Observability",
      gap: "No application error monitoring (Sentry or equivalent) — errors are invisible until users report them",
      impact: "With no error monitoring, production bugs go undetected for hours or days. The current Vercel runtime log shows 504 timeouts on the payroll run endpoint — nobody has been alerted.",
      urgency: "HIGH",
    },
    {
      category: "Performance",
      gap: "Lighthouse performance score 58 — LCP 3.8s driven by un-optimised hero image and blocking third-party scripts",
      impact: "Sub-60 performance score correlates with 15–20% higher bounce rate on paid channels. Current Google Ads spend is being wasted on traffic that bounces before the page loads.",
      urgency: "HIGH",
    },
    {
      category: "Legal",
      gap: "No cookie consent management platform — GDPR/PECR breach on analytics and marketing pixels",
      impact: "Storing analytics cookies without explicit consent is an ICO enforcement risk. Two UK PropTech companies received enforcement notices for this in 2024.",
      urgency: "HIGH",
    },
    {
      category: "Security",
      gap: "No branch protection on main — any team member can push directly to production",
      impact: "Direct pushes to main have already introduced two regressions in the last month. At letting-agency scale, a bad push affecting rent collection would trigger client churn.",
      urgency: "MEDIUM",
    },
    {
      category: "Infrastructure",
      gap: "No uptime monitoring or status page — clients have no visibility when the platform is degraded",
      impact: "Letting agencies managing multiple landlords need SLA guarantees. The absence of a status page is a blocker for agency contracts above £500/month.",
      urgency: "MEDIUM",
    },
    {
      category: "UX",
      gap: "No onboarding flow — new landlords are dropped into an empty dashboard with no guided setup",
      impact: "Trial-to-paid conversion is directly correlated with time-to-first-value. Without guided onboarding, landlords who sign up don't add their first property and churn within 7 days.",
      urgency: "MEDIUM",
    },
  ],
  buildOpportunities: [
    {
      title: "Open Banking rent verification",
      description:
        "Integrate TrueLayer or Plaid to verify tenant rental payment history directly from bank statements. Letting agencies would pay a premium for automated reference checks that replace manual PDF uploads.",
      estimatedEffort: "L",
      businessValue: "HIGH",
      category: "Integrations",
    },
    {
      title: "Rightmove / Zoopla property listing sync",
      description:
        "Sync property details and availability directly to portals via their API. This removes the biggest manual workflow for letting agents and is the #1 requested feature in the PropTech space.",
      estimatedEffort: "XL",
      businessValue: "HIGH",
      category: "Integrations",
    },
    {
      title: "Automated Section 21 / Section 8 notice generation",
      description:
        "Generate legally compliant eviction notices pre-filled from tenancy data. With Section 21 abolition pending, landlords are anxious — a compliant notice generator is a strong retention driver.",
      estimatedEffort: "M",
      businessValue: "HIGH",
      category: "Legal & Compliance",
    },
    {
      title: "White-label mode for letting agencies",
      description:
        "Allow agencies to brand the tenant portal with their own logo, colours, and domain. Required by any letting agency with more than 3 staff. Unlocks a £200–£800/month tier.",
      estimatedEffort: "L",
      businessValue: "HIGH",
      category: "Platform",
    },
    {
      title: "Maintenance request workflow with contractor assignment",
      description:
        "Allow tenants to raise maintenance tickets, auto-notify landlords, and assign preferred contractors. The current manual process is a major source of support requests.",
      estimatedEffort: "M",
      businessValue: "MEDIUM",
      category: "Core Product",
    },
    {
      title: "Automated rent reminder & arrears escalation sequences",
      description:
        "Send GOV.UK Notify SMS/email reminders at D-3, D-0, and D+3 of rent due date. Automate arrears escalation to letter generation. Reduces average debt recovery time by 60%.",
      estimatedEffort: "S",
      businessValue: "HIGH",
      category: "Automation",
    },
    {
      title: "Deposit protection scheme API integration",
      description:
        "Direct integration with DPS, MyDeposits, or TDS so landlords can register deposits without leaving the platform. Currently requires manual registration — a compliance risk and friction point.",
      estimatedEffort: "M",
      businessValue: "MEDIUM",
      category: "Legal & Compliance",
    },
    {
      title: "Landlord mobile app (React Native)",
      description:
        "Receive maintenance alerts, approve payments, and review tenancy documents from mobile. 68% of private landlords are over 45 and strongly prefer mobile-first experiences for notifications.",
      estimatedEffort: "XL",
      businessValue: "MEDIUM",
      category: "Platform",
    },
  ],
  scalingRoadmap: [
    {
      phase: 1,
      title: "Secure the foundations (0–6 weeks)",
      duration: "6 weeks",
      goals: [
        "Patch CVE-2022-23529 — upgrade jsonwebtoken to 9.0.0+",
        "Implement Content Security Policy with nonce-based inline script allowlist",
        "Add Sentry error monitoring across API routes and client boundary",
        "Fix Stripe webhook idempotency — persist processed event IDs to prevent double-processing",
        "Deploy Cookiebot or Osano for GDPR-compliant cookie consent",
        "Enable branch protection on main with required PR reviews",
        "Draft and publish GDPR DPA template for agency clients",
      ],
    },
    {
      phase: 2,
      title: "Performance & conversion (6–14 weeks)",
      duration: "8 weeks",
      goals: [
        "Resolve LCP to under 2.5s — next/image optimisation and lazy-load third-party scripts",
        "Implement guided onboarding flow: property → tenancy → rent collection in 5 steps",
        "Set up Betterstack or Instatus status page with Vercel integration",
        "Add automated rent reminder sequences via GOV.UK Notify",
        "Integrate deposit protection scheme API (MyDeposits)",
        "Build Section 21 / Section 8 notice generator",
      ],
    },
    {
      phase: 3,
      title: "Agency growth unlock (14–26 weeks)",
      duration: "12 weeks",
      goals: [
        "Build white-label mode — custom domain, branding, email from-address",
        "Integrate TrueLayer for Open Banking tenant referencing",
        "Launch maintenance request workflow with contractor assignment",
        "Implement Rightmove listing sync (phase 1: read-only import)",
        "Build agency billing: per-seat pricing with usage-based invoicing via Stripe",
      ],
    },
    {
      phase: 4,
      title: "Market expansion (26–52 weeks)",
      duration: "6 months",
      goals: [
        "Launch React Native mobile app for landlords",
        "Zoopla and OnTheMarket listing sync",
        "ISO 27001 certification process (required for NHS/local authority housing contracts)",
        "Multi-currency support (Scotland / Northern Ireland rental law differences)",
        "Partner API for mortgage brokers and insurance providers",
      ],
    },
  ],
  techDebt: [
    {
      area: "Authentication",
      description:
        "jsonwebtoken 8.5.1 with CVE-2022-23529 in active use across tenant auth middleware. Upgrade to v9+ required.",
      severity: "HIGH",
    },
    {
      area: "Stripe integration",
      description:
        "Webhook handler at /api/stripe/webhook does not validate idempotency keys. Duplicate events are processed twice — causing ledger corruption at low frequency.",
      severity: "HIGH",
    },
    {
      area: "TypeScript",
      description:
        "47 @ts-ignore comments suppressing type errors, predominantly in the Supabase client layer and API route handlers. Technical debt growing with every feature addition.",
      severity: "MEDIUM",
    },
    {
      area: "Database queries",
      description:
        "Several N+1 query patterns in the tenancy dashboard — loading properties then making per-property requests for tenants and payments. Causes visible slowdown above 20 properties.",
      severity: "MEDIUM",
    },
    {
      area: "Environment variables",
      description:
        "7 environment variables referenced in code that are not documented in .env.example or deployment runbook. New developers cannot run the project locally without asking.",
      severity: "LOW",
    },
  ],
  proposalHook:
    "Estato has the right stack and a real product — but a high-severity auth vulnerability, GDPR gaps, and invisible production errors mean the platform is one security incident away from regulatory action. We can close the critical issues in 6 weeks and position Estato for the agency market in under 6 months.",
  productionReadinessChecklist: [
    { category: "Legal", item: "Privacy Policy", status: "DONE", notes: "Present at /privacy — last updated 8 months ago, may predate UK GDPR amendments" },
    { category: "Legal", item: "Terms of Service", status: "DONE", notes: "Present at /terms" },
    { category: "Legal", item: "Cookie Consent / PECR compliance", status: "MISSING", notes: "No consent management platform — analytics cookies set without explicit consent" },
    { category: "Legal", item: "GDPR Data Processing Agreement", status: "MISSING", notes: "No DPA template for business clients — blocks agency onboarding" },
    { category: "Legal", item: "Refund / Cancellation Policy", status: "PARTIAL", notes: "Mentioned in Terms but no dedicated page with clear process" },
    { category: "Auth", item: "Login / Signup flow", status: "DONE", notes: "Email + password via Supabase Auth" },
    { category: "Auth", item: "Password reset", status: "DONE", notes: "Functional via Supabase magic link" },
    { category: "Auth", item: "Email verification", status: "PARTIAL", notes: "Verification email sent but not enforced — unverified accounts can access platform" },
    { category: "Auth", item: "OAuth / SSO", status: "MISSING", notes: "No Google or Microsoft SSO — required by letting agency IT policies" },
    { category: "Payments", item: "Pricing page", status: "DONE", notes: "Three tiers visible at /pricing" },
    { category: "Payments", item: "Stripe payment processing", status: "DONE", notes: "Live keys, subscription billing functional" },
    { category: "Payments", item: "Billing portal / invoice history", status: "PARTIAL", notes: "Stripe portal linked but not styled — jarring UX break" },
    { category: "Onboarding", item: "Guided setup flow", status: "MISSING", notes: "New users land on empty dashboard with no prompts — high early churn" },
    { category: "Onboarding", item: "Empty state design", status: "MISSING", notes: "No empty states on main dashboard, property list, or tenancy list" },
    { category: "Support", item: "Help centre / FAQ", status: "PARTIAL", notes: "Intercom widget installed but knowledge base not populated (0 articles)" },
    { category: "Trust", item: "About / Company page", status: "DONE", notes: "Present — includes founder bio and company background" },
    { category: "Observability", item: "Error monitoring", status: "MISSING", notes: "No Sentry or equivalent — 504 errors on payroll endpoint undetected" },
    { category: "Observability", item: "Uptime monitoring / status page", status: "MISSING", notes: "No status page — clients cannot see platform health" },
    { category: "Observability", item: "Analytics", status: "DONE", notes: "GA4 installed but firing without consent" },
    { category: "Security", item: "Security headers (CSP, HSTS)", status: "MISSING", notes: "No Content Security Policy, no Strict-Transport-Security" },
  ],
  techStackAnalysis: {
    assessment:
      "The Next.js 15 / Supabase / Vercel combination is an excellent foundation for a UK SaaS in this category — edge-ready, real-time capable, and well-aligned with UK data residency needs (Supabase EU-West region). The main gaps are observability (no Sentry), compliance tooling (no CMP, no DPA workflow), and third-party integrations (Open Banking, portal APIs) that the market expects. The authentication vulnerability is the most pressing issue and should be addressed before any marketing spend is increased.",
    detectedStack: {
      frontend: "Next.js 15 (App Router)",
      backend: "Next.js API Routes + Supabase Edge Functions",
      database: "PostgreSQL via Supabase",
      hosting: "Vercel (Edge Network, EU-West)",
      auth: "Supabase Auth (email/password)",
      payments: "Stripe (subscriptions + webhooks)",
      email: "GOV.UK Notify + Resend",
      storage: "Supabase Storage (tenant documents)",
      caching: null,
      search: null,
      backgroundJobs: null,
      monitoring: "Vercel Analytics (partial)",
      analytics: "Google Analytics 4",
      cicd: "GitHub Actions (basic)",
    },
    recommendations: [
      {
        area: "Error Monitoring",
        current: null,
        recommended: "Sentry",
        reason: "No error monitoring means production failures are invisible until users report them. Sentry Next.js SDK installs in 15 minutes and surfaces the 504 payroll errors immediately.",
        priority: "HIGH",
      },
      {
        area: "Security Headers",
        current: null,
        recommended: "next.config.js headers() + Content Security Policy",
        reason: "CSP prevents XSS attacks from exfiltrating tenant identity documents. HSTS ensures all connections are encrypted. Both are 30-minute implementations.",
        priority: "HIGH",
      },
      {
        area: "Cookie Consent",
        current: null,
        recommended: "Cookiebot or Osano",
        reason: "GDPR/PECR requires explicit consent before setting analytics or marketing cookies. ICO has issued enforcement notices to UK SaaS companies for this specific violation.",
        priority: "HIGH",
      },
      {
        area: "Caching Layer",
        current: null,
        recommended: "Redis via Upstash",
        reason: "Property listings and tenancy dashboards are re-queried on every page load. A Redis cache layer would cut database load by ~60% and resolve the N+1 issues without a full rewrite.",
        priority: "MEDIUM",
      },
      {
        area: "Background Jobs",
        current: null,
        recommended: "Trigger.dev or Inngest",
        reason: "Rent reminders, arrears escalation, and deposit expiry notifications need reliable background scheduling. Cron jobs on Vercel have a 60s execution limit — too short for batch rent processing.",
        priority: "MEDIUM",
      },
      {
        area: "Search",
        current: null,
        recommended: "Algolia or Typesense",
        reason: "Full-text search across properties, tenants, and documents via Postgres ILIKE is slow above 1,000 records. Algolia integration is a 1-day implementation.",
        priority: "LOW",
      },
    ],
    missingForProduction: [
      "Application error monitoring (Sentry)",
      "Cookie consent management platform (GDPR/PECR)",
      "Database connection pooling (PgBouncer via Supabase)",
      "Background job queue for async processing",
      "Redis / caching layer for dashboard queries",
      "Secrets manager (currently using .env files with hardcoded values)",
      "Uptime monitoring and status page",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────

const DISCOVERY_KIT = {
  openingStatement:
    "We ran a full technical audit of Estato last week — we found some strong foundations but also a few things that would surprise you. I'd love to walk you through what we found and understand where the product is headed this year.",
  wowFinding: {
    finding:
      "There's a high-severity JWT vulnerability (CVE-2022-23529) in your tenant authentication flow, and your Stripe webhook handler is processing duplicate events — we can see duplicate payment records in the pattern.",
    impact:
      "The JWT issue means an attacker could forge a tenant token and access any other tenant's identity documents and payment history. The Stripe issue has already created incorrect rent ledger entries twice in the last 30 days.",
  },
  questions: [
    {
      question: "How are you currently handling tenant identity verification — is that still a manual process?",
      context:
        "The GOV.UK Notify integration is impressive, but there's no Open Banking connection for automated rental reference checks. This is consistently the #1 friction point for letting agencies evaluating PropTech platforms.",
      followUp: "What does the current workflow look like when a new tenancy application comes in?",
    },
    {
      question: "What does your typical agency client look like — are they managing 10 properties or 100?",
      context:
        "The platform has no white-label capability, which is a hard blocker for any letting agency with branded client communications. Understanding their scale tells us how urgently this needs to be built.",
      followUp: "Have you lost any agency deals because you couldn't offer white-labelling or SSO?",
    },
    {
      question: "Are you ICO registered, and do you have a GDPR Data Processing Agreement in place for your business clients?",
      context:
        "There's no DPA documentation on the site. Any letting agency operating under GDPR is legally required to have a signed DPA with all data processors before onboarding. This is currently blocking enterprise deals.",
      followUp: "Has any prospect raised GDPR compliance as a concern during sales conversations?",
    },
    {
      question: "How are you getting alerted to production errors right now — are you relying on users to report them?",
      context:
        "Vercel logs show 504 timeouts on the payroll run endpoint, but there's no Sentry or equivalent. These errors are invisible until a landlord contacts support — which means you don't know the true error rate.",
      followUp: "Roughly how much time per week does your team spend on support tickets that turn out to be bugs?",
    },
    {
      question: "What's your current trial-to-paid conversion rate, and where are you seeing people drop off?",
      context:
        "There's no onboarding flow — new users land on an empty dashboard with no guidance. This is the most common cause of sub-10% trial conversion in SaaS, and it's a relatively fast fix.",
      followUp: "Have you done any user interviews with people who signed up and didn't convert?",
    },
    {
      question: "Are you planning to pursue letting agency clients seriously in the next 12 months, or is the focus on private landlords?",
      context:
        "The agency market is 10x the revenue opportunity but requires white-labelling, SSO, and a signed DPA. If agency is the direction, the compliance and platform gaps need to be on the roadmap now.",
      followUp: "What's the largest agency you've had a conversation with, and what did they ask for?",
    },
    {
      question: "With Section 21 being abolished, are you seeing inbound from landlords who want to understand their Section 8 options?",
      context:
        "There's no notice generation feature in the platform. This is a strong near-term sales angle — landlords are anxious and searching for tools that help them navigate the new regime.",
      followUp: "Is that something you've thought about building, or is it outside the current roadmap?",
    },
  ],
  anticipatedObjections: [
    {
      objection: "We're a small team — we can't take on a large engagement right now.",
      response:
        "Completely understand. The security and compliance work doesn't require you to slow down product development — we can work in parallel and deliver Phase 1 in 6 weeks with minimal disruption to your sprint cycle. The JWT fix alone is a one-day task for us.",
    },
    {
      objection: "We were going to fix the security issues ourselves.",
      response:
        "You absolutely could — and the jsonwebtoken upgrade is straightforward. The challenge is the compounding issues: CSP implementation, Stripe idempotency, GDPR DPA drafting, and cookie consent are four separate workstreams. Our value is doing all of them concurrently and getting you to a clean compliance baseline in one go rather than across six months.",
    },
    {
      objection: "We don't have budget for this right now.",
      response:
        "I hear you. Let me frame the risk differently: the high-severity auth vulnerability is a liability that grows with every new tenant who joins the platform. If an ICO enforcement notice lands — and they do land in PropTech — the fine is up to 4% of annual turnover. Our engagement is a fraction of that. We can also structure this as two phases so the upfront commitment is smaller.",
    },
    {
      objection: "We're not sure we need an agency to do this — can't we just use a security scanner?",
      response:
        "Automated scanners will find the CVE — they won't architect the CSP without breaking your GOV.UK Notify iframes, draft a GDPR-compliant DPA that your agency clients will actually sign, or fix the Stripe idempotency without breaking your existing rent ledger logic. The value is the implementation, not the finding.",
    },
    {
      objection: "We're in the middle of a fundraise — bad timing.",
      response:
        "This is actually ideal timing. Investors doing technical due diligence will find the auth vulnerability and the compliance gaps. Having a remediation roadmap in place — or ideally Phase 1 already complete — turns a red flag into evidence of a mature founding team. We can compress Phase 1 to 4 weeks if needed.",
    },
  ],
  pricingAnchor: {
    low: 8500,
    high: 22000,
    rationale:
      "Phase 1 (security + compliance foundations, 6 weeks) sits at £8,500–£12,000 based on 4 critical gaps and the GDPR legal workstream. Full Phase 1 + 2 (including onboarding, performance, and status page) runs £18,000–£22,000. If they want the agency unlock (white-label + Open Banking) the full programme is a separate conversation — likely £35,000–£55,000 over 6 months.",
  },
  talkingPoints: [
    "Health score 63/100 — credible product, but security and compliance gaps block the agency market",
    "1 high-severity CVE in auth + 2 medium — patch is straightforward but needs doing before marketing ramp",
    "No Sentry = blind in production. 504 errors on payroll endpoint currently unmonitored",
    "GDPR DPA gap is the single biggest blocker for letting agency deals above £500/month",
    "Section 21 abolition creates urgency — Section 8 notice generator is a fast win with strong retention value",
    "Onboarding flow + empty states would likely move trial conversion 8–15% on its own",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const AGENT_DATA = {
  codeInsights: {
    vulnerabilities: [
      {
        severity: "HIGH",
        packageName: "jsonwebtoken",
        description:
          "CVE-2022-23529 — improper validation of algorithm in jwt.verify() allows an attacker to forge tokens with a crafted public key. Affects versions < 9.0.0.",
      },
      {
        severity: "MEDIUM",
        packageName: "undici",
        description:
          "CVE-2023-45143 — cookie header not cleared on cross-origin redirect, potentially leaking session tokens to attacker-controlled domains.",
      },
      {
        severity: "MEDIUM",
        packageName: "undici",
        description:
          "CVE-2023-23936 — CRLF injection via hostname in undici fetch, allowing header injection in server-side API calls.",
      },
    ],
    branchProtected: false,
    requiresReviews: false,
    prReviewRate: 0.19,
    commitVelocity: 3.5,
    uniqueContributors: 2,
    homepageUrl: "https://app.estato.co.uk",
  },
  deployInsights: {
    platform: "vercel",
    recentDeployments: 8,
    failedDeployments: 1,
    avgBuildMs: 54_000,
    buildWarnings: [
      "47 TypeScript errors suppressed via @ts-ignore (supabase client layer, API routes)",
      "next/image: missing width/height on 6 instances — layout shift contributing to CLS 0.18",
      "Dynamic import() used without React.Suspense on 3 dashboard components — hydration mismatch risk",
      "ESLint: 'no-console' violation on 14 files — console.log statements left in production build",
    ],
    recentErrorPatterns: [
      "POST /api/payroll/run → 504 Gateway Timeout (3 occurrences, avg 62s duration — exceeds Vercel 60s limit)",
      "POST /api/stripe/webhook → duplicate idempotency processing (2 occurrences — same event_id processed twice)",
      "GET /api/tenancies/[id]/documents → 403 Forbidden for 12 requests — RLS policy mismatch on document bucket",
    ],
  },
  browserInsights: {
    performanceScore: 58,
    accessibilityScore: 71,
    seoScore: 84,
    bestPracticesScore: 74,
    lcp: 3800,
    cls: 0.18,
    fcp: 2100,
    tbt: 420,
    cruxCategory: "NEEDS_IMPROVEMENT",
  },
};

// ─────────────────────────────────────────────────────────────────────────────

const CHECKS: Array<{
  category: string;
  checkKey: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
  detail?: string;
  evidence?: string;
}> = [
  // ── Infrastructure ───────────────────────────────────────────────────────
  { category: "Infrastructure", checkKey: "infra_https", label: "HTTPS enforced", status: "PASS", detail: "Site redirects HTTP to HTTPS" },
  { category: "Infrastructure", checkKey: "infra_ssl_valid", label: "SSL certificate valid", status: "PASS", detail: "Certificate valid until 2026-02-14 (Let's Encrypt via Vercel)" },
  { category: "Infrastructure", checkKey: "infra_response_time", label: "Response time < 2s", status: "PASS", detail: "218ms average (Vercel Edge, EU-West)" },
  { category: "Infrastructure", checkKey: "infra_404_handling", label: "Custom 404 page", status: "PASS", detail: "Returns branded 404 with navigation" },
  { category: "Infrastructure", checkKey: "infra_www_redirect", label: "www redirect configured", status: "PASS", detail: "www.estato.co.uk → estato.co.uk" },
  { category: "Infrastructure", checkKey: "infra_compression", label: "Response compression enabled", status: "PASS", detail: "gzip/brotli encoding on all responses" },
  { category: "Infrastructure", checkKey: "infra_http2", label: "HTTP/2 protocol", status: "PASS", detail: "h2 via Vercel Edge" },
  { category: "Infrastructure", checkKey: "infra_uptime_monitor", label: "Uptime monitoring configured", status: "FAIL", detail: "No uptime monitoring detected. No status page at /status or status.estato.co.uk" },
  { category: "Infrastructure", checkKey: "infra_status_page", label: "Public status page", status: "FAIL", detail: "Letting agency clients expect a public status page to track incidents" },
  { category: "Infrastructure", checkKey: "infra_cdn", label: "CDN configured", status: "PASS", detail: "Vercel Edge Network — 16 global PoPs" },
  { category: "Infrastructure", checkKey: "infra_server_header_obscured", label: "Server header obscured", status: "PASS", detail: "No server version disclosure" },

  // ── Security ─────────────────────────────────────────────────────────────
  { category: "Security", checkKey: "sec_csp", label: "Content Security Policy header", status: "FAIL", detail: "No CSP header. XSS attacks can exfiltrate tenant identity documents from Supabase Storage.", evidence: "curl -I https://app.estato.co.uk — content-security-policy: not present" },
  { category: "Security", checkKey: "sec_hsts", label: "HTTP Strict Transport Security", status: "FAIL", detail: "No HSTS header — browsers may connect over HTTP before redirect", evidence: "strict-transport-security: not present" },
  { category: "Security", checkKey: "sec_x_frame", label: "X-Frame-Options / frame-ancestors", status: "FAIL", detail: "No clickjacking protection — login form can be embedded in an iframe" },
  { category: "Security", checkKey: "sec_x_content_type", label: "X-Content-Type-Options", status: "FAIL", detail: "Missing nosniff header — MIME type sniffing attacks possible" },
  { category: "Security", checkKey: "sec_referrer_policy", label: "Referrer-Policy header", status: "WARN", detail: "No Referrer-Policy — tenant URLs may leak via referrer to third-party analytics" },
  { category: "Security", checkKey: "sec_permissions_policy", label: "Permissions-Policy header", status: "FAIL", detail: "No Permissions-Policy — third-party scripts can access camera/mic/location APIs" },
  { category: "Security", checkKey: "sec_sri", label: "Subresource Integrity on external scripts", status: "FAIL", detail: "Intercom, GA4, and Stripe.js loaded without integrity hashes" },
  { category: "Security", checkKey: "sec_cve_high", label: "No high-severity CVEs in dependencies", status: "FAIL", detail: "jsonwebtoken 8.5.1 — CVE-2022-23529 (HIGH): JWT forgery via crafted public key", evidence: "package.json: \"jsonwebtoken\": \"^8.5.1\"" },
  { category: "Security", checkKey: "sec_cve_medium", label: "No medium-severity CVEs in dependencies", status: "FAIL", detail: "2 medium-severity CVEs in undici (HTTP client): CVE-2023-45143, CVE-2023-23936", evidence: "package-lock.json: undici@5.22.1" },
  { category: "Security", checkKey: "sec_branch_protection", label: "Branch protection on main", status: "FAIL", detail: "No branch protection — team members can push directly to production without review" },
  { category: "Security", checkKey: "sec_pr_reviews", label: "PR review culture (>50%)", status: "FAIL", detail: "Only 19% of merged PRs have at least one review. Last 4 direct pushes to main occurred in the past 2 weeks." },
  { category: "Security", checkKey: "sec_security_txt", label: "security.txt present", status: "FAIL", detail: "No /.well-known/security.txt — no responsible disclosure contact for security researchers" },
  { category: "Security", checkKey: "sec_cors", label: "CORS policy appropriate", status: "PASS", detail: "Access-Control-Allow-Origin scoped to allowed origins" },
  { category: "Security", checkKey: "sec_cookie_secure", label: "Cookies set with Secure flag", status: "PASS", detail: "Session cookies have Secure; HttpOnly flags" },

  // ── Performance ──────────────────────────────────────────────────────────
  { category: "Performance", checkKey: "perf_lcp", label: "LCP < 2.5s (Lighthouse)", status: "FAIL", detail: "LCP 3.8s — NEEDS IMPROVEMENT. Hero image not using next/image optimisation, render-blocking Intercom script", evidence: "Lighthouse LCP: 3800ms (threshold: 2500ms)" },
  { category: "Performance", checkKey: "perf_cls", label: "CLS < 0.1 (Lighthouse)", status: "FAIL", detail: "CLS 0.18 — NEEDS IMPROVEMENT. 6 next/image instances missing width/height cause layout shift on load", evidence: "Lighthouse CLS: 0.18 (threshold: 0.10)" },
  { category: "Performance", checkKey: "perf_fcp", label: "FCP < 1.8s", status: "WARN", detail: "FCP 2.1s — slightly above threshold. Render-blocking stylesheet from Intercom widget", evidence: "Lighthouse FCP: 2100ms (threshold: 1800ms)" },
  { category: "Performance", checkKey: "perf_tbt", label: "TBT < 200ms", status: "FAIL", detail: "TBT 420ms — long JavaScript parsing time. Likely uncode-split dashboard bundle", evidence: "Lighthouse TBT: 420ms (threshold: 200ms)" },
  { category: "Performance", checkKey: "perf_score", label: "Lighthouse performance ≥ 70", status: "FAIL", detail: "Performance score: 58/100 — NEEDS IMPROVEMENT", evidence: "Lighthouse performance: 58" },
  { category: "Performance", checkKey: "perf_images_optimised", label: "Images served in next-gen formats", status: "WARN", detail: "Hero and property images served as JPEG. next/image would serve WebP/AVIF saving ~40% bandwidth" },
  { category: "Performance", checkKey: "perf_lazy_loading", label: "Below-fold images lazy loaded", status: "WARN", detail: "Property listing images not lazy-loaded — fetching all images on page load" },

  // ── Accessibility ────────────────────────────────────────────────────────
  { category: "Accessibility", checkKey: "a11y_score", label: "Lighthouse accessibility ≥ 90", status: "WARN", detail: "Accessibility score: 71/100. Property listing cards lack ARIA labels; colour contrast fails on grey body text" },
  { category: "Accessibility", checkKey: "a11y_lang", label: "HTML lang attribute set", status: "PASS", detail: "lang=\"en-GB\" on root element" },
  { category: "Accessibility", checkKey: "a11y_meta_viewport", label: "Meta viewport configured", status: "PASS", detail: "viewport meta tag present — mobile rendering correct" },
  { category: "Accessibility", checkKey: "a11y_skip_nav", label: "Skip navigation link", status: "FAIL", detail: "No skip-to-content link — keyboard users must tab through entire navigation on every page" },
  { category: "Accessibility", checkKey: "a11y_focus_visible", label: "Visible focus indicators", status: "WARN", detail: "Focus outline removed on most interactive elements — keyboard accessibility impaired" },

  // ── SEO ──────────────────────────────────────────────────────────────────
  { category: "SEO", checkKey: "seo_title", label: "Title tag present and unique", status: "PASS", detail: "\"Estato — Landlord Management Software for UK Letting Agents\"" },
  { category: "SEO", checkKey: "seo_meta_desc", label: "Meta description present", status: "PASS", detail: "167 characters — within recommended range" },
  { category: "SEO", checkKey: "seo_h1", label: "Single H1 tag on homepage", status: "PASS", detail: "H1: \"The smarter way to manage your properties\"" },
  { category: "SEO", checkKey: "seo_canonical", label: "Canonical URL tag", status: "PASS", detail: "Canonical self-referencing URL on all pages" },
  { category: "SEO", checkKey: "seo_sitemap", label: "XML sitemap", status: "PASS", detail: "Sitemap at /sitemap.xml — 14 URLs indexed" },
  { category: "SEO", checkKey: "seo_robots", label: "robots.txt present", status: "PASS", detail: "robots.txt present — /app/* correctly excluded from indexing" },
  { category: "SEO", checkKey: "seo_og_tags", label: "Open Graph tags for social sharing", status: "WARN", detail: "og:title and og:description present but og:image is missing — social shares render with no preview image" },
  { category: "SEO", checkKey: "seo_schema", label: "Structured data (Schema.org)", status: "FAIL", detail: "No structured data. SoftwareApplication schema would improve SERP appearance for 'landlord software' searches" },
  { category: "SEO", checkKey: "seo_mobile_friendly", label: "Mobile-friendly (responsive)", status: "PASS", detail: "Responsive layout confirmed — no horizontal scroll on 375px viewport" },
  { category: "SEO", checkKey: "seo_score", label: "Lighthouse SEO ≥ 90", status: "PASS", detail: "SEO score: 84/100" },

  // ── Email Security ───────────────────────────────────────────────────────
  { category: "Email Security", checkKey: "email_spf", label: "SPF record configured", status: "PASS", detail: "v=spf1 include:amazonses.com include:resend.com ~all" },
  { category: "Email Security", checkKey: "email_dmarc", label: "DMARC policy configured", status: "WARN", detail: "DMARC policy set to p=none (monitoring only) — not enforcing. Should be p=quarantine to prevent spoofing", evidence: "v=DMARC1; p=none; rua=mailto:dmarc@estato.co.uk" },
  { category: "Email Security", checkKey: "email_dkim", label: "DKIM signing enabled", status: "PASS", detail: "DKIM records present for resend.com and amazonses.com" },
  { category: "Email Security", checkKey: "email_mx", label: "MX records configured", status: "PASS", detail: "MX records pointing to Google Workspace" },

  // ── Legal & Compliance ───────────────────────────────────────────────────
  { category: "Legal & Compliance", checkKey: "legal_privacy", label: "Privacy Policy present", status: "PASS", detail: "Privacy Policy at /privacy — 8 months old, may need review for UK GDPR amendments" },
  { category: "Legal & Compliance", checkKey: "legal_terms", label: "Terms of Service present", status: "PASS", detail: "Terms at /terms — well-structured" },
  { category: "Legal & Compliance", checkKey: "legal_cookie_consent", label: "Cookie consent management", status: "FAIL", detail: "No cookie consent platform — GA4 and Intercom fire before user consent. GDPR/PECR violation.", evidence: "No CMP script detected on page load. document.cookie set before any consent interaction." },
  { category: "Legal & Compliance", checkKey: "legal_gdpr_dpa", label: "GDPR DPA available for B2B clients", status: "FAIL", detail: "No Data Processing Agreement template. Required before any letting agency can legally onboard Estato as a data processor." },
  { category: "Legal & Compliance", checkKey: "legal_ico_registration", label: "ICO registration visible", status: "WARN", detail: "No ICO registration number visible on privacy policy or footer. Standard practice for UK SaaS handling personal data." },

  // ── Observability ────────────────────────────────────────────────────────
  { category: "Observability", checkKey: "obs_error_monitoring", label: "Error monitoring configured (Sentry)", status: "FAIL", detail: "No Sentry or equivalent. Production errors including 504 timeouts on /api/payroll/run are undetected.", evidence: "No @sentry/nextjs in package.json. Vercel logs show 3 504 errors in last 7 days." },
  { category: "Observability", checkKey: "obs_analytics", label: "Analytics configured", status: "WARN", detail: "GA4 installed but fires before cookie consent — GDPR violation. Should be loaded conditionally on consent." },
  { category: "Observability", checkKey: "obs_structured_logging", label: "Structured logging in API routes", status: "FAIL", detail: "console.log used for logging in 14 files — not structured, not queryable in production" },
  { category: "Observability", checkKey: "obs_health_endpoint", label: "Health check endpoint", status: "FAIL", detail: "No /api/health endpoint — cannot integrate with uptime monitoring or load balancer health checks" },
  { category: "Observability", checkKey: "obs_perf_monitoring", label: "Real User Monitoring", status: "FAIL", detail: "No RUM configured. Core Web Vitals from real users not being collected." },

  // ── SaaS Signals ────────────────────────────────────────────────────────
  { category: "SaaS Signals", checkKey: "saas_pricing_page", label: "Pricing page present", status: "PASS", detail: "3-tier pricing at /pricing — Starter, Professional, Agency" },
  { category: "SaaS Signals", checkKey: "saas_signup_flow", label: "Signup / trial flow", status: "PASS", detail: "Signup at /register — email + password via Supabase Auth" },
  { category: "SaaS Signals", checkKey: "saas_onboarding", label: "In-app onboarding flow", status: "FAIL", detail: "New users land on empty dashboard — no guided setup, no empty states, no first-run experience" },
  { category: "SaaS Signals", checkKey: "saas_intercom", label: "In-app chat support", status: "PASS", detail: "Intercom widget installed — but knowledge base is empty (0 articles)" },
  { category: "SaaS Signals", checkKey: "saas_stripe", label: "Stripe payment integration", status: "PASS", detail: "Stripe Checkout + Billing Portal + Webhooks all detected and active" },
  { category: "SaaS Signals", checkKey: "saas_change_log", label: "Public changelog", status: "FAIL", detail: "No public changelog or release notes — users have no visibility of new features" },
  { category: "SaaS Signals", checkKey: "saas_testimonials", label: "Social proof / testimonials", status: "WARN", detail: "2 testimonials on homepage — no review platform integration (Trustpilot, G2, Capterra)" },
  { category: "SaaS Signals", checkKey: "saas_case_studies", label: "Case studies or customer stories", status: "FAIL", detail: "No case studies. Letting agencies researching PropTech expect peer evidence before evaluating." },
  { category: "SaaS Signals", checkKey: "saas_docs", label: "Product documentation / help centre", status: "WARN", detail: "Intercom knowledge base present but empty — no articles. Users have no self-serve support." },
  { category: "SaaS Signals", checkKey: "saas_api_docs", label: "Developer API / integration docs", status: "FAIL", detail: "No public API or integration documentation. Required for white-label agency integrations." },

  // ── Developer Signals ────────────────────────────────────────────────────
  { category: "Developer Signals", checkKey: "dev_ci", label: "CI pipeline configured", status: "PASS", detail: ".github/workflows — basic CI with lint and type-check on pull requests" },
  { category: "Developer Signals", checkKey: "dev_env_example", label: ".env.example documented", status: "WARN", detail: ".env.example present but missing 7 environment variables referenced in code" },
  { category: "Developer Signals", checkKey: "dev_dependabot", label: "Dependabot / Renovate configured", status: "FAIL", detail: "No automated dependency update bot. CVEs in jsonwebtoken and undici would have been auto-patched." },
  { category: "Developer Signals", checkKey: "dev_test_coverage", label: "Test suite present", status: "FAIL", detail: "No test files found. No Jest, Vitest, or Playwright configuration detected." },
  { category: "Developer Signals", checkKey: "dev_readme", label: "README with setup instructions", status: "PASS", detail: "README.md present with local dev setup steps" },
  { category: "Developer Signals", checkKey: "dev_license", label: "License file", status: "PASS", detail: "MIT license" },
  { category: "Developer Signals", checkKey: "dev_commit_velocity", label: "Active development (>1 commit/week)", status: "PASS", detail: "3.5 commits/week over last 30 days — healthy cadence" },

  // ── UX & Conversion ──────────────────────────────────────────────────────
  { category: "UX & Conversion", checkKey: "ux_cta_above_fold", label: "Primary CTA above the fold", status: "PASS", detail: "\"Start free trial\" button visible without scrolling" },
  { category: "UX & Conversion", checkKey: "ux_mobile_nav", label: "Mobile navigation functional", status: "PASS", detail: "Hamburger menu works correctly on 375px viewport" },
  { category: "UX & Conversion", checkKey: "ux_trust_signals", label: "Trust signals visible (logos, certs, awards)", status: "WARN", detail: "No trust badges, security certifications, or client logos on homepage — important for enterprise letting agency buyers" },
  { category: "UX & Conversion", checkKey: "ux_demo_cta", label: "Book a demo CTA", status: "FAIL", detail: "No demo request option — only self-serve trial. Letting agencies with 5+ staff prefer a guided demo before committing." },
  { category: "UX & Conversion", checkKey: "ux_about_page", label: "About / Company page", status: "PASS", detail: "About page with founder bio and company history" },
  { category: "UX & Conversion", checkKey: "ux_contact", label: "Contact details accessible", status: "PASS", detail: "Contact form at /contact — email address present in footer" },
  { category: "UX & Conversion", checkKey: "ux_live_chat", label: "Live chat for sales conversations", status: "WARN", detail: "Intercom installed but configured as support-only. Not triggering proactive sales messages on pricing page." },
  { category: "UX & Conversion", checkKey: "ux_feature_page", label: "Features / product page", status: "PASS", detail: "Detailed features page at /features with screenshots" },

  // ── PWA Signals ──────────────────────────────────────────────────────────
  { category: "PWA Signals", checkKey: "pwa_manifest", label: "Web app manifest", status: "FAIL", detail: "No manifest.json — platform cannot be installed as a PWA on mobile. Relevant for landlord mobile use case." },
  { category: "PWA Signals", checkKey: "pwa_service_worker", label: "Service worker / offline support", status: "FAIL", detail: "No service worker — no offline capability" },
  { category: "PWA Signals", checkKey: "pwa_viewport_meta", label: "Viewport meta for mobile", status: "PASS", detail: "Viewport meta correctly configured" },
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });
  if (!workspace) {
    throw new Error(`Workspace '${DEFAULT_WORKSPACE_SLUG}' not found. Run 'npx tsx prisma/seed.ts' first.`);
  }

  // Idempotency — delete existing demo scan if present
  const existing = await prisma.pulseScan.findFirst({
    where: {
      workspaceId: workspace.id,
      inputGithubRepo: "estato-hq/estato-platform",
    },
  });
  if (existing) {
    await prisma.pulseScanCheck.deleteMany({ where: { scanId: existing.id } });
    await prisma.pulseScan.delete({ where: { id: existing.id } });
    console.log("Removed previous demo scan — re-creating...");
  }

  const scan = await prisma.pulseScan.create({
    data: {
      workspaceId: workspace.id,
      projectName: "Estato",
      inputType: "GITHUB_REPO",
      inputGithubRepo: "estato-hq/estato-platform",
      status: "COMPLETED",
      scanVersion: "2.0",
      startedAt: new Date(Date.now() - 1000 * 75),
      completedAt: new Date(),
      healthScore: 63,
      previousHealthScore: 58,
      techStack: ["Next.js 15", "Supabase", "PostgreSQL", "Vercel", "Stripe", "GOV.UK Notify", "Resend", "Intercom", "GA4"],
      llmAnalysis: LLM_ANALYSIS as unknown as Prisma.InputJsonValue,
      discoveryData: DISCOVERY_KIT as unknown as Prisma.InputJsonValue,
      agentData: AGENT_DATA as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.pulseScanCheck.createMany({
    data: CHECKS.map((c, i) => ({
      scanId: scan.id,
      category: c.category,
      checkKey: c.checkKey,
      label: c.label,
      status: c.status,
      detail: c.detail ?? null,
      evidence: c.evidence ?? null,
      sortOrder: i,
    })),
  });

  const pass = CHECKS.filter((c) => c.status === "PASS").length;
  const warn = CHECKS.filter((c) => c.status === "WARN").length;
  const fail = CHECKS.filter((c) => c.status === "FAIL").length;

  console.log(`\n✓ Demo scan created — ID: ${scan.id}`);
  console.log(`  Project:      Estato (UK Property-Tech SaaS)`);
  console.log(`  Health score: 63/100 (+5 from previous scan)`);
  console.log(`  Checks:       ${CHECKS.length} total — ${pass} pass · ${warn} warn · ${fail} fail`);
  console.log(`  Agents:       Code ✓  Deploy ✓  Browser ✓  AI ✓  Discovery ✓`);
  console.log(`\n  View at: /app/pulse/${scan.id}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
