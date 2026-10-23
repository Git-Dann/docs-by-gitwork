/**
 * What Pulse is and what it does, in plain English — the source for the shareable
 * `/pulse/features` page and the "About Pulse" card on /app/pulse.
 *
 * ⚠️ This is the ONE place Pulse's capabilities are described. It has to stay true, so:
 *  - check counts and the area list are never written here; the page counts them from
 *    `CHECKS_REGISTRY` on every request;
 *  - `AREAS` is keyed by every `CheckCategory`, so adding a category is a type error until
 *    it has a plain-English line here;
 *  - every `EXTRAS` entry names the code that delivers it, and a test fails if that code
 *    is gone, so a removed feature cannot stay advertised.
 * Shipping a new Pulse capability? Add it to `EXTRAS` in the same PR (CLAUDE.md §80).
 *
 * Written as if everything had always been there: no "new", no dates, no "recently".
 */
import type { CheckCategory } from "@/server/pulse-checks/categories";
import { PULSE_PLATFORM_LABEL } from "@/lib/pulse-store-url";

export const PULSE_SUMMARY =
  "Pulse checks whether a product is ready to launch. Give it a website, a GitHub repo or an App Store, Google Play or Chrome Web Store listing. It runs only the checks that apply to that kind of product, says plainly what it could not check, and gives a ready or not-ready verdict.";

/** What can be scanned. */
export const PULSE_INPUTS: { name: string; detail: string }[] = [
  { name: "A website", detail: "Any public URL — a SaaS app, a marketing site or an API." },
  { name: "A GitHub repo", detail: "The source itself: code health, secrets, tests, CI and platform-specific checks." },
  { name: "A store listing", detail: "App Store, Google Play or Chrome Web Store, read from the live listing." },
];

/**
 * One line per check area, in the order the page lists them. Keyed by every category, so
 * a new one cannot ship undescribed.
 */
export const AREAS: Record<CheckCategory, { name: string; covers: string }> = {
  Security: { name: "Security", covers: "HTTPS and security headers, DNS security, exposed admin endpoints and leaked files" },
  "Secrets & Keys": { name: "Secrets & keys", covers: "API keys in committed code, committed .env files" },
  Authentication: { name: "Authentication", covers: "Two-factor login, passkeys, single sign-on, account lockout" },
  "Roles & Permissions": { name: "Roles & permissions", covers: "Who can see what, keeping customers' data apart, audit logs" },
  Payments: { name: "Payments", covers: "Stripe setup, card security (3DS), fraud checks, invoicing, tax" },
  "Code Quality": { name: "Code quality", covers: "README, tests, CI, linting, branch protection, dependencies and overall code health" },
  "Build & Supply Chain": { name: "Build & supply chain", covers: "How safely code gets built and shipped, containers, where dependencies come from" },
  Infrastructure: { name: "Infrastructure", covers: "SSL, CDN, IPv6, redundancy, how secrets are stored" },
  Observability: { name: "Observability", covers: "Error tracking, performance monitoring, uptime, tracing" },
  Performance: { name: "Performance", covers: "Page speed scores, image formats, lazy loading, minified files" },
  "Legal & Compliance": { name: "Legal & compliance", covers: "UK GDPR, GDPR, CCPA, EU AI Act, cookie consent, privacy policy and terms" },
  "Business Operations": { name: "Business operations", covers: "Company number, VAT, SLAs, required company policies" },
  "Email Deliverability": { name: "Email deliverability", covers: "SPF, DKIM, DMARC and related email settings" },
  "SaaS Readiness": { name: "SaaS readiness", covers: "Billing portal, onboarding, free trial, data export, roadmap" },
  "Missing Pages": { name: "Missing pages", covers: "About, contact, pricing, docs, status, changelog, security" },
  SEO: { name: "SEO", covers: "Structured data, sitemaps, link previews, search console" },
  "AEO & AI Discoverability": { name: "AEO & AI discoverability", covers: "Whether AI tools can find and read the site (llms.txt, AI crawler access)" },
  "AI Safety": { name: "AI safety", covers: "Prompt and output guardrails, exposed system prompts and keys, jailbreak resistance" },
  "AI Readiness": { name: "AI readiness", covers: "AI cost monitoring, content safety, fallbacks, EU AI Act disclosure" },
  "Vibe Code Hygiene": { name: "Vibe-code hygiene", covers: "Leftovers from AI coding tools: placeholder text, debug mode, test logins" },
  Accessibility: { name: "Accessibility", covers: "WCAG: form labels, contrast, screen-reader roles, captions, focus" },
  "Mobile & Accessibility": { name: "Mobile", covers: "Mobile layout, installable web app, offline support" },
  "App Store & Mobile": { name: "App Store & mobile", covers: "Deep links, app banners, plus dedicated iOS, Android, Flutter and React Native checks" },
  "Store Listing": { name: "Store listing", covers: "Read from the live App Store, Play or Chrome listing: privacy labels, screenshots, ratings" },
  "API Quality": { name: "API quality", covers: "Versioning, error format, rate limits, OpenAPI spec, live endpoint behaviour" },
  "Global Distribution": { name: "Global distribution", covers: "Multi-language support, currencies, EU data residency" },
  "Trust & Brand": { name: "Trust & brand", covers: "Customer logos, case studies, reviews, team" },
  "Social & Marketing": { name: "Social & marketing", covers: "Link previews, social profiles" },
  "Standards Verification": { name: "Standards verification", covers: "Controls that need evidence beyond what Pulse can see, shown only when there is evidence" },
};

