/**
 * Example results for the /pulse/features overview: what a scan of each kind of product
 * comes back with. ILLUSTRATIVE, not any client's result, and the page labels them so.
 *
 * The findings are the kinds Pulse really reports (most are taken from real defects it
 * found in audits), with names and numbers made up. Overall scores are never typed in:
 * `exampleScore` weights the pillar scores exactly as the scan does (the PILLARS weights,
 * passed in by the server page), so an example cannot show a total the formula would not.
 */

export type ExampleStatus = "FAIL" | "WARN" | "PASS";
export type PillarKey = "security" | "access" | "code" | "reliability" | "legal" | "experience";

export interface ExampleFinding {
  status: ExampleStatus;
  area: string;
  title: string;
  evidence: string;
}

export interface ExampleScan {
  id: string;
  label: string;
  /** What was scanned, as the report would name it. */
  subject: string;
  verdict: "Ready" | "Conditional" | "Not ready";
  /** null = that pillar had nothing to measure for this product, so its weight is shared out. */
  pillars: Record<PillarKey, number | null>;
  findings: ExampleFinding[];
  codeHealth?: { score: number; effortDays: number; busFactor: number; hotspots: string[] };
}

export const EXAMPLE_SCANS: ExampleScan[] = [
  {
    id: "web",
    label: "Web app",
    subject: "app.example-saas.com",
    verdict: "Not ready",
    pillars: { security: 58, access: 52, code: null, reliability: 85, legal: 61, experience: 90 },
    findings: [
      { status: "FAIL", area: "Security", title: "Row-level security is off on the profiles table", evidence: "The public key read rows from profiles without signing in." },
      { status: "WARN", area: "Legal & compliance", title: "Analytics loads before any cookie choice", evidence: "Google Analytics was requested before the consent banner was answered." },
      { status: "PASS", area: "Security", title: "HTTPS is enforced, with HSTS preload", evidence: "max-age=63072000; includeSubDomains; preload" },
    ],
  },
  {
    id: "ios",
    label: "iOS app",
    subject: "example/fitness-ios",
    verdict: "Conditional",
    pillars: { security: 70, access: 75, code: 66, reliability: 72, legal: 80, experience: 84 },
    findings: [
      { status: "FAIL", area: "App Store & mobile", title: "Login tokens are kept in UserDefaults, not the Keychain", evidence: "SessionStore.swift writes accessToken to UserDefaults." },
      { status: "WARN", area: "App Store & mobile", title: "Video ignores Low Data Mode", evidence: "AVPlayer streams one .mp4 bitrate with no constrained-network check." },
      { status: "PASS", area: "App Store & mobile", title: "The privacy manifest declares its tracking domains", evidence: "PrivacyInfo.xcprivacy lists 2 domains and 4 data types." },
    ],
  },
  {
    id: "api",
    label: "API",
    subject: "api.example.com",
    verdict: "Ready",
    pillars: { security: 91, access: 88, code: null, reliability: 86, legal: 74, experience: 80 },
    findings: [
      { status: "WARN", area: "API quality", title: "The server header names its exact version", evidence: "server: Jetty(9.2.9)" },
      { status: "WARN", area: "API quality", title: "CORS reflects any origin, with credentials", evidence: "Only exploitable with cookie sign-in, and none was seen." },
      { status: "PASS", area: "API quality", title: "Errors carry no stack traces", evidence: "404 body: {\"error\":\"not_found\"}" },
    ],
  },
  {
    id: "repo",
    label: "GitHub repo",
    subject: "example/billing-platform",
    verdict: "Conditional",
    pillars: { security: 80, access: 70, code: 62, reliability: 68, legal: 75, experience: 77 },
    findings: [
      { status: "FAIL", area: "Secrets & keys", title: "A live payment key is committed", evidence: "src/config.ts, line 12: a live Stripe secret key." },
      { status: "WARN", area: "Code quality", title: "buildInvoice has 74 paths through it", evidence: "billing/invoice.ts:142, 412 lines. About 20 hours to split." },
      { status: "PASS", area: "Build & supply chain", title: "Every CI action is pinned to a commit", evidence: "12 of 12 workflow steps use a full commit SHA." },
    ],
    codeHealth: {
      score: 71,
      effortDays: 69,
      busFactor: 2,
      hotspots: ["billing/invoice.ts", "web/pages/Checkout.tsx", "sync/SyncEngine.ts"],
    },
  },
];

/** One example finding per section of the explorer, so each shows what it actually reports. */
export const SECTION_EXAMPLES: Record<string, ExampleFinding> = {
  security: { status: "FAIL", area: "Security", title: "Row-level security is off on the profiles table", evidence: "" },
  code: { status: "WARN", area: "Code quality", title: "buildInvoice has 74 paths through it, at billing/invoice.ts:142", evidence: "" },
  infra: { status: "WARN", area: "Performance", title: "The largest content takes 4.1 seconds to appear on a phone", evidence: "" },
  ai: { status: "FAIL", area: "AI safety", title: "The system prompt comes back in an API response", evidence: "" },
  legal: { status: "WARN", area: "Legal & compliance", title: "Analytics loads before any cookie choice", evidence: "" },
  product: { status: "WARN", area: "Missing pages", title: "No pricing page, and the sitemap leaves out 12 public pages", evidence: "" },
  apps: { status: "FAIL", area: "App Store & mobile", title: "No privacy manifest, so the App Store will reject the upload", evidence: "" },
  standards: { status: "PASS", area: "Standards", title: "A release needs a reviewed pull request before it deploys", evidence: "" },
};

/** The overall score, weighted exactly as the scan weights its pillars; unmeasured pillars drop out. */
export function exampleScore(pillars: Record<PillarKey, number | null>, weights: Record<PillarKey, number>): number {
  let sum = 0;
  let total = 0;
  for (const k of Object.keys(weights) as PillarKey[]) {
    const v = pillars[k];
    if (v === null || v === undefined) continue;
    sum += v * weights[k];
    total += weights[k];
  }
  return total ? Math.round(sum / total) : 0;
}

/** Calendar weeks to clear a debt of `days` with `devs` people, at five working days a week. */
export function weeksToClear(days: number, devs: number): number {
  return Math.max(1, Math.ceil(days / Math.max(1, devs) / 5));
}
