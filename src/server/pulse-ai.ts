import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PulseAnalysisOutput, PulseScanCheckInput, PulseScanInputType, DiscoveryKit } from "@/types/pulse";
import { resolveAgentPrompt } from "@/server/agent-config";

export type AiConfig = { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null };
export type AiTask = "synthesis" | "discovery" | "competitor" | "fix-agent";
export { getModelForTask };

// Always use the workspace-configured model — never override with a hardcoded value.
function getModelForTask(config: AiConfig): string {
  return config.model;
}



const pulseStrengthSchema = z.object({
  title: z.string(),
  detail: z.string(),
});

const pulseCriticalGapSchema = z.object({
  category: z.string(),
  gap: z.string(),
  impact: z.string(),
  urgency: z.enum(["CRITICAL", "HIGH", "MEDIUM"]),
});

const pulseBuildOpportunitySchema = z.object({
  title: z.string(),
  description: z.string(),
  estimatedEffort: z.enum(["S", "M", "L", "XL"]),
  businessValue: z.enum(["HIGH", "MEDIUM", "LOW"]),
  category: z.string(),
});

const pulseScalingPhaseSchema = z.object({
  phase: z.number(),
  title: z.string(),
  duration: z.string(),
  goals: z.array(z.string()),
});

const pulseTechDebtSchema = z.object({
  area: z.string(),
  description: z.string(),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

const productionReadinessItemSchema = z.object({
  category: z.string(),
  item: z.string(),
  status: z.enum(["DONE", "MISSING", "PARTIAL"]),
  notes: z.string(),
});

const techStackRecommendationSchema = z.object({
  area: z.string(),
  current: z.string().nullable(),
  recommended: z.string(),
  reason: z.string(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

const infrastructureStackSchema = z.object({
  frontend: z.string().nullable(),
  backend: z.string().nullable(),
  database: z.string().nullable(),
  hosting: z.string().nullable(),
  auth: z.string().nullable(),
  payments: z.string().nullable(),
  email: z.string().nullable(),
  storage: z.string().nullable(),
  caching: z.string().nullable(),
  search: z.string().nullable(),
  backgroundJobs: z.string().nullable(),
  monitoring: z.string().nullable(),
  analytics: z.string().nullable(),
  cicd: z.string().nullable(),
});

const pulseTechStackAnalysisSchema = z.object({
  assessment: z.string(),
  detectedStack: infrastructureStackSchema,
  recommendations: z.array(techStackRecommendationSchema),
  missingForProduction: z.array(z.string()),
});

const pulseProjectClassificationSchema = z.object({
  type: z.string(),
  subtype: z.string().nullable(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  signals: z.array(z.string()),
  verticalInsights: z.array(z.string()),
});

const productionBlockerSchema = z.object({
  category: z.string(),
  blocker: z.string(),
  why: z.string(),
  recommendedService: z.string().optional(),
  urgency: z.enum(["CRITICAL", "HIGH"]),
});

// Default values used when the AI omits or malforms a nested field.
// Each .catch(fallback) means: if that field fails Zod validation for any reason
// (missing, null, wrong type, enum mismatch), use the fallback silently rather than
// rejecting the entire response. This keeps the scan completing even when the model
// produces a slightly non-conforming response.
const DEFAULT_DETECTED_STACK = {
  frontend: null, backend: null, database: null, hosting: null,
  auth: null, payments: null, email: null, storage: null,
  caching: null, search: null, backgroundJobs: null,
  monitoring: null, analytics: null, cicd: null,
};

const pulseAnalysisOutputSchema = z.object({
  projectClassification: pulseProjectClassificationSchema.catch({
    type: "Unknown", subtype: null, confidence: "LOW" as const, signals: [], verticalInsights: [],
  }),
  executiveSummary: z.string().catch(""),
  healthNarrative: z.string().catch(""),
  strengths: z.array(pulseStrengthSchema).catch([]),
  criticalGaps: z.array(pulseCriticalGapSchema).catch([]),
  buildOpportunities: z.array(pulseBuildOpportunitySchema).catch([]),
  scalingRoadmap: z.array(pulseScalingPhaseSchema).catch([]),
  techDebt: z.array(pulseTechDebtSchema).catch([]),
  proposalHook: z.string().catch(""),
  productionBlockers: z.array(productionBlockerSchema).catch([]),
  productionReadinessChecklist: z.array(productionReadinessItemSchema).catch([]),
  techStackAnalysis: pulseTechStackAnalysisSchema.catch({
    assessment: "", detectedStack: DEFAULT_DETECTED_STACK, recommendations: [], missingForProduction: [],
  }),
});

const SYSTEM_PROMPT = `You are a senior software architect and SaaS product advisor at Gitwork, a digital consultancy that specialises in taking AI-generated apps from "vibe-coded prototype" to production-ready product.

Your clients are "vibe coders" — founders and makers who built their app using tools like Lovable, Bolt, v0, Cursor, Claude Code, Replit Agent, or similar AI coding assistants.

STEP 1 — CLASSIFY THE PROJECT VERTICAL FIRST.
Before making any recommendations, determine exactly what type of product this is. Your classification drives everything: the gaps you flag, the opportunities you surface, and the roadmap you recommend. Think like a consultant who has seen hundreds of projects — the vertical shapes the entire engagement.

Supported project types (use the closest match, be specific in subtype):
- E-commerce: online shop, D2C brand, dropshipping, print-on-demand
- SaaS: B2B, B2C, vertical SaaS (e.g. "SaaS / Legal tech", "SaaS / HR platform")
- Marketplace: two-sided (buyers + sellers/providers), e.g. "Marketplace / Freelance platform"
- Service Business: agency, consulting, trades, local service, booking, quotes
- Mobile App: consumer app with a marketing landing page (App Store / Play Store focus)
- Content / Media: blog, newsletter, video platform, podcast, creator tools
- Internal Tool: admin panel, ops dashboard, back-office — no public signup
- Developer Tool: API, SDK, CLI, developer platform
- Healthcare / Wellbeing: health tracking, telemedicine, mental health, fitness
- Fintech: payments infrastructure, invoicing, budgeting, trading, crypto
- Education / EdTech: courses, LMS, tutoring, student dashboard
- Automotive / Aftermarket: car sales, caravan/RV, vehicle aftermarket, parts
- Hospitality / Travel: hotels, rentals, experiences, tour operators
- Social / Community: user profiles, feeds, forums, membership platforms
- IoT / Hardware: device management, firmware, sensor dashboards
- Other: describe specifically

STEP 2 — TAILOR ALL RECOMMENDATIONS TO THAT VERTICAL.
Once you know the vertical, every gap, opportunity, and roadmap phase should be specific to that type of product. Do not give generic SaaS advice to an e-commerce store. Do not recommend a subscription billing portal to a caravan aftermarket parts shop. Think: what does this specific type of business actually need to grow and retain customers?

Vibe-coded apps across all verticals share common gaps:
- Legal pages missing (Privacy Policy, Terms, Cookie consent)
- No error monitoring, observability, or health checks
- Auth missing edge cases (password reset, email verification)
- No CI/CD, tests, or structured error handling
- Missing trust-building pages (About, Contact, FAQ, Changelog)

You are briefing the Gitwork consulting team — not the client directly. Be specific, commercially minded, and prioritise what will have the biggest impact on getting this product to market.

You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no extra text.`;

// Gitwork-preferred vendor list — always recommend specific service names, not generic categories.
const GITWORK_VENDOR_CONTEXT = `
Gitwork preferred services (recommend by name):
  Transactional email: Resend (first choice), Mailgun (second), Postmark (receipts), SendGrid (high-volume)
  Error monitoring: Sentry (first choice), Highlight.io (second), Datadog (enterprise)
  Analytics: PostHog (first choice — open source), Plausible (privacy-first EU), GA4 (if already in use)
  Background jobs: Inngest (first choice — serverless), Trigger.dev (second), BullMQ (self-hosted)
  Caching / KV: Upstash Redis (serverless, first choice), Vercel KV (if on Vercel)
  Search: Algolia (managed), Typesense (self-hosted OSS), Meilisearch (alternative OSS)
  Uptime: Better Uptime (first choice), UptimeRobot (free tier), Checkly (API monitoring)
  Mobile crash reporting: Sentry (cross-platform), Firebase Crashlytics (native)
  Push notifications (mobile): OneSignal (first choice), Firebase Cloud Messaging
  In-app payments (mobile): RevenueCat (manages App Store + Play Store subscriptions)
  File storage: Cloudflare R2 (first choice — cheap egress), Uploadthing (Next.js), Cloudinary (media transforms)
  Rate limiting: Upstash Ratelimit (serverless), Redis sliding window (self-hosted)
  Auth: Clerk (first choice — DX), NextAuth.js / Auth.js (open source), WorkOS (enterprise SSO)
`;

function formatChecksForPrompt(checks: PulseScanCheckInput[]): string {
  // Separate failures from warnings — always include all FAILs, cap WARNs
  const fails = checks.filter((c) => c.status === "FAIL");
  const warns = checks.filter((c) => c.status === "WARN");

  // Cap total issues at 60: all FAILs + top WARNs (sorted by category, then label for determinism)
  // This bounds the prompt to ~3,500 tokens of issue data regardless of check count
  const MAX_ISSUES = 60;
  const truncatedWarns = warns.slice(0, Math.max(0, MAX_ISSUES - fails.length));
  const truncated = warns.length > truncatedWarns.length;
  const issueSet = new Set([...fails, ...truncatedWarns].map((c) => c.checkKey));

  // Group by category for readability
  const byCategory = new Map<string, PulseScanCheckInput[]>();
  for (const check of checks) {
    const list = byCategory.get(check.category) ?? [];
    list.push(check);
    byCategory.set(check.category, list);
  }

  const lines: string[] = [];
  for (const [category, categoryChecks] of byCategory.entries()) {
    const pass = categoryChecks.filter((c) => c.status === "PASS").length;
    const skip = categoryChecks.filter((c) => c.status === "SKIPPED").length;
    const allIssues = categoryChecks.filter((c) => c.status === "FAIL" || c.status === "WARN");
    const visibleIssues = allIssues.filter((c) => issueSet.has(c.checkKey));

    if (visibleIssues.length === 0) {
      // Categories with no issues shown: single summary line
      if (allIssues.length > 0) {
        lines.push(`${category}: ${pass} passing, ${allIssues.length} warnings (lower priority, omitted), ${skip} skipped`);
      } else {
        lines.push(`${category}: ${pass} passing, ${skip} skipped — all clear`);
      }
      continue;
    }

    lines.push(`${category}: ${pass} passing, ${allIssues.length} issues, ${skip} skipped`);
    for (const check of visibleIssues) {
      const icon = check.status === "FAIL" ? "✗" : "⚠";
      // 120 chars is plenty for the AI to understand the issue
      const detail = check.detail ? check.detail.slice(0, 120) : check.status;
      lines.push(`  ${icon} ${check.label}: ${detail}`);
    }
  }

  if (truncated) {
    const omitted = warns.length - truncatedWarns.length;
    lines.push(`\n(${omitted} lower-priority warnings omitted from AI prompt — visible in full scan results)`);
  }

  return lines.join("\n");
}

export function getMockAnalysis(input: { projectName: string; healthScore: number }): PulseAnalysisOutput {
  return {
    projectClassification: {
      type: "SaaS",
      subtype: "[Mock] Configure an AI key to detect the real project type",
      confidence: "LOW",
      signals: ["[Mock data — no real analysis performed]"],
      verticalInsights: [
        "[Mock] Add a free trial or freemium tier to reduce friction to signup",
        "[Mock] Implement in-app onboarding with activation milestones",
        "[Mock] Build a billing portal so subscribers can manage their own plans",
        "[Mock] Add usage-based limits and upgrade prompts at natural friction points",
        "[Mock] Set up a demo booking flow for enterprise prospects",
      ],
    },
    executiveSummary: `[Mock data] ${input.projectName} has a health score of ${input.healthScore}/100. This is simulated analysis — configure an AI key in Settings → Integrations to generate real gap analysis.`,
    healthNarrative: `[Mock data] The automated checks found a mix of passing and failing signals for ${input.projectName}. With a score of ${input.healthScore}/100 this project is in the typical early-stage vibe-coded range. Real analysis will identify specific production gaps and opportunities.`,
    strengths: [
      { title: "Mock: Core product exists", detail: "The project is deployed and responding, which is the critical first step." },
      { title: "Mock: Modern stack signals", detail: "Tech stack signals suggest a contemporary approach suitable for scaling." },
    ],
    criticalGaps: [
      { category: "Observability", gap: "No error monitoring detected", impact: "Production errors go undetected until users report them.", urgency: "CRITICAL" },
      { category: "Security", gap: "Missing security headers", impact: "Exposes the app to common web vulnerabilities.", urgency: "HIGH" },
      { category: "Auth", gap: "No email verification flow detected", impact: "Allows unverified accounts, increasing fraud risk.", urgency: "HIGH" },
    ],
    buildOpportunities: [
      { title: "Error monitoring", description: "Integrate Sentry or Highlight.io for real-time error tracking.", estimatedEffort: "S", businessValue: "HIGH", category: "Observability" },
      { title: "Transactional email", description: "Set up Resend or Postmark for auth flows and notifications.", estimatedEffort: "S", businessValue: "HIGH", category: "Infrastructure" },
      { title: "Analytics pipeline", description: "Add PostHog or Plausible to understand user behaviour.", estimatedEffort: "S", businessValue: "MEDIUM", category: "Analytics" },
      { title: "Background jobs", description: "Add a job queue (Inngest / Trigger.dev) for async processing.", estimatedEffort: "M", businessValue: "MEDIUM", category: "Infrastructure" },
    ],
    scalingRoadmap: [
      { phase: 1, title: "Stabilise", duration: "2 weeks", goals: ["Add error monitoring", "Fix critical security headers", "Set up transactional email"] },
      { phase: 2, title: "Productionise", duration: "4 weeks", goals: ["Implement billing portal", "Add email verification", "Set up CI/CD pipeline"] },
      { phase: 3, title: "Scale", duration: "6 weeks", goals: ["Performance optimisation", "CDN configuration", "Database connection pooling", "Rate limiting"] },
    ],
    techDebt: [
      { area: "Testing", description: "No automated test suite detected. All changes carry regression risk.", severity: "HIGH" },
      { area: "CI/CD", description: "No pipeline detected. Deployments are manual and error-prone.", severity: "MEDIUM" },
      { area: "Documentation", description: "No README or developer documentation found in the repo.", severity: "LOW" },
    ],
    proposalHook: `[Mock] ${input.projectName} is a solid concept that needs production hardening before it can scale — we can get it there in 6–8 weeks.`,
    productionBlockers: [
      { category: "Email", blocker: "No transactional email provider configured", why: "Password reset, welcome emails, and notifications will silently fail — users cannot recover locked accounts.", recommendedService: "Resend", urgency: "CRITICAL" },
      { category: "Monitoring", blocker: "No error monitoring", why: "Production crashes are invisible until users report them — mean time to detect (MTTD) is unbounded.", recommendedService: "Sentry", urgency: "CRITICAL" },
      { category: "Legal", blocker: "No Privacy Policy page", why: "Illegal under GDPR and CCPA — payment processors (Stripe) and app stores (Apple/Google) may reject the app.", urgency: "CRITICAL" },
      { category: "Legal", blocker: "No cookie consent mechanism", why: "Required by GDPR ePrivacy Directive for any site using cookies — exposes client to ICO fines.", urgency: "HIGH" },
    ],
    productionReadinessChecklist: [
      { category: "Legal", item: "Privacy Policy page", status: "MISSING", notes: "No privacy policy link detected in the scan." },
      { category: "Legal", item: "Terms of Service page", status: "MISSING", notes: "No terms of service detected." },
      { category: "Legal", item: "Cookie consent banner", status: "MISSING", notes: "No cookie consent mechanism detected." },
      { category: "Auth", item: "Login / signup flow", status: "PARTIAL", notes: "Auth signals detected but completeness unverified." },
      { category: "Auth", item: "Password reset flow", status: "MISSING", notes: "No password reset signals found in scan." },
      { category: "Payments", item: "Pricing page", status: "PARTIAL", notes: "Pricing signals detected but no dedicated page confirmed." },
      { category: "Observability", item: "Error monitoring", status: "MISSING", notes: "No Sentry, Bugsnag, or similar tool detected." },
      { category: "Observability", item: "Analytics", status: "MISSING", notes: "No analytics provider detected in page HTML." },
      { category: "Performance", item: "CDN / edge delivery", status: "PARTIAL", notes: "Hosting provider detected but CDN config unverified." },
      { category: "Support", item: "Help / FAQ page", status: "MISSING", notes: "No help or support link detected." },
    ],
    techStackAnalysis: {
      assessment: "[Mock] Configure an AI key to get a real infrastructure assessment. This placeholder shows the structure of what you'll receive after a live scan.",
      detectedStack: {
        frontend: null,
        backend: null,
        database: null,
        hosting: null,
        auth: null,
        payments: null,
        email: null,
        storage: null,
        caching: null,
        search: null,
        backgroundJobs: null,
        monitoring: null,
        analytics: null,
        cicd: null,
      },
      recommendations: [
        { area: "Error monitoring", current: null, recommended: "Sentry", reason: "Critical for catching production errors before users do.", priority: "HIGH" },
        { area: "Email delivery", current: null, recommended: "Resend", reason: "Reliable transactional email is required for auth and notifications.", priority: "HIGH" },
        { area: "Background jobs", current: null, recommended: "Inngest", reason: "Async processing prevents timeout errors on long operations.", priority: "MEDIUM" },
        { area: "Caching", current: null, recommended: "Upstash Redis", reason: "Session and data caching significantly improves response times.", priority: "MEDIUM" },
      ],
      missingForProduction: ["Background job queue", "Transactional email provider", "Rate limiting", "Database connection pooling"],
    },
  };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      // Retry on rate limits (429), Anthropic overload (529), and transient
      // gateway errors (502, 503) — these are recoverable. Everything else
      // (timeout, 4xx, schema error) is thrown immediately.
      const retryable = status === 429 || status === 529 || status === 502 || status === 503;
      if (!retryable || attempt >= maxAttempts - 1) throw err;
      // Exponential back-off: 3s, 6s — keeps total retry window short
      const delay = status === 429 ? 5000 : (attempt + 1) * 3000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function extractJson(raw: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  // If the response starts with { or [ treat it as raw JSON
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  // Last resort: find the first { and last } to extract a JSON object
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw;
}

const PULSE_ANALYSIS_TOOL = {
  name: "submit_pulse_analysis",
  description: "Submit the completed Pulse scan analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      projectClassification: { type: "object" as const },
      executiveSummary: { type: "string" as const },
      healthNarrative: { type: "string" as const },
      strengths: { type: "array" as const },
      criticalGaps: { type: "array" as const },
      buildOpportunities: { type: "array" as const },
      scalingRoadmap: { type: "array" as const },
      techDebt: { type: "array" as const },
      proposalHook: { type: "string" as const },
      productionBlockers: { type: "array" as const },
      productionReadinessChecklist: { type: "array" as const },
      techStackAnalysis: { type: "object" as const },
    },
    required: [
      "projectClassification", "executiveSummary", "healthNarrative",
      "strengths", "criticalGaps", "buildOpportunities", "scalingRoadmap",
      "techDebt", "proposalHook", "productionBlockers",
      "productionReadinessChecklist", "techStackAnalysis",
    ],
  },
};

export async function analyseWithClaude(
  input: {
    projectName: string;
    inputType: PulseScanInputType;
    inputUrl: string | null;
    inputGithubRepo: string | null;
    inputDescription: string | null;
    platform: string | null;
    healthScore: number;
    techStack: string[];
    checks: PulseScanCheckInput[];
  },
  aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null },
): Promise<PulseAnalysisOutput> {
  if (!aiConfig.apiKey) {
    throw Object.assign(
      new Error(`No ${aiConfig.provider} API key configured — add one in Settings → Integrations.`),
      { code: "NO_API_KEY" },
    );
  }

  const inputRef =
    input.inputType === "URL"
      ? `URL: ${input.inputUrl}`
      : input.inputType === "GITHUB_REPO"
        ? `GitHub repo: ${input.inputGithubRepo}`
        : `Description: ${input.inputDescription}`;

  const platformLabel = input.platform
    ? `Platform (declared by client): ${input.platform}`
    : "Platform: not specified (assume web app)";

  const userMessage = `Project: ${input.projectName}
Input type: ${input.inputType}
${inputRef}
${platformLabel}
Overall health score: ${input.healthScore}/100
Tech stack detected: ${input.techStack.length > 0 ? input.techStack.join(", ") : "Unknown"}

=== SCAN RESULTS ===
${formatChecksForPrompt(input.checks)}

=== ANALYSIS REQUEST ===
Return a JSON object with this exact shape:

{
  "projectClassification": {
    "type": "string — one of the supported project types listed in the system prompt (e.g. 'E-commerce', 'SaaS', 'Marketplace', 'Automotive / Aftermarket')",
    "subtype": "string or null — a more specific description e.g. 'B2B SaaS', 'Caravan / RV aftermarket parts', 'Freelance marketplace', 'D2C fashion brand'",
    "confidence": "HIGH | MEDIUM | LOW — how confident you are in this classification based on scan signals",
    "signals": ["array of strings — specific things in the scan that point to this classification, e.g. 'Stripe detected', 'Product listing pages found', 'App Store link present', '/caravan path found in sitemap'"],
    "verticalInsights": ["array of 4–6 strings — specific, actionable recommendations that apply to THIS type of business, not generic SaaS advice. E.g. for e-commerce: 'Abandoned cart email flow', 'Product schema markup for Google Shopping', 'Returns/refund policy page'. For caravan aftermarket: 'VIN/reg lookup tool', 'Fitment guide per vehicle', 'Trade account portal'"]
  },
  "executiveSummary": "2–3 sentence summary of the project's current state and biggest risks. Write as if briefing the consulting team before a discovery call.",
  "healthNarrative": "A paragraph explaining the health score in plain language — what's working, what's at risk, and the overall maturity level.",
  "strengths": [{ "title": "string", "detail": "string" }],
  "criticalGaps": [
    {
      "category": "string (e.g. Security, Auth, Payments, Observability, SEO, Performance)",
      "gap": "string — what is missing or broken",
      "impact": "string — what business risk this creates",
      "urgency": "CRITICAL | HIGH | MEDIUM"
    }
  ],
  "buildOpportunities": [
    {
      "title": "string — short name of the feature/service to build",
      "description": "string — what it is and why it matters",
      "estimatedEffort": "S | M | L | XL",
      "businessValue": "HIGH | MEDIUM | LOW",
      "category": "string — e.g. Auth, Payments, SEO, Monitoring, Performance, Analytics"
    }
  ],
  "scalingRoadmap": [
    {
      "phase": 1,
      "title": "string — phase name",
      "duration": "string — e.g. 2 weeks",
      "goals": ["string array of goals for this phase"]
    }
  ],
  "techDebt": [
    {
      "area": "string — e.g. Testing, CI/CD, Documentation",
      "description": "string — what the debt is",
      "severity": "HIGH | MEDIUM | LOW"
    }
  ],
  "proposalHook": "One compelling sentence the sales team can use to open a discovery call with this client.",
  "productionBlockers": [
    {
      "category": "string — e.g. Email, Monitoring, Legal, Auth, Security",
      "blocker": "string — what is missing or broken, stated plainly. E.g. 'No transactional email provider configured'",
      "why": "string — the concrete operational or legal consequence if not fixed before launch. E.g. 'Password reset emails, welcome emails, and receipt notifications will silently fail — users cannot recover locked accounts'",
      "recommendedService": "string or omit — the specific named service Gitwork recommends for this gap, from the Gitwork vendor list. E.g. 'Resend', 'Sentry', 'Mailgun'. Omit if not applicable.",
      "urgency": "CRITICAL | HIGH"
    }
  ],
  "productionReadinessChecklist": [
    {
      "category": "string — one of: Legal, Auth, Payments, Onboarding, Support, Trust, Observability, Performance, SEO, Accessibility",
      "item": "string — specific thing that must be in place (e.g. 'Privacy Policy page', 'Password reset flow', 'Cookie consent banner')",
      "status": "DONE | MISSING | PARTIAL",
      "notes": "string — 1 sentence on current state or what's needed. Be specific about the vibe-coded context."
    }
  ],
  "techStackAnalysis": {
    "assessment": "string — 2–3 sentence paragraph assessing the full infrastructure from a production-readiness standpoint. Comment on the hosting choice, database tier, and any obvious scaling risks.",
    "detectedStack": {
      "frontend": "string or null — detected frontend framework/library, e.g. 'Next.js 14', 'React + Vite', 'Vue 3', 'SvelteKit', null if not detectable",
      "backend": "string or null — detected backend runtime/framework, e.g. 'Next.js API routes', 'Express.js', 'FastAPI', 'Rails', 'Laravel', null if unknown",
      "database": "string or null — detected database, e.g. 'PostgreSQL (Supabase)', 'PlanetScale (MySQL)', 'MongoDB Atlas', 'Neon Postgres', null if unknown",
      "hosting": "string or null — detected hosting/infra, e.g. 'Vercel', 'Railway', 'AWS (CloudFront + ECS)', 'Netlify', null if unknown",
      "auth": "string or null — detected auth solution, e.g. 'Clerk', 'NextAuth.js', 'Supabase Auth', 'Auth0', null if not detected",
      "payments": "string or null — detected payments, e.g. 'Stripe', 'Paddle', 'LemonSqueezy', null if not detected",
      "email": "string or null — detected transactional email, e.g. 'Resend', 'SendGrid', 'Postmark', null if not detected",
      "storage": "string or null — detected file storage, e.g. 'Cloudinary', 'Uploadthing', 'AWS S3', 'Supabase Storage', null if not detected",
      "caching": "string or null — detected caching layer, e.g. 'Upstash Redis', 'Vercel KV', 'Redis', null if not detected",
      "search": "string or null — detected search, e.g. 'Algolia', 'Typesense', 'Meilisearch', 'Postgres full-text', null if not detected",
      "backgroundJobs": "string or null — detected async job processing, e.g. 'Inngest', 'Trigger.dev', 'BullMQ', 'Vercel Cron', null if not detected",
      "monitoring": "string or null — detected error/APM monitoring, e.g. 'Sentry', 'Datadog', 'Highlight.io', null if not detected",
      "analytics": "string or null — detected analytics, e.g. 'PostHog', 'Plausible', 'Google Analytics 4', null if not detected",
      "cicd": "string or null — detected CI/CD pipeline, e.g. 'GitHub Actions', 'CircleCI', 'Vercel automatic deploys', null if not detected"
    },
    "recommendations": [
      {
        "area": "string — infrastructure area, e.g. Database, Caching, Email, Background Jobs, Monitoring, Storage, Search, CDN, Rate Limiting, Secrets Management, Testing, Connection Pooling",
        "current": "string or null — what's currently in use or null if nothing",
        "recommended": "string — specific named tool/service to adopt",
        "reason": "string — why this matters for production: concrete business or operational impact",
        "priority": "HIGH | MEDIUM | LOW"
      }
    ],
    "missingForProduction": ["string — production-critical infrastructure components not detected, e.g. 'Database connection pooling', 'Rate limiting / DDoS protection', 'Secrets manager (not .env files)', 'Background job queue', 'Transactional email provider', 'File storage CDN', 'Database backups / PITR'"]
  }
}

For productionBlockers: list 3–8 items that are genuine launch blockers for THIS platform type. Be ruthlessly specific — name the exact consequence of going live without each item. Always include a recommendedService from the Gitwork vendor list where one applies. Do NOT list nice-to-haves here — only things where launching without them will cause a broken user experience, legal liability, or security incident. Skip categories that are irrelevant to the declared platform.

Populate productionReadinessChecklist with 12–20 items relevant to the declared platform. Base status on the scan results — DONE if check passed, MISSING if failed, PARTIAL if warn. For web/SaaS cover: Legal (Privacy Policy, Terms, Cookie consent, Refund policy), Auth (Login/signup, Password reset, Email verification, OAuth), Payments (Pricing page, Payment processing, Billing portal), Onboarding (Welcome flow, empty states), Support (Help page, FAQ), Trust (About, Testimonials, Changelog), Observability (Error monitoring, Analytics, Uptime). For mobile apps focus on: App Store compliance, crash reporting, push notifications, in-app payments, deep linking, auth flows. For APIs focus on: rate limiting, auth, versioning, documentation, monitoring.

For techStackAnalysis: detected stack is [${input.techStack.length > 0 ? input.techStack.join(", ") : "unknown — infer from HTML signals, response headers, and scan results"}]. For detectedStack, fill in every field you can infer — use null only when you genuinely cannot tell. Give 4–10 recommendations covering the most important infrastructure gaps for this specific product vertical. Use Gitwork preferred vendor names from the vendor list provided. Prioritise HIGH for anything that would cause data loss, downtime, or security breach in production. List 4–8 missing production-critical components specific to this project type and platform.`;

  // Resolve system prompt — workspace override takes precedence over built-in default
  const resolvedSystemPrompt = await resolveAgentPrompt("pulse:synthesis", SYSTEM_PROMPT).catch(() => SYSTEM_PROMPT);

  if (aiConfig.provider === "ANTHROPIC") {
    // Use .create() (not .stream()) for tool_use calls.
    // Streaming accumulates the tool input JSON from delta events — if the stream
    // ends before the JSON is fully formed, `toolBlock.input` comes back undefined.
    // .create() returns a complete, atomic response so the tool input is always intact.
    // The 180s timeout handles stalled connections; cloud-to-cloud keep-alive means
    // TCP half-open issues surface well within that window.
    const client = new Anthropic({ apiKey: aiConfig.apiKey, timeout: 180_000, maxRetries: 0 });
    const message = await withRetry(() =>
      client.messages.create({
        model: getModelForTask(aiConfig),
        max_tokens: 8192,
        system: [
          { type: "text", text: resolvedSystemPrompt, cache_control: { type: "ephemeral" } },
          { type: "text", text: GITWORK_VENDOR_CONTEXT, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userMessage }],
        tools: [PULSE_ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: "submit_pulse_analysis" },
      })
    );
    const toolBlock = message.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("Unexpected response format from AI.");
    if (toolBlock.input === undefined || toolBlock.input === null) {
      throw new Error("AI returned an empty tool response — the model may have stopped generating early. Try re-running.");
    }
    const result = pulseAnalysisOutputSchema.safeParse(toolBlock.input);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path?.length ? ` at .${issue.path.join(".")}` : "";
      throw new Error(`AI response did not match expected schema${path}: ${issue?.message}`);
    }
    return result.data;
  }

  // OpenAI SDK handles OpenAI, Gemini (via compatible endpoint), and local/Ollama
  const { default: OpenAI } = await import("openai");
  const openaiClient = new OpenAI({
    apiKey: aiConfig.apiKey ?? "local",
    ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {}),
  });
  const completion = await withRetry(() =>
    openaiClient.chat.completions.create({
      model: aiConfig.model,
      max_tokens: 8192,
      messages: [
        { role: "system", content: `${resolvedSystemPrompt}\n\n${GITWORK_VENDOR_CONTEXT}` },
        { role: "user", content: userMessage },
      ],
    })
  );
  const rawContent = completion.choices[0]?.message?.content?.trim() ?? "";

  // Gemini and some local models wrap JSON in markdown code fences.
  const extracted = extractJson(rawContent);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    throw new Error(`AI returned invalid JSON. Raw response started with: ${rawContent.slice(0, 120)}`);
  }

  const result = pulseAnalysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? ` at .${issue.path.join(".")}` : "";
    throw new Error(`AI response did not match expected schema${path}: ${issue?.message}`);
  }
  return result.data;
}

