/**
 * pulse-matrix-assert — the acceptance test for "only show checks that apply".
 *
 * Reads a pulse-platform-matrix.ts output and checks every run against EXPECTATIONS
 * written in plain terms about the real targets. It deliberately does NOT use the
 * relevance gate's own data (check-relevance-data.ts): a test that asked the gate whether
 * the gate agrees with itself would prove nothing. These are statements a person can
 * check by looking at the target — "an API is not graded on SEO", "an iOS repo has no
 * Android checks".
 *
 *   npx tsx scripts/pulse-matrix-assert.ts <matrix.json>
 *
 * Exit 1 on any violation. Prints each one with the run it came from.
 */
import { readFileSync } from "node:fs";

interface Check { key: string; category: string; status: string }
interface Run { target: string; platform: string; executionPlatform: string | null; error: string | null; checks: Check[] }

const SCAN_NOTES = new Set(["scan_collector_completeness", "platform_family_coverage", "repo_intelligence", "repo_accessible", "target_content_accessible", "spa_content_rendered_for_scan"]);
const NON_WEB = ["IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP", "CHROME_EXTENSION", "CLI_TOOL"];

/** Key prefixes of the source-code families, by the product they belong to. */
const FAMILY_PREFIXES: Record<string, string[]> = {
  ios: ["ios_"],
  android: ["android_"],
  flutter: ["flutter_"],
  rn: ["rn_"],
  desktop: ["electron_", "tauri_", "desk_", "desktop_"],
  extension: ["ext_"],
  cli: ["cli_"],
};
const ALL_FAMILY = Object.values(FAMILY_PREFIXES).flat();
/**
 * Website checks that happen to carry a family prefix: they probe the SITE for the files
 * that link it to its own app (/.well-known/assetlinks.json and similar).
 */
const WEBSITE_APP_LINK_KEYS = new Set(["android_asset_links", "android_instant_app"]);
const hasPrefix = (key: string, prefixes: string[]) => !WEBSITE_APP_LINK_KEYS.has(key) && prefixes.some((p) => key.startsWith(p));
/**
 * Repository checks that sit in a web-sounding category: an agent-instructions file in
 * the repo (AEO), the repo's own GitHub metadata (Trust & Brand), and the source-depth
 * families (`*_x_*`, `*_depth_*`) that read server code — e.g. how email is SENT.
 */
const isRepoCheckInWebCategory = (key: string) => key === "aeo_agent_instructions" || key.startsWith("github_") || /_(x|depth)_/.test(key);

/** Categories that only describe a website's pages. */
const PAGE_CATEGORIES = ["SEO", "Social & Marketing", "Missing Pages", "Trust & Brand", "AEO & AI Discoverability"];
/**
 * Categories that only exist for a product WITH the feature. "SaaS Readiness" is not
 * here: it also holds plain marketing checks (support channel, social proof) that a
 * SaaS selection legitimately asks; its account-dependent checks are feature-gated.
 */
const FEATURE_CATEGORIES = ["Payments", "Roles & Permissions", "Authentication", "AI Safety"];

type Rule = { why: string; test: (run: Run, shown: Check[]) => string[] };

const shownOf = (run: Run) => run.checks.filter((c) => !["SKIPPED", "NOT_APPLICABLE"].includes(c.status) || SCAN_NOTES.has(c.key));
const offenders = (checks: Check[], pred: (c: Check) => boolean, max = 6) => {
  const bad = checks.filter(pred);
  return bad.length ? [`${bad.length}: ${bad.slice(0, max).map((c) => `${c.key}[${c.status}]`).join(", ")}${bad.length > max ? ", …" : ""}`] : [];
};

const UNIVERSAL: Rule[] = [
  { why: "a 'not applicable' row is never shown (except the scan's own notes)", test: (run) => offenders(run.checks, (c) => ["SKIPPED", "NOT_APPLICABLE"].includes(c.status) && !SCAN_NOTES.has(c.key)) },
  { why: "a catalogue control is shown only with an evidence-backed verdict", test: (_r, s) => offenders(s, (c) => c.key.startsWith("standards_") && c.status !== "PASS" && c.status !== "FAIL") },
];

const BY_TARGET: Record<string, Rule[]> = {
  "web-bare": [
    { why: "a one-page static site gets no feature checks (no payments, accounts, SaaS, AI)", test: (_r, s) => offenders(s, (c) => FEATURE_CATEGORIES.includes(c.category)) },
  ],
  api: [
    { why: "a JSON API is not graded on web-page content", test: (_r, s) => offenders(s, (c) => PAGE_CATEGORIES.includes(c.category) || c.category === "Accessibility") },
  ],
  "app-store": [{ why: "an App Store link reports only its listing", test: (r, s) => [...offenders(s, (c) => c.category !== "Store Listing" && !SCAN_NOTES.has(c.key)), ...(r.executionPlatform === "IOS_APP" ? [] : [`ran as ${r.executionPlatform}, not IOS_APP`])] }],
  "play-store": [{ why: "a Google Play link reports only its listing", test: (r, s) => [...offenders(s, (c) => c.category !== "Store Listing" && !SCAN_NOTES.has(c.key)), ...(r.executionPlatform === "ANDROID_APP" ? [] : [`ran as ${r.executionPlatform}, not ANDROID_APP`])] }],
  "chrome-store": [{ why: "a Chrome Web Store link reports its listing and published manifest only", test: (r, s) => [...offenders(s, (c) => c.category !== "Store Listing" && !c.key.startsWith("ext_") && !SCAN_NOTES.has(c.key)), ...(r.executionPlatform === "CHROME_EXTENSION" ? [] : [`ran as ${r.executionPlatform}, not CHROME_EXTENSION`]), ...(s.some((c) => c.key === "store_page_live" && c.status === "PASS") ? [] : ["store_page_live is not PASS on a live listing"])] }],
  "chrome-store-gone": [{ why: "a removed Chrome Web Store item is reported as gone, not live", test: (_r, s) => (s.find((c) => c.key === "store_page_live")?.status === "FAIL" ? [] : [`store_page_live is ${s.find((c) => c.key === "store_page_live")?.status ?? "missing"}`]) }],
};

