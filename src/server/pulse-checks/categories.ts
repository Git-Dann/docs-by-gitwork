// ─────────────────────────────────────────────────────────────────────────────
// PULSE CHECK CATEGORIES — THE SINGLE SOURCE OF TRUTH.
//
// Every Pulse check is tagged with a category. This file is the ONE place that
// defines what categories exist, how they group into report domains, which count
// double toward the score, and how they read on the marketing surfaces. Everything
// else derives from here:
//
//   • PulseScanCheckInput.category is typed `CheckCategory` (types/pulse.ts) — so a
//     typo'd or unregistered category is a COMPILE ERROR, not a silent drift.
//   • checks-registry.ts tags every check with CATEGORIES.* (never a raw string).
//   • score-breakdown.ts + priority.ts import WEIGHTED_CATEGORIES from here.
//   • Both report pages import DOMAIN_DEFS from here.
//   • pulse-framework.ts derives its counts from the registry, grouped by CATEGORIES.
//   • categories.reconcile.test.ts fails CI if any of the above drifts.
//
// ▶ TO ADD A CHECK CATEGORY: add one entry to CATEGORIES + one row to CATEGORY_META
//   (assign a domain + weight + blurb). Nothing else needs editing — order, weights,
//   report grouping, the settings panel and the framework counts all follow.
// ▶ TO ADD A CHECK: use CATEGORIES.<X> for its `category`, and add its row to
//   checks-registry.ts. The reconciliation test enforces both.
// ─────────────────────────────────────────────────────────────────────────────

/** The canonical category names. Check modules reference these — never a literal. */
export const CATEGORIES = {
  STORE_LISTING: "Store Listing",
  SEO: "SEO",
  AEO: "AEO & AI Discoverability",
  INFRASTRUCTURE: "Infrastructure",
  SECURITY: "Security",
  SECRETS_KEYS: "Secrets & Keys",
  PERFORMANCE: "Performance",
  PAYMENTS: "Payments",
  AUTHENTICATION: "Authentication",
  OBSERVABILITY: "Observability",
  LEGAL: "Legal & Compliance",
  MISSING_PAGES: "Missing Pages",
  SAAS: "SaaS Readiness",
  MOBILE: "Mobile & Accessibility",
  ACCESSIBILITY: "Accessibility",
  CODE_QUALITY: "Code Quality",
  APP_STORE: "App Store & Mobile",
  GLOBAL_DISTRIBUTION: "Global Distribution",
  TRUST_BRAND: "Trust & Brand",
  ROLES: "Roles & Permissions",
  EMAIL: "Email Deliverability",
  BUSINESS_OPS: "Business Operations",
  API_QUALITY: "API Quality",
  AI_READINESS: "AI Readiness",
  AI_SAFETY: "AI Safety",
  VIBE_HYGIENE: "Vibe Code Hygiene",
} as const;

export type CheckCategory = (typeof CATEGORIES)[keyof typeof CATEGORIES];

/** Report-view domains, in display order, with their accent colour. */
export type DomainName =
  | "Infrastructure & DevOps"
  | "Security & Authentication"
  | "AI Era"
  | "Code Quality"
  | "Legal & Compliance"
  | "Production Readiness"
  | "SEO & Presence"
  | "Mobile & Accessibility"
  | "Roles & Permissions"
  | "Email Deliverability"
  | "Business Operations"
  | "API Quality";

export const DOMAIN_ORDER: { name: DomainName; color: string }[] = [
  { name: "Infrastructure & DevOps", color: "#4f46e5" },
  { name: "Security & Authentication", color: "#dc2626" },
  { name: "AI Era", color: "#9333ea" },
  { name: "Code Quality", color: "#0891b2" },
  { name: "Legal & Compliance", color: "#7c3aed" },
  { name: "Production Readiness", color: "#d97706" },
  { name: "SEO & Presence", color: "#059669" },
  { name: "Mobile & Accessibility", color: "#db2777" },
  { name: "Roles & Permissions", color: "#7c3aed" },
  { name: "Email Deliverability", color: "#0891b2" },
  { name: "Business Operations", color: "#d97706" },
  { name: "API Quality", color: "#059669" },
];