/**
 * Everything Pulse does beyond the checks. `evidence` is the code that delivers it, checked
 * by a test so nothing removed stays on the page. Not shown to readers.
 */
export const EXTRAS: { name: string; detail: string; evidence: string }[] = [
  { name: "A ready / not-ready verdict", detail: "One release decision per scan, judged by the bar for that kind of product.", evidence: "src/server/pulse-checks/release-decision.ts" },
  { name: "Six summary scores", detail: "Security, access, code, reliability, legal and experience, with their weights published.", evidence: "src/server/pulse-checks/pillars.ts" },
  { name: "A score per market", detail: "UK, EU and US compliance scored separately.", evidence: "src/server/pulse-checks/jurisdictions.ts" },
  { name: "An AI summary and fix plan", detail: "Optional: the gaps that matter most and what to build next, written up.", evidence: "src/server/pulse-ai.ts" },
  { name: "Comparison with other scans", detail: "Where a product sits against others of the same kind, and what changed since its last scan.", evidence: "src/app/api/pulse/scans/[scanId]/benchmarks/route.ts" },
  { name: "Fixes as pull requests", detail: "For a GitHub repo, fixes can be opened as a pull request.", evidence: "src/server/pulse-agents/fix-agent.ts" },
  { name: "Shareable reports and PDFs", detail: "A private link to the full report, and a designed PDF.", evidence: "src/app/report/[token]/page.tsx" },
  { name: "Proposals from a scan", detail: "Turn a scan into a costed proposal in Docs.", evidence: "src/app/api/pulse/scans/[scanId]/generate-proposal/route.ts" },
  { name: "A free public scanner", detail: "An embeddable widget and a public page; the full report is emailed as a PDF.", evidence: "src/app/embed/pulse/page.tsx" },
  { name: "Leads", detail: "Everyone who runs the free scanner, ready to turn into a full scan.", evidence: "src/server/pulse-lite/leads-admin.ts" },
  { name: "Monitors", detail: "A repo re-scanned on every push, with alerts when the score drops.", evidence: "src/server/pulse-agents/monitor.ts" },
  { name: "Countermark certificates and badges", detail: "A signed, expiring certificate of what a scan found, and a score badge for a client's own site.", evidence: "src/server/provenance/issue.ts" },
  { name: "Scans from Claude", detail: "Claude can run a scan and read the result through Foundry's MCP connector.", evidence: "src/server/mcp/handler.ts" },
];

/** Every product type Pulse understands — the scan form's own list, so the two cannot differ. */
export const PULSE_PLATFORMS: string[] = Object.entries(PULSE_PLATFORM_LABEL)
  .filter(([key]) => key !== "OTHER")
  .map(([, label]) => label);
