import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PulseAnalysisOutput, PulseScanCheckInput, PulseScanInputType } from "@/types/pulse";



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

const pulseAnalysisOutputSchema = z.object({
  projectClassification: pulseProjectClassificationSchema,
  executiveSummary: z.string(),
  healthNarrative: z.string(),
  strengths: z.array(pulseStrengthSchema),
  criticalGaps: z.array(pulseCriticalGapSchema),
  buildOpportunities: z.array(pulseBuildOpportunitySchema),
  scalingRoadmap: z.array(pulseScalingPhaseSchema),
  techDebt: z.array(pulseTechDebtSchema),
  proposalHook: z.string(),
  productionReadinessChecklist: z.array(productionReadinessItemSchema),
  techStackAnalysis: pulseTechStackAnalysisSchema,
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

function formatChecksForPrompt(checks: PulseScanCheckInput[]): string {
  const byCategory = new Map<string, PulseScanCheckInput[]>();
  for (const check of checks) {
    const list = byCategory.get(check.category) ?? [];
    list.push(check);
    byCategory.set(check.category, list);
  }

  const lines: string[] = [];
  for (const [category, categoryChecks] of byCategory.entries()) {
    lines.push(`${category}:`);
    for (const check of categoryChecks) {
      const icon = check.status === "PASS" ? "✓" : check.status === "WARN" ? "⚠" : check.status === "FAIL" ? "✗" : "—";
      lines.push(`  ${icon} ${check.label}: ${check.detail ?? check.status}`);
    }
  }
  return lines.join("\n");
}

function getMockAnalysis(input: { projectName: string; healthScore: number }): PulseAnalysisOutput {
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
    executiveSummary: `[Mock data] ${input.projectName} has a health score of ${input.healthScore}/100. This is simulated analysis — configure an Anthropic API key in Settings → Integrations to generate real gap analysis.`,
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
      if (status !== 429 || attempt >= maxAttempts - 1) throw err;
      // Exponential backoff: 3s, 6s, 12s
      await new Promise((r) => setTimeout(r, 3000 * Math.pow(2, attempt)));
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

export async function analyseWithClaude(
  input: {
    projectName: string;
    inputType: PulseScanInputType;
    inputUrl: string | null;
    inputGithubRepo: string | null;
    inputDescription: string | null;
    healthScore: number;
    techStack: string[];
    checks: PulseScanCheckInput[];
  },
  aiConfig: { provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL"; apiKey: string | null; model: string; baseUrl: string | null },
): Promise<PulseAnalysisOutput> {
  if (!aiConfig.apiKey) {
    return getMockAnalysis({ projectName: input.projectName, healthScore: input.healthScore });
  }

  const inputRef =
    input.inputType === "URL"
      ? `URL: ${input.inputUrl}`
      : input.inputType === "GITHUB_REPO"
        ? `GitHub repo: ${input.inputGithubRepo}`
        : `Description: ${input.inputDescription}`;

  const userMessage = `Project: ${input.projectName}
Input type: ${input.inputType}
${inputRef}
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

Populate productionReadinessChecklist with 12–20 items. Base status on the scan results — DONE if check passed, MISSING if failed, PARTIAL if warn. Cover: Legal (Privacy Policy, Terms, Cookie consent, Refund policy), Auth (Login/signup, Password reset, Email verification, OAuth), Payments (Pricing page, Payment processing, Billing portal), Onboarding (Welcome flow, empty states), Support (Help page, FAQ), Trust (About, Testimonials, Changelog), Observability (Error monitoring, Analytics, Uptime), and any other gaps from the scan.

For techStackAnalysis: detected stack is [${input.techStack.length > 0 ? input.techStack.join(", ") : "unknown — infer from HTML signals, response headers, and scan results"}]. For detectedStack, fill in every field you can infer — use null only when you genuinely cannot tell. Give 4–10 recommendations covering the most important infrastructure gaps for this specific product vertical. Prioritise HIGH for anything that would cause data loss, downtime, or security breach in production. List 4–8 missing production-critical components specific to this project type.`;

  let rawContent: string;

  if (aiConfig.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: aiConfig.apiKey });
    const message = await withRetry(() =>
      client.messages.create({
        model: aiConfig.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      })
    );
    const block = message.content[0];
    if (!block || block.type !== "text") throw new Error("Unexpected response format from AI.");
    rawContent = block.text.trim();
  } else {
    // OpenAI SDK handles OpenAI, Gemini (via compatible endpoint), and local/Ollama
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      apiKey: aiConfig.apiKey ?? "local",
      ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {}),
    });
    const completion = await withRetry(() =>
      client.chat.completions.create({
        model: aiConfig.model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      })
    );
    rawContent = completion.choices[0]?.message?.content?.trim() ?? "";
  }

  // Gemini and some local models wrap JSON in markdown code fences.
  // Strip ```json ... ``` or ``` ... ``` wrappers before parsing.
  const extracted = extractJson(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    throw new Error(`AI returned invalid JSON. Raw response started with: ${rawContent.slice(0, 120)}`);
  }

  const result = pulseAnalysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI response did not match expected schema: ${result.error.issues[0]?.message}`);
  }

  return result.data;
}
