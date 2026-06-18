// Canonical catalogue of the Pulse check framework — the categories Pulse runs
// across every scan. Single source of truth for "what does Pulse cover": surfaced
// in-app (Pulse overview) and usable by the public product page / context page.
//
// Counts are approximate and indicative (some checks only fire for the relevant
// project type / platform). Keep this list in step with src/server/pulse-checks/*
// and the skipAllChecks catalogue in src/server/pulse-scan.ts.

export interface PulseFrameworkCategory {
  name: string;
  count: number;
  blurb: string;
  /** True for the 2026 AI-era categories added to diagnose AI-generated products. */
  aiEra?: boolean;
}

export const PULSE_FRAMEWORK: PulseFrameworkCategory[] = [
  { name: "AI Readiness", count: 13, blurb: "LLM production safety — cost monitoring, content safety, rate limits, streaming, error fallbacks, EU AI Act disclosure, evals", aiEra: true },
  { name: "Vibe Code Hygiene", count: 10, blurb: "What AI code generators leave behind — placeholder content, debug mode, default titles, AI comment markers, test credentials, missing 404s", aiEra: true },
  { name: "Secrets & Keys", count: 3, blurb: "Exposed API keys in committed source, committed .env files, prompt-injection vectors", aiEra: true },
  { name: "Security", count: 30, blurb: "CSP, HSTS, DNSSEC, CAA, COOP/CORP/COEP, exposed endpoints, secret patterns in HTML" },
  { name: "Legal & Compliance", count: 45, blurb: "GDPR, UK-GDPR, CCPA, LGPD, EU AI Act, DPA, cookie consent, auto-renewal disclosure" },
  { name: "Performance", count: 23, blurb: "Core Web Vitals, next-gen images, HTTP/3, lazy loading, critical CSS, minification" },
  { name: "Accessibility (WCAG)", count: 20, blurb: "Form labels, colour contrast, ARIA roles, captions, focus visibility, reduced-motion" },
  { name: "Authentication", count: 15, blurb: "MFA, passkeys/WebAuthn, breach detection, SSO/SAML, token hygiene, lockout policy" },
  { name: "Roles & Permissions", count: 20, blurb: "RBAC, tenant isolation, audit logs, SCIM, least-privilege tokens, invite workflows" },
  { name: "API Quality", count: 15, blurb: "Versioning, RFC 7807 errors, rate-limit headers, OpenAPI spec, sandbox, SDKs" },
  { name: "SEO", count: 15, blurb: "Structured data, canonical, sitemaps, Open Graph, preload hints, search verification" },
  { name: "Email Deliverability", count: 17, blurb: "SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT, reputable ESP signals" },
  { name: "Infrastructure", count: 15, blurb: "SSL, CDN, IPv6, multi-region, load balancing, feature flags, secrets manager" },
  { name: "Observability", count: 15, blurb: "Error monitoring, APM, RUM, uptime, distributed tracing, SLO/error budgets" },
  { name: "SaaS Readiness", count: 15, blurb: "Billing portal, onboarding, free trial, SSO, data export/import, public roadmap" },
  { name: "Payments", count: 13, blurb: "Stripe signals, 3DS/SCA, fraud detection, BNPL, invoicing, tax automation" },
  { name: "Business Operations", count: 15, blurb: "Company registration, VAT, SLAs, ROPA, modern-slavery & anti-bribery policies" },
  { name: "Global Distribution", count: 10, blurb: "hreflang, multi-currency, RTL, i18n, EU data residency, compliance certifications" },
  { name: "Trust & Brand", count: 10, blurb: "Customer logos, case studies, reviews, team bios, security whitepaper, awards" },
  { name: "App Store & Mobile", count: 14, blurb: "Store presence, deep links, Smart App Banner, PWA manifest, wallet payments" },
  { name: "Missing Pages", count: 16, blurb: "About, contact, pricing, docs, status, changelog, security, legal hub" },
  { name: "Code Quality", count: 20, blurb: "README, tests, CI/CD, TypeScript, linter, branch protection, CODEOWNERS" },
  { name: "Code Intelligence", count: 10, blurb: "Dependency vulnerabilities, PR review rate, commit velocity, contributors (GitHub)" },
];

/** Approx. total checks across the framework. */
export const PULSE_CHECK_TOTAL = PULSE_FRAMEWORK.reduce((sum, c) => sum + c.count, 0);
export const PULSE_CATEGORY_TOTAL = PULSE_FRAMEWORK.length;
