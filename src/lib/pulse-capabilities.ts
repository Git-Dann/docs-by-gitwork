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
 * Shipping a new Pulse capability? Add it to `EXTRAS` in the same PR (CLAUDE.md §81).
 *
 * Written as if everything had always been there: no "new", no dates, no "recently".
 */
import type { CheckCategory } from "@/server/pulse-checks/categories";
import { PULSE_PLATFORM_LABEL } from "@/lib/pulse-store-url";

export const PULSE_SUMMARY =
  "Pulse checks whether a product is ready to launch. Give it a website, a GitHub repo or an App Store, Google Play or Chrome Web Store listing. It runs only the checks that apply to that kind of product, says plainly what it could not check, and gives a ready or not-ready verdict.";

/** What can be scanned. */
/**
 * What can be scanned, and which product types each way in covers. `products` are keys of
 * the scan form's PULSE_PLATFORM_LABEL, so a renamed type cannot drift from the form.
 * A store link covers the Mac App Store too, which is scanned as a desktop app.
 */
export const PULSE_INPUTS: { name: string; detail: string; products: string[] }[] = [
  {
    name: "A website",
    detail: "Any public URL: a SaaS app, a marketing site or an API. For any other product, its public site.",
    products: ["WEB_APP", "SAAS", "MARKETING_SITE", "API_BACKEND"],
  },
  {
    name: "A GitHub repo",
    detail: "The source itself: code health, secrets, tests, CI and platform-specific checks.",
    products: ["WEB_APP", "SAAS", "MARKETING_SITE", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP", "CHROME_EXTENSION", "API_BACKEND", "CLI_TOOL"],
  },
  {
    name: "A store listing",
    detail: "App Store, Google Play or Chrome Web Store, read from the live listing.",
    products: ["IOS_APP", "ANDROID_APP", "DESKTOP_APP", "CHROME_EXTENSION"],
  },
];

/** The sections the page groups areas into, in display order. Plain words, for a reader. */
export const AREA_GROUPS = [
  { id: "security", name: "Security & access", line: "Is it safe, and can only the right people get in?" },
  { id: "code", name: "Code & delivery", line: "Is the code sound, and is it built and shipped safely?" },
  { id: "infra", name: "Infrastructure & APIs", line: "Will it stay up, stay fast, and behave as an API should?" },
  { id: "ai", name: "AI", line: "If it uses AI, is that safe and affordable, and can AI tools find it?" },
  { id: "legal", name: "Legal & business", line: "Is it legally ready to sell, and does its email arrive?" },
  { id: "product", name: "Product & growth", line: "Does it look and work like a finished product people can find?" },
  { id: "apps", name: "Apps & accessibility", line: "Is the app store-ready, and can everyone use it?" },
  { id: "standards", name: "Standards", line: "Formal controls, shown when there is evidence to judge them." },
] as const;

export type AreaGroupId = (typeof AREA_GROUPS)[number]["id"];

/**
 * One line per check area, in the order the page lists them. Keyed by every category, so
 * a new one cannot ship undescribed.
 */
export const AREAS: Record<CheckCategory, { group: AreaGroupId; name: string; covers: string }> = {
  Security: { group: "security", name: "Security", covers: "HTTPS and security headers, DNS security, exposed admin endpoints and leaked files" },
  "Secrets & Keys": { group: "security", name: "Secrets & keys", covers: "API keys in committed code, committed .env files" },
  Authentication: { group: "security", name: "Authentication", covers: "Two-factor login, passkeys, single sign-on, account lockout" },
  "Roles & Permissions": { group: "security", name: "Roles & permissions", covers: "Who can see what, keeping customers' data apart, audit logs" },
  Payments: { group: "security", name: "Payments", covers: "Stripe setup, card security (3DS), fraud checks, invoicing, tax" },
  "Code Quality": { group: "code", name: "Code quality", covers: "README, tests, CI, linting, branch protection, dependencies and overall code health" },
  "Build & Supply Chain": { group: "code", name: "Build & supply chain", covers: "How safely code gets built and shipped, containers, where dependencies come from" },
  Infrastructure: { group: "infra", name: "Infrastructure", covers: "SSL, CDN, IPv6, redundancy, how secrets are stored" },
  Observability: { group: "infra", name: "Observability", covers: "Error tracking, performance monitoring, uptime, tracing" },
  Performance: { group: "infra", name: "Performance", covers: "Page speed scores, image formats, lazy loading, minified files" },
  "Legal & Compliance": { group: "legal", name: "Legal & compliance", covers: "UK GDPR, GDPR, CCPA, EU AI Act, cookie consent, privacy policy and terms" },
  "Business Operations": { group: "legal", name: "Business operations", covers: "Company number, VAT, SLAs, required company policies" },
  "Email Deliverability": { group: "legal", name: "Email deliverability", covers: "SPF, DKIM, DMARC and related email settings" },
  "SaaS Readiness": { group: "product", name: "SaaS readiness", covers: "Billing portal, onboarding, trials, data export, roadmap" },
  "Missing Pages": { group: "product", name: "Missing pages", covers: "About, contact, pricing, docs, status, changelog, security" },
  SEO: { group: "product", name: "SEO", covers: "Structured data, sitemaps, link previews, search console" },
  "AEO & AI Discoverability": { group: "ai", name: "AEO & AI discoverability", covers: "Whether AI tools can find and read the site (llms.txt, AI crawler access)" },
  "AI Safety": { group: "ai", name: "AI safety", covers: "Prompt and output guardrails, exposed system prompts and keys, jailbreak resistance" },
  "AI Readiness": { group: "ai", name: "AI readiness", covers: "AI cost monitoring, content safety, fallbacks, EU AI Act disclosure" },
  "Vibe Code Hygiene": { group: "code", name: "Vibe-code hygiene", covers: "Leftovers from AI coding tools: placeholder text, debug mode, test logins" },
  Accessibility: { group: "apps", name: "Accessibility", covers: "WCAG: form labels, contrast, screen-reader roles, captions, focus" },
  "Mobile & Accessibility": { group: "apps", name: "Mobile", covers: "Mobile layout, installable web app, offline support" },
  "App Store & Mobile": { group: "apps", name: "App Store & mobile", covers: "Deep links, app banners, plus dedicated iOS, Android, Flutter and React Native checks" },
  "Store Listing": { group: "apps", name: "Store listing", covers: "Read from the live App Store, Play or Chrome listing: privacy labels, screenshots, ratings" },
  "API Quality": { group: "infra", name: "API quality", covers: "Versioning, error format, rate limits, OpenAPI spec, live endpoint behaviour" },
  "Global Distribution": { group: "product", name: "Global distribution", covers: "Multi-language support, currencies, EU data residency" },
  "Trust & Brand": { group: "product", name: "Trust & brand", covers: "Customer logos, case studies, reviews, team" },
  "Social & Marketing": { group: "product", name: "Social & marketing", covers: "Link previews, social profiles" },
  "Standards Verification": { group: "standards", name: "Standards verification", covers: "Controls that need evidence beyond what Pulse can see, shown only when there is evidence" },
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
  { name: "Code health and a tech-debt register", detail: "Every source file of a repo parsed, not sampled: each complex, long or oversized function and class listed worst first, linked to its line, with the effort to clear it.", evidence: "src/server/code-health/analyse.ts" },
  { name: "Hotspots and who knows the code", detail: "A year of git history: complex code that changes most, the bus factor, and files that always change together.", evidence: "src/server/code-health/history.ts" },
  { name: "A weekly email", detail: "A monitored project's score, what was fixed, what appeared and its code health, emailed every week to whoever needs it.", evidence: "src/server/pulse-agents/monitor-digest.ts" },
  { name: "Fixes as pull requests", detail: "For a GitHub repo, fixes can be opened as a pull request.", evidence: "src/server/pulse-agents/fix-agent.ts" },
  { name: "Shareable reports and PDFs", detail: "A private link to the full report, and a designed PDF.", evidence: "src/app/report/[token]/page.tsx" },
  { name: "Proposals from a scan", detail: "Turn a scan into a costed proposal in Docs.", evidence: "src/app/api/pulse/scans/[scanId]/generate-proposal/route.ts" },
  { name: "A public scanner", detail: "An embeddable widget and a public page, at no charge to the visitor. The full report is emailed as a PDF.", evidence: "src/app/embed/pulse/page.tsx" },
  { name: "Leads", detail: "Everyone who runs the public scanner, ready to turn into a full scan.", evidence: "src/server/pulse-lite/leads-admin.ts" },
  { name: "Monitors", detail: "A repo re-scanned on every push, with alerts when the score drops.", evidence: "src/server/pulse-agents/monitor.ts" },
  { name: "Countermark certificates and badges", detail: "A signed, expiring certificate of what a scan found, and a score badge for a client's own site.", evidence: "src/server/provenance/issue.ts" },
  { name: "Scans from Claude", detail: "Claude can run a scan and read the result through Foundry's MCP connector.", evidence: "src/server/mcp/handler.ts" },
];

/** How a scan works, start to finish. */
export const PULSE_STEPS: { title: string; detail: string }[] = [
  { title: "Point it at something", detail: "A website, a GitHub repo, or an App Store, Google Play or Chrome Web Store listing." },
  { title: "It works out what it is", detail: "Web app, iOS app, API, CLI and so on, then runs only the checks that apply." },
  { title: "Every check gives an answer", detail: "Pass, warning or fail, with the evidence. If it could not check something, it says so." },
  { title: "You get the verdict", detail: "Ready or not ready, six summary scores, a score per market and, optionally, a fix plan." },
];

/** Every product type Pulse understands — the scan form's own list, so the two cannot differ. */
export const PULSE_PLATFORMS: string[] = Object.entries(PULSE_PLATFORM_LABEL)
  .filter(([key]) => key !== "OTHER")
  .map(([, label]) => label);