// ── Discovery Kit generation ───────────────────────────────────────────────────

const discoveryKitSchema = z.object({
  openingStatement: z.string(),
  wowFinding: z.object({ finding: z.string(), impact: z.string() }),
  questions: z.array(
    z.object({ question: z.string(), context: z.string(), followUp: z.string() }),
  ).min(4).max(12),
  anticipatedObjections: z.array(
    z.object({ objection: z.string(), response: z.string() }),
  ).min(2).max(8),
  pricingAnchor: z.object({ low: z.number(), high: z.number(), rationale: z.string() }),
  talkingPoints: z.array(z.string()).min(3).max(10),
});

const DISCOVERY_SYSTEM_PROMPT = `You are a senior business development consultant at Gitwork, preparing a discovery call briefing for the sales team.

The team has just completed a technical Pulse scan of a potential client's app. Your job is to convert the technical findings into a sales conversation guide — something a non-technical BD person can use to run an effective 30-minute discovery call.

Rules:
- All questions and talking points must be DIRECTLY grounded in the scan findings — do not use generic questions
- The pricing anchor should reflect realistic consultancy rates (£/day, fixed-price project ranges), calibrated to the complexity and number of gaps found
- Write in a confident, commercially-minded tone — this is a paid consulting engagement, not a charity audit
- You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no extra text.`;

