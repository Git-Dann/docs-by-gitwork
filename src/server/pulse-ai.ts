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

export async function analyseWithClaude(input: {
  projectName: string;
  inputType: PulseScanInputType;
  inputUrl: string | null;
  inputGithubRepo: string | null;
  inputDescription: string | null;
  healthScore: number;
  techStack: string[];
  checks: PulseScanCheckInput[];
}): Promise<PulseAnalysisOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
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
  ]
}

Populate productionReadinessChecklist with 12–20 items covering the full prompt-to-production checklist for a SaaS product. Base status on the scan results — if a check passed, mark DONE; if failed, MISSING; if warn, PARTIAL. Include items from: Legal (Privacy Policy, Terms, Cookie consent, Refund policy), Auth (Login/signup, Password reset, Email verification, OAuth provider), Payments (Pricing page, Payment processing, Billing portal, Subscription management), Onboarding (Welcome flow, Activation steps, Empty states), Support (Help page, Chat widget, FAQ), Trust (About page, Testimonials, Changelog), Observability (Error monitoring, Analytics, Uptime monitoring), and any other gaps you identify from the scan.`;

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from AI.");
  }

  const rawContent = block.text.trim();

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
