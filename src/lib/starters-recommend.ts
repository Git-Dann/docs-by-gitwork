import type { StarterListItem } from "@/server/starters";
import type { PulseScanRecord } from "@/types/pulse";

// ── Scan → Starter recommendation ────────────────────────────────────────────────
// Pure, dependency-free matcher. Builds a lowercase text corpus from a Pulse scan's signals
// (gaps, opportunities, blockers, failing checks, tech stack, classification) and scores each
// starter by how many of its tags the corpus mentions. Explainable: each match records the
// tag(s) that hit, surfaced as "Matches: …" chips. No AI, no network — runs client-side on
// the /app/starters?scanId=… page from data already fetched.

export interface StarterRecommendation {
  starter: StarterListItem;
  score: number;
  reasons: string[]; // matched tags, for display
}

// Tag → substrings to look for in the scan corpus. A tag with no entry falls back to the tag
// itself (hyphens as spaces). Kept intentionally broad — better to over-suggest than miss.
const TAG_MATCHERS: Record<string, string[]> = {
  content: ["content", "copy", "microcopy", "tone"],
  writing: ["writing", "copy", "wording", "grammar"],
  "marketing-copy": ["marketing copy", "copywriting", "landing copy"],
  seo: ["seo", "meta description", "meta tag", "sitemap", "robots", "search engine", "structured data", "canonical"],
  copywriting: ["copywriting", "copy", "messaging"],
  growth: ["growth", "conversion", "cro", "funnel", "retention", "acquisition"],
  marketing: ["marketing", "conversion", "cro", "campaign", "seo", "growth", "landing page"],
  "marketing-site": ["marketing site", "landing page", "homepage"],
  website: ["website", "landing page", "marketing site", "web presence", "homepage"],
  cms: ["cms", "content management", "blog"],
  "design-system": ["design system", "design token", "component", "consistency", "branding", "styling"],
  design: ["design", "visual", "layout", "branding"],
  ui: ["ui", "user interface", "frontend", "styling", "layout"],
  frontend: ["frontend", "front-end", "css"],
  taste: ["design", "polish", "visual quality", "generic", "dated"],
  accessibility: ["accessibility", "a11y", "aria", "contrast", "wcag"],
  audit: ["audit", "assessment"],
  security: ["security", "vulnerab", "auth", "https", "ssl", "tls", "header", "csp", "owasp", "xss", "secret", "encryption"],
  compliance: ["compliance", "gdpr", "cookie", "privacy", "regulatory", "consent"],
  testing: ["test", "coverage", "regression"],
  qa: ["qa", "quality assurance", "bug"],
  e2e: ["e2e", "end-to-end", "browser test", "integration test"],
  data: ["data", "database", "reporting"],
  analytics: ["analytics", "tracking", "metrics", "ga4", "google analytics", "events", "dashboard"],
  sql: ["sql", "database", "query", "postgres", "mysql"],
  devops: ["devops", "infrastructure", "docker", "kubernetes", "container", "pipeline", "monitoring"],
  "ci-cd": ["ci/cd", "ci cd", "continuous integration", "continuous deployment", "pipeline", "github actions", "build"],
  infra: ["infrastructure", "hosting", "server"],
  deploy: ["deploy", "hosting", "vercel", "release"],
  deployment: ["deployment", "deploy", "hosting", "release", "ship"],
  deployable: ["deploy", "self-hosted", "hosting"],
  integrations: ["integration", "api", "webhook", "third-party", "connect"],
  mcp: ["mcp", "integration"],
  mobile: ["mobile", "ios", "android", "app store", "native app"],
  ios: ["ios", "iphone", "swift", "app store"],
  android: ["android", "google play", "kotlin"],
  swiftui: ["swiftui", "swift"],
  planning: ["planning", "roadmap", "scope"],
  workflow: ["workflow", "process", "pipeline"],
  agentic: ["agent", "automation", "ai workflow"],
  "spec-driven": ["spec", "specification", "requirements"],
  subagents: ["subagent", "agent", "orchestration"],
  agents: ["agent", "automation"],
  review: ["review", "code review"],
  product: ["product", "discovery", "roadmap", "prioritis", "prioritiz", "backlog", "user research", "requirements"],
  discovery: ["discovery", "user research", "validation", "requirements"],
  specs: ["spec", "prd", "requirements"],
  scaffolding: ["scaffold", "boilerplate", "structure", "setup"],
  "code-quality": ["code quality", "lint", "tech debt", "refactor", "maintainability"],
  hooks: ["hook", "pre-commit", "quality gate"],
  commands: ["command", "automation"],
  plugins: ["plugin"],
  skills: ["skill"],
  roles: ["role", "team"],
  astro: ["astro"],
  // Intentionally too generic to match on — skip.
  reference: [],
  directory: [],
  source: [],
  projects: [],
};