export interface CategoryMeta {
  name: CheckCategory;
  /** Which report-view domain this category rolls up into. */
  domain: DomainName;
  /** Counts double toward the health score + fix priority (production-critical). */
  weighted: boolean;
  /** 2026 AI-era category (themed distinctly on the marketing surfaces). */
  aiEra: boolean;
  /** One-line "what this covers" used on the framework / overview surfaces. */
  blurb: string;
}

// Authored in display order, grouped by domain. ORDERED_CATEGORIES + DOMAIN_DEFS
// both derive from this array's order.
export const CATEGORY_META: CategoryMeta[] = [
  // Infrastructure & DevOps
  { name: CATEGORIES.INFRASTRUCTURE, domain: "Infrastructure & DevOps", weighted: true, aiEra: false, blurb: "SSL, CDN, IPv6, multi-region, load balancing, feature flags, secrets manager" },
  { name: CATEGORIES.OBSERVABILITY, domain: "Infrastructure & DevOps", weighted: false, aiEra: false, blurb: "Error monitoring, APM, RUM, uptime, distributed tracing, SLO/error budgets" },
  { name: CATEGORIES.PERFORMANCE, domain: "Infrastructure & DevOps", weighted: false, aiEra: false, blurb: "Core Web Vitals, next-gen images, HTTP/3, lazy loading, critical CSS, minification" },
  // Security & Authentication
  { name: CATEGORIES.SECURITY, domain: "Security & Authentication", weighted: true, aiEra: false, blurb: "CSP, HSTS, DNSSEC, CAA, COOP/CORP/COEP, exposed endpoints, secret patterns in HTML" },
  { name: CATEGORIES.SECRETS_KEYS, domain: "Security & Authentication", weighted: false, aiEra: true, blurb: "Exposed API keys in committed source, committed .env files, prompt-injection vectors" },
  { name: CATEGORIES.AUTHENTICATION, domain: "Security & Authentication", weighted: false, aiEra: false, blurb: "MFA, passkeys/WebAuthn, breach detection, SSO/SAML, token hygiene, lockout policy" },
  { name: CATEGORIES.PAYMENTS, domain: "Security & Authentication", weighted: false, aiEra: false, blurb: "Stripe signals, 3DS/SCA, fraud detection, BNPL, invoicing, tax automation" },
  // AI Era
  { name: CATEGORIES.AI_READINESS, domain: "AI Era", weighted: false, aiEra: true, blurb: "LLM production safety — cost monitoring, content safety, rate limits, streaming, error fallbacks, EU AI Act disclosure" },
  { name: CATEGORIES.AI_SAFETY, domain: "AI Era", weighted: true, aiEra: true, blurb: "AI application safety — prompt/output guardrails, system-prompt & key exposure, jailbreak resistance, rate limits" },
  { name: CATEGORIES.AEO, domain: "AI Era", weighted: false, aiEra: true, blurb: "Answer-engine optimisation — llms.txt, AI-crawler access, valid JSON-LD, crawl-without-JS content, semantic HTML, agent-ready repo" },
  { name: CATEGORIES.VIBE_HYGIENE, domain: "AI Era", weighted: false, aiEra: true, blurb: "What AI code generators leave behind — placeholder content, debug mode, default titles, AI comment markers, test credentials, missing 404s" },
  // Code Quality
  { name: CATEGORIES.CODE_QUALITY, domain: "Code Quality", weighted: false, aiEra: false, blurb: "README, tests, CI/CD, TypeScript, linter, branch protection, CODEOWNERS, dependency intelligence" },
  // Legal & Compliance
  { name: CATEGORIES.LEGAL, domain: "Legal & Compliance", weighted: true, aiEra: false, blurb: "GDPR, UK-GDPR, CCPA, LGPD, EU AI Act, DPA, cookie consent, auto-renewal disclosure" },
  // Production Readiness
  { name: CATEGORIES.SAAS, domain: "Production Readiness", weighted: false, aiEra: false, blurb: "Billing portal, onboarding, free trial, SSO, data export/import, public roadmap" },
  { name: CATEGORIES.MISSING_PAGES, domain: "Production Readiness", weighted: false, aiEra: false, blurb: "About, contact, pricing, docs, status, changelog, security, legal hub" },
  // SEO & Presence
  { name: CATEGORIES.SEO, domain: "SEO & Presence", weighted: false, aiEra: false, blurb: "Structured data, canonical, sitemaps, Open Graph, preload hints, search verification" },
  { name: CATEGORIES.STORE_LISTING, domain: "SEO & Presence", weighted: false, aiEra: false, blurb: "App name, description, screenshots, ratings, privacy label, data safety section" },
  { name: CATEGORIES.TRUST_BRAND, domain: "SEO & Presence", weighted: false, aiEra: false, blurb: "Customer logos, case studies, reviews, team bios, security whitepaper, awards" },
  { name: CATEGORIES.GLOBAL_DISTRIBUTION, domain: "SEO & Presence", weighted: false, aiEra: false, blurb: "hreflang, multi-currency, RTL, i18n, EU data residency, compliance certifications" },
  // Mobile & Accessibility
  { name: CATEGORIES.MOBILE, domain: "Mobile & Accessibility", weighted: false, aiEra: false, blurb: "Viewport, PWA manifest, web push, offline, reduced-motion, biometric auth signals" },
  { name: CATEGORIES.APP_STORE, domain: "Mobile & Accessibility", weighted: false, aiEra: false, blurb: "Store presence, deep links, Smart App Banner, PWA manifest, wallet payments" },
  { name: CATEGORIES.ACCESSIBILITY, domain: "Mobile & Accessibility", weighted: false, aiEra: false, blurb: "Form labels, colour contrast, ARIA roles, captions, focus visibility, reduced-motion (WCAG)" },
  // Standalone domains
  { name: CATEGORIES.ROLES, domain: "Roles & Permissions", weighted: false, aiEra: false, blurb: "RBAC, tenant isolation, audit logs, SCIM, least-privilege tokens, invite workflows" },
  { name: CATEGORIES.EMAIL, domain: "Email Deliverability", weighted: false, aiEra: false, blurb: "SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT, reputable ESP signals" },
  { name: CATEGORIES.BUSINESS_OPS, domain: "Business Operations", weighted: false, aiEra: false, blurb: "Company registration, VAT, SLAs, ROPA, modern-slavery & anti-bribery policies" },
  { name: CATEGORIES.API_QUALITY, domain: "API Quality", weighted: false, aiEra: false, blurb: "Versioning, RFC 7807 errors, rate-limit headers, OpenAPI spec, sandbox, SDKs, live endpoint health (broken/incomplete/unverified)" },
];