for (const id of ["web-saas", "web-marketing", "web-bare"]) {
  (BY_TARGET[id] ??= []).push(
    { why: "a website scan shows no source-code family checks", test: (_r, s) => offenders(s, (c) => hasPrefix(c.key, ALL_FAMILY)) },
    {
      why: "a website of a non-web product is assessed as its public presence (not one check) and gets no web-app feature checks",
      test: (r, s) => !NON_WEB.includes(r.platform) ? [] : [
        ...(s.length >= 40 ? [] : [`only ${s.length} checks shown`]),
        ...offenders(s, (c) => FEATURE_CATEGORIES.includes(c.category) || c.category === "API Quality"),
      ],
    },
    { why: "a marketing site gets no SaaS / account / role checks", test: (r, s) => r.platform !== "MARKETING_SITE" ? [] : offenders(s, (c) => ["SaaS Readiness", "Roles & Permissions", "Authentication"].includes(c.category)) },
  );
}

const REPO_FAMILY: Record<string, { family: keyof typeof FAMILY_PREFIXES | null; exec: (p: string) => boolean }> = {
  "repo-ios": { family: "ios", exec: (p) => p === "IOS_APP" },
  "repo-android": { family: "android", exec: (p) => p === "ANDROID_APP" },
  "repo-flutter": { family: "flutter", exec: (p) => p === "CROSS_PLATFORM_MOBILE" },
  "repo-rn": { family: "rn", exec: (p) => p === "CROSS_PLATFORM_MOBILE" },
  "repo-electron": { family: "desktop", exec: (p) => p === "DESKTOP_APP" },
  "repo-extension": { family: "extension", exec: (p) => p === "CHROME_EXTENSION" },
  "repo-cli": { family: "cli", exec: (p) => p === "CLI_TOOL" },
  "repo-web": { family: null, exec: (p) => ["WEB_APP", "SAAS", "MARKETING_SITE", "OTHER"].includes(p) },
  "repo-api": { family: null, exec: (p) => ["API_BACKEND", "WEB_APP", "SAAS", "OTHER"].includes(p) },
};
for (const [id, spec] of Object.entries(REPO_FAMILY)) {
  const own = spec.family ? FAMILY_PREFIXES[spec.family] : [];
  const others = ALL_FAMILY.filter((p) => !own.includes(p));
  (BY_TARGET[id] ??= []).push(
    { why: "a repo runs as what it IS, whatever the dropdown said", test: (r) => (r.executionPlatform && spec.exec(r.executionPlatform) ? [] : [`ran as ${r.executionPlatform}`]) },
    { why: "a repo shows no other product family's source checks", test: (_r, s) => offenders(s, (c) => hasPrefix(c.key, others)) },
    { why: "a repo is not graded on website pages, DNS or store listings", test: (_r, s) => offenders(s, (c) => [...PAGE_CATEGORIES, "Email Deliverability", "Store Listing"].includes(c.category) && !hasPrefix(c.key, own) && !isRepoCheckInWebCategory(c.key)) },
  );
  if (spec.family) {
    (BY_TARGET[id] ??= []).push({ why: "a repo shows its own family's checks", test: (_r, s) => (s.some((c) => hasPrefix(c.key, own)) ? [] : [`no ${own.join("/")} checks shown`]) });
  }
}
(BY_TARGET["repo-api"] ??= []).push({ why: "a backend with no UI gets no accessibility checks", test: (_r, s) => offenders(s, (c) => c.key.startsWith("pulse_accessibility") || c.category === "Accessibility") });
(BY_TARGET["repo-extension"] ??= []).push({ why: "an extension repo keeps its own store-readiness checks (ext_manifest_v3)", test: (_r, s) => (s.some((c) => c.key === "ext_manifest_v3") ? [] : ["ext_manifest_v3 not shown"]) });

const file = process.argv[2];
if (!file) { console.error("usage: pulse-matrix-assert.ts <matrix.json>"); process.exit(2); }
const { runs } = JSON.parse(readFileSync(file, "utf8")) as { runs: Run[] };

let violations = 0;
let checked = 0;
for (const run of runs) {
  if (run.error) { console.log(`✗ ${run.target} ${run.platform}: scan errored — ${run.error}`); violations++; continue; }
  const shown = shownOf(run);
  for (const rule of [...UNIVERSAL, ...(BY_TARGET[run.target] ?? [])]) {
    checked++;
    const problems = rule.test(run, shown);
    for (const problem of problems) {
      violations++;
      console.log(`✗ ${run.target.padEnd(17)} ${run.platform.padEnd(22)} ${rule.why}\n    ${problem}`);
    }
  }
}
console.log(`\n${runs.length} runs, ${checked} expectations checked, ${violations} violation(s).`);
process.exit(violations > 0 ? 1 : 0);