export async function generateDiscoveryKit(
  input: {
    projectName: string;
    projectType: string;
    healthScore: number;
    proposalHook: string;
    executiveSummary: string;
    criticalGaps: { category: string; gap: string; urgency: string }[];
    buildOpportunities: { title: string; estimatedEffort: string; businessValue: string }[];
    checks: PulseScanCheckInput[];
  },
  aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null },
): Promise<DiscoveryKit | null> {
  if (!aiConfig.apiKey) return null;

  const gapsText = input.criticalGaps
    .slice(0, 8)
    .map((g) => `- [${g.urgency}] ${g.category}: ${g.gap}`)
    .join("\n");

  const oppsText = input.buildOpportunities
    .slice(0, 6)
    .map((o) => `- ${o.title} (Effort: ${o.estimatedEffort}, Value: ${o.businessValue})`)
    .join("\n");

  const failedChecks = input.checks
    .filter((c) => c.status === "FAIL")
    .slice(0, 10)
    .map((c) => `${c.category}: ${c.label}`)
    .join(", ");

  const userMessage = `Project: ${input.projectName}
Type: ${input.projectType}
Health score: ${input.healthScore}/100
Hook: ${input.proposalHook}
Executive summary: ${input.executiveSummary}

Critical gaps:
${gapsText}

Failed checks: ${failedChecks || "None"}

Build opportunities:
${oppsText}

Generate a discovery call briefing. Return JSON with this shape:
{
  "openingStatement": "2–3 sentence confident opener the BD person uses on the call to establish credibility and context",
  "wowFinding": {
    "finding": "The single most surprising or urgent finding from the scan — specific, not generic",
    "impact": "What business risk or opportunity this creates for them"
  },
  "questions": [
    {
      "question": "Specific question directly tied to a scan finding",
      "context": "Why this question matters given what we found",
      "followUp": "Natural follow-up if they say yes / give a positive answer"
    }
  ],
  "anticipatedObjections": [
    {
      "objection": "Likely pushback from the prospect",
      "response": "Scripted, confident rebuttal that pivots to the opportunity"
    }
  ],
  "pricingAnchor": {
    "low": 5000,
    "high": 20000,
    "rationale": "Why this range — based on the number and severity of gaps + build opportunities found"
  },
  "talkingPoints": ["Bullet 1", "Bullet 2", "Bullet 3"]
}`;

  try {
    let rawContent: string;

    if (aiConfig.provider === "ANTHROPIC") {
      const client = new Anthropic({ apiKey: aiConfig.apiKey, timeout: 45_000, maxRetries: 0 });
      const message = await client.messages.stream({
        model: getModelForTask(aiConfig),
        max_tokens: 2048,
        system: [{ type: "text", text: DISCOVERY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
      }).finalMessage();
      const dBlock = message.content[0];
      if (!dBlock || dBlock.type !== "text") throw new Error("Unexpected response format from AI.");
      rawContent = dBlock.text ?? "";
    } else {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({
        apiKey: aiConfig.apiKey,
        baseURL: aiConfig.baseUrl ?? undefined,
      });
      const completion = await client.chat.completions.create({
        model: aiConfig.model,
        max_tokens: 2048,
        messages: [
          { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      });
      rawContent = completion.choices[0]?.message?.content ?? "";
    }

    const extracted = extractJson(rawContent);
    const parsed = JSON.parse(extracted);
    const result = discoveryKitSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ── Competitor comparison ─────────────────────────────────────────────────────

import type { CompetitorScanSummary, CompetitorComparison } from "@/types/pulse";

const competitorComparisonSchema = z.object({
  summary: z.string(),
  advantages: z.array(z.string()).min(1),
  gaps: z.array(z.string()),
  recommendation: z.string(),
});

export async function generateCompetitorComparison(
  input: {
    projectName: string;
    mainScore: number;
    mainTechStack: string[];
    competitors: CompetitorScanSummary[];
  },
  aiConfig: AiConfig,
): Promise<CompetitorComparison | null> {
  if (!aiConfig.apiKey || input.competitors.length === 0) return null;

  const competitorLines = input.competitors
    .map((c, i) => `Competitor ${i + 1}: ${c.url} — score ${c.healthScore}/100, pass ${c.checksPass}/${c.checksPass + c.checksWarn + c.checksFail}, tech: ${c.techStack.join(", ") || "unknown"}`)
    .join("\n");

  const userMessage = `Compare the following projects and return a JSON competitor analysis.

Main project: ${input.projectName}
Score: ${input.mainScore}/100
Tech stack: ${input.mainTechStack.join(", ") || "unknown"}

Competitors:
${competitorLines}

Return JSON with exactly this shape:
{
  "summary": "2-3 sentence side-by-side comparison",
  "advantages": ["string — where the main project leads (max 5)"],
  "gaps": ["string — where competitors lead over the main project (max 5)"],
  "recommendation": "1-2 sentences on what to fix to overtake the leading competitor"
}`;

  try {
    let rawContent: string;

    if (aiConfig.provider === "ANTHROPIC") {
      const client = new Anthropic({ apiKey: aiConfig.apiKey, timeout: 30_000, maxRetries: 0 });
      const message = await client.messages.stream({
        model: getModelForTask(aiConfig),
        max_tokens: 1024,
        messages: [{ role: "user", content: userMessage }],
      }).finalMessage();
      const cBlock = message.content[0];
      if (!cBlock || cBlock.type !== "text") throw new Error("Unexpected response format from AI.");
      rawContent = cBlock.text ?? "";
    } else {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: aiConfig.apiKey, baseURL: aiConfig.baseUrl ?? undefined });
      const completion = await client.chat.completions.create({
        model: getModelForTask(aiConfig),
        max_tokens: 1024,
        messages: [{ role: "user", content: userMessage }],
      });
      rawContent = completion.choices[0]?.message?.content ?? "";
    }

    const result = competitorComparisonSchema.safeParse(JSON.parse(extractJson(rawContent)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