// ── Derived — do not hand-maintain any of these ──────────────────────────────

/** All categories, in canonical display order. */
export const ORDERED_CATEGORIES: CheckCategory[] = CATEGORY_META.map((m) => m.name);

/** Categories that count double toward the health score + fix priority. */
export const WEIGHTED_CATEGORIES: ReadonlySet<string> = new Set(
  CATEGORY_META.filter((m) => m.weighted).map((m) => m.name),
);

export interface CategoryDomainDef {
  label: DomainName;
  color: string;
  categories: CheckCategory[];
}

/** Report-view domain groupings, derived from CATEGORY_META. Shared by both reports. */
export const DOMAIN_DEFS: CategoryDomainDef[] = DOMAIN_ORDER.map((d) => ({
  label: d.name,
  color: d.color,
  categories: CATEGORY_META.filter((m) => m.domain === d.name).map((m) => m.name),
})).filter((d) => d.categories.length > 0);

const META_BY_NAME = new Map<string, CategoryMeta>(CATEGORY_META.map((m) => [m.name, m]));

/** Metadata for a category name (undefined for historical/unknown categories). */
export function categoryMeta(name: string): CategoryMeta | undefined {
  return META_BY_NAME.get(name);
}

/** Type guard — is this string a currently-registered category? */
export function isCheckCategory(name: string): name is CheckCategory {
  return META_BY_NAME.has(name);
}