function pushIf(parts: string[], value?: string | null) {
  if (value) parts.push(value);
}

/** Build a single lowercase string of the scan's meaningful signals. */
export function buildScanCorpus(scan: PulseScanRecord): string {
  const parts: string[] = [];
  pushIf(parts, scan.projectName);
  pushIf(parts, scan.platform);
  for (const t of scan.techStack ?? []) pushIf(parts, t);

  const a = scan.llmAnalysis;
  if (a) {
    pushIf(parts, a.projectClassification?.type);
    pushIf(parts, a.projectClassification?.subtype);
    for (const s of a.projectClassification?.signals ?? []) pushIf(parts, s);
    for (const v of a.projectClassification?.verticalInsights ?? []) pushIf(parts, v);
    for (const g of a.criticalGaps ?? []) {
      pushIf(parts, g.category);
      pushIf(parts, g.gap);
      pushIf(parts, g.impact);
    }
    for (const o of a.buildOpportunities ?? []) {
      pushIf(parts, o.title);
      pushIf(parts, o.description);
      pushIf(parts, o.category);
    }
    for (const d of a.techDebt ?? []) {
      pushIf(parts, d.area);
      pushIf(parts, d.description);
    }
    for (const b of a.productionBlockers ?? []) {
      pushIf(parts, b.category);
      pushIf(parts, b.blocker);
      pushIf(parts, b.why);
      pushIf(parts, b.recommendedService);
    }
    for (const r of a.productionReadinessChecklist ?? []) {
      if (r.status === "MISSING" || r.status === "PARTIAL") {
        pushIf(parts, r.category);
        pushIf(parts, r.item);
      }
    }
  }

  for (const c of scan.checks ?? []) {
    if (c.status === "FAIL" || c.status === "WARN") {
      pushIf(parts, c.category);
      pushIf(parts, c.label);
      pushIf(parts, c.checkKey);
    }
  }

  return parts.join(" • ").toLowerCase();
}

function matchersForTag(tag: string): string[] {
  const explicit = TAG_MATCHERS[tag];
  if (explicit) return explicit;
  // Fallback: the tag itself, and a spaced variant for hyphenated tags.
  const spaced = tag.replace(/-/g, " ");
  return spaced === tag ? [tag] : [tag, spaced];
}

/**
 * Rank starters against a scan. Returns only starters with at least one tag match, highest
 * score first (ties keep catalogue order). `reasons` lists the matched tags for display.
 */
export function recommendStartersForScan(
  scan: PulseScanRecord,
  starters: StarterListItem[],
): StarterRecommendation[] {
  const corpus = buildScanCorpus(scan);
  if (!corpus) return [];

  const scored: StarterRecommendation[] = [];
  starters.forEach((starter) => {
    const reasons: string[] = [];
    for (const tag of starter.tags) {
      const matchers = matchersForTag(tag);
      if (matchers.some((m) => m.length > 0 && corpus.includes(m))) {
        reasons.push(tag);
      }
    }
    if (reasons.length > 0) {
      scored.push({ starter, score: reasons.length, reasons });
    }
  });

  return scored.sort((a, b) => b.score - a.score);
}
