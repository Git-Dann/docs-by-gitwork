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

const pulseTechStackAnalysisSchema = z.object({
  assessment: z.string(),
  recommendations: z.array(techStackRecommendationSchema),
  missingForProduction: z.array(z.string()),
});

const pulseAnalysisOutputSchema = z.object({
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

Your clients are "vibe coders" — founders and makers who built their app using tools like Lovable, Bolt, v0, Cursor, Claude Code, Replit Agent, or similar AI coding assistants. These apps typically share a predictable set of gaps:
- Legal pages missing (no Privacy Policy, Terms, Cookie consent)
- No error monitoring, observability, or health checks
- Auth is bolted on but missing edge cases (password reset, email verification, session management)
- No onboarding flow, billing portal, or customer support channel
- Payments exist but have no billing management for subscribers
- No CI/CD, tests, or structured error handling
- Missing standard trust-building pages (About, Contact, FAQ, Changelog)
- Accessibility and mobile experience are afterthoughts
- No social proof or conversion-focused copy

You are briefing the Gitwork consulting team — not the client directly. Be specific, commercially minded, and prioritise what will have the biggest impact on getting this product to market and keeping users.

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
      assessment: "[Mock] Based on the scan signals, this appears to be a modern JavaScript/TypeScript application. The stack is appropriate for an early-stage product but will need hardening for production scale. Key gaps are likely in background processing and observability.",
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
    "assessment": "string — 2–3 sentence paragraph assessing the detected tech stack from a production-readiness standpoint. Is it appropriate for the product's scale? What are the risks of the current stack choices?",
    "recommendations": [
      {
        "area": "string — e.g. Database, Auth, Email, Monitoring, Testing, Deployment, Caching, CDN, Search",
        "current": "string or null — what's detected in the stack (null if nothing detected)",
        "recommended": "string — specific tool/service to add or switch to",
        "reason": "string — why this recommendation matters for production readiness",
        "priority": "HIGH | MEDIUM | LOW"
      }
    ],
    "missingForProduction": ["string — list of production-critical components not detected in the stack, e.g. 'Background job queue', 'Rate limiting', 'Database connection pooling', 'Secrets management'"]
  }
}

Populate productionReadinessChecklist with 12–20 items covering the full prompt-to-production checklist for a SaaS product. Base status on the scan results — if a check passed, mark DONE; if failed, MISSING; if warn, PARTIAL. Include items from: Legal (Privacy Policy, Terms, Cookie consent, Refund policy), Auth (Login/signup, Password reset, Email verification, OAuth provider), Payments (Pricing page, Payment processing, Billing portal, Subscription management), Onboarding (Welcome flow, Activation steps, Empty states), Support (Help page, Chat widget, FAQ), Trust (About page, Testimonials, Changelog), Observability (Error monitoring, Analytics, Uptime monitoring), and any other gaps you identify from the scan.

For techStackAnalysis: base the assessment and recommendations on the detected tech stack (${input.techStack.length > 0 ? input.techStack.join(", ") : "unknown — infer from scan signals"}). Give 3–8 recommendations covering areas like database, caching, email delivery, background jobs, monitoring, CDN, and testing. Identify 3–6 production-critical components that are likely missing based on typical vibe-coded app patterns.`;

  let rawContent: string;

  if (aiConfig.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: aiConfig.apiKey });
    const message = await client.messages.create({
      model: aiConfig.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
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
    const completion = await client.chat.completions.create({
      model: aiConfig.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });
    rawContent = completion.choices[0]?.message?.content?.trim() ?? "";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("AI returned invalid JSON.");
  }

  const result = pulseAnalysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI response did not match expected schema: ${result.error.issues[0]?.message}`);
  }

  return result.data;
}
