import { EFFORT_HOURS } from "@/server/code-health/rules";
import type { CodeHealthReport, DebtItem } from "@/types/code-health";
import { RECORDED_CADENZA_CODE_HEALTH } from "@/lib/demo/demo-pulse-recorded-cadenza";

/**
 * Mock code-health report: fictional repo and paths, with the shape and proportions of real
 * measured repositories. It is the base the portfolio's other demo repos are derived from, and
 * a fixture for tests. The /demo/pulse Cadenza scan itself carries a real (renamed) measure.
 */
const d = (o: Omit<DebtItem, "reason"> & { reason?: string }): DebtItem => ({ reason: "", effortHours: EFFORT_HOURS[o.kind][o.severity], ...o });

export const DEMO_CODE_HEALTH: CodeHealthReport = {
  repo: "cadenza-app/cadenza",
  branch: "main",
  commit: "4f9c2e17a3b8d0c6e5f1a2b3c4d5e6f7a8b9c0d1",
  measuredAt: "2026-10-20T09:00:00.000Z",
  score: 71,
  band: "fair",
  totals: { files: 214, loc: 38_420, testLoc: 9_870, functions: 1_962, classes: 41, complexityPerKloc: 142.6, complexLocShare: 0.118, averageComplexity: 2.8 },
  languages: [
    { language: "tsx", files: 121, loc: 21_300 },
    { language: "typescript", files: 88, loc: 16_640 },
    { language: "javascript", files: 5, loc: 480 },
  ],
  debt: [
    d({ kind: "complex_function", severity: "very_high", path: "server/billing/invoice.ts", line: 142, symbol: "buildInvoice", metrics: { complexity: 74, loc: 412, params: 3, nesting: 6 } }),
    d({ kind: "complex_function", severity: "very_high", path: "web/src/pages/Checkout.tsx", line: 38, symbol: "Checkout", metrics: { complexity: 58, loc: 520, params: 1, nesting: 4 } }),
    d({ kind: "large_class", severity: "very_high", path: "server/sync/SyncEngine.ts", line: 21, symbol: "SyncEngine", metrics: { methods: 46, complexity: 131, loc: 1084 } }),
    d({ kind: "complex_function", severity: "high", path: "server/auth/session.ts", line: 88, symbol: "refreshSession", metrics: { complexity: 33, loc: 140, params: 2, nesting: 5 } }),
    d({ kind: "large_class", severity: "high", path: "server/api/LessonController.ts", line: 12, symbol: "LessonController", metrics: { methods: 28, complexity: 62, loc: 604 } }),
    d({ kind: "complex_function", severity: "high", path: "web/src/components/Scheduler/useSlots.ts", line: 17, symbol: "useSlots", metrics: { complexity: 27, loc: 96, params: 2, nesting: 4 } }),
    d({ kind: "long_function", severity: "high", path: "server/reports/monthly.ts", line: 9, symbol: "renderMonthly", metrics: { complexity: 9, loc: 188, params: 4, nesting: 2 } }),
    d({ kind: "large_file", severity: "high", path: "web/src/pages/Settings.tsx", line: 1, symbol: "Settings.tsx", metrics: { loc: 1_612, functions: 38 } }),
    d({ kind: "long_parameter_list", severity: "high", path: "server/notify/send.ts", line: 31, symbol: "sendNotification", metrics: { complexity: 6, loc: 44, params: 9, nesting: 2 } }),
    d({ kind: "complex_function", severity: "moderate", path: "server/api/students.ts", line: 203, symbol: "importStudents", metrics: { complexity: 17, loc: 71, params: 2, nesting: 3 } }),
    d({ kind: "deep_nesting", severity: "moderate", path: "web/src/lib/calendar.ts", line: 54, symbol: "expandRecurring", metrics: { complexity: 9, loc: 48, params: 3, nesting: 4 } }),
    d({ kind: "long_function", severity: "moderate", path: "web/src/pages/Dashboard.tsx", line: 22, symbol: "Dashboard", metrics: { complexity: 8, loc: 97, params: 1, nesting: 2 } }),
    d({ kind: "complex_function", severity: "moderate", path: "server/billing/proration.ts", line: 11, symbol: "prorate", metrics: { complexity: 14, loc: 52, params: 4, nesting: 3 } }),
  ],
  debtCounts: { complex_function: 23, long_function: 14, long_parameter_list: 4, deep_nesting: 6, large_class: 2, large_file: 3 },
  effort: { hours: 412, days: 68.7, dayRateGbp: 450, gbpLow: 21_600, gbpHigh: 46_400 },
  history: {
    months: 12,
    commits: 1_184,
    massEditsIgnored: 6,
    botCommitsIgnored: 212,
    contributors: 7,
    firstCommitAt: "2025-10-21T08:00:00.000Z",
    lastCommitAt: "2026-10-19T17:40:00.000Z",
    busFactor: 2,
    owners: [
      { name: "Priya N.", share: 0.41 },
      { name: "Tom H.", share: 0.27 },
      { name: "Ade O.", share: 0.14 },
      { name: "Lena S.", share: 0.11 },
      { name: "Marc D.", share: 0.07 },
    ],
    hotspots: [
      { path: "server/billing/invoice.ts", changes: 64, complexity: 188, loc: 1_140, authors: 4, mainAuthorShare: 0.72, score: 1 },
      { path: "web/src/pages/Checkout.tsx", changes: 51, complexity: 141, loc: 920, authors: 3, mainAuthorShare: 0.55, score: 0.6 },
      { path: "server/sync/SyncEngine.ts", changes: 22, complexity: 131, loc: 1_084, authors: 1, mainAuthorShare: 1, score: 0.24 },
      { path: "server/auth/session.ts", changes: 38, complexity: 64, loc: 310, authors: 5, mainAuthorShare: 0.39, score: 0.2 },
      { path: "web/src/pages/Settings.tsx", changes: 29, complexity: 77, loc: 1_612, authors: 4, mainAuthorShare: 0.48, score: 0.19 },
    ],
    coupling: [
      { a: "server/billing/invoice.ts", b: "web/src/pages/Checkout.tsx", shared: 19, degree: 0.83 },
      { a: "server/auth/session.ts", b: "web/src/lib/api.ts", shared: 11, degree: 0.79 },
    ],
  },
  trend: {
    previousScanId: "scan-cadenza-prev",
    previousCommit: "9a1b7c3d",
    previousMeasuredAt: "2026-09-22T09:00:00.000Z",
    previousScore: 68,
    scoreDelta: 3,
    complexLocShareDelta: -0.014,
    newDebt: 2,
    resolvedDebt: 5,
    newItems: [{ kind: "complex_function", severity: "high", path: "web/src/components/Scheduler/useSlots.ts", line: 17, symbol: "useSlots" }],
    resolvedItems: [{ kind: "complex_function", severity: "very_high", path: "server/api/students.ts", symbol: "syncRoster" }],
  },
  coverage: { analysedFiles: 262, skippedLarge: 0, skippedMinified: 1, skippedGenerated: 3, unsupportedSourceFiles: 0, unsupportedLanguages: [], filesWithParseErrors: 2, truncated: false },
  structure: {
    modules: 214,
    edges: 688,
    unresolvedShare: 0.02,
    languages: ["typescript", "tsx"],
    cycleCount: 2,
    filesInCycles: 7,
    maxDepth: 11,
    cycles: [
      {
        files: ["server/billing/invoice.ts", "server/billing/proration.ts", "server/billing/tax.ts", "server/notify/send.ts", "server/sync/SyncEngine.ts"],
        path: ["server/billing/invoice.ts", "server/notify/send.ts", "server/sync/SyncEngine.ts", "server/billing/invoice.ts"],
      },
      { files: ["web/src/lib/api.ts", "web/src/lib/auth.ts"], path: ["web/src/lib/api.ts", "web/src/lib/auth.ts", "web/src/lib/api.ts"] },
    ],
    hubs: [
      { path: "server/billing/invoice.ts", fanIn: 31, fanOut: 9, instability: 0.225, complexity: 188 },
      { path: "web/src/lib/api.ts", fanIn: 58, fanOut: 3, instability: 0.049, complexity: 44 },
    ],
  },
  dependencies: {
    status: "checked",
    reason: null,
    lockfiles: [{ path: "package-lock.json", ecosystem: "npm", packages: 1_042 }],
    packages: 1_042,
    counts: { critical: 1, high: 1, moderate: 1, low: 0, unknown: 0 },
    checkedAt: "2026-10-20T09:00:00.000Z",
    vulnerable: [
      {
        ecosystem: "npm", name: "jsonwebtoken", version: "8.5.1", lockfile: "package-lock.json", direct: true, severity: "critical",
        advisories: [
          { id: "GHSA-hjrf-2m68-5959", aliases: ["CVE-2022-23539"], summary: "Insecure key types can be used to verify signatures", severity: "high", fixedIn: "9.0.0", url: "https://osv.dev/vulnerability/GHSA-hjrf-2m68-5959" },
          { id: "GHSA-27h2-hvpr-p74q", aliases: ["CVE-2022-23540"], summary: "Unrestricted key type could lead to legacy keys usage", severity: "critical", fixedIn: "9.0.0", url: "https://osv.dev/vulnerability/GHSA-27h2-hvpr-p74q" },
        ],
      },
      {
        ecosystem: "npm", name: "axios", version: "0.21.1", lockfile: "package-lock.json", direct: true, severity: "high",
        advisories: [{ id: "GHSA-cph5-m8f7-6c5x", aliases: ["CVE-2021-3749"], summary: "Inefficient regular expression complexity", severity: "high", fixedIn: "0.21.2", url: "https://osv.dev/vulnerability/GHSA-cph5-m8f7-6c5x" }],
      },
      {
        ecosystem: "npm", name: "semver", version: "5.7.1", lockfile: "package-lock.json", direct: false, severity: "moderate",
        advisories: [{ id: "GHSA-c2qf-rxjj-qqgw", aliases: ["CVE-2022-25883"], summary: "Regular expression denial of service", severity: "moderate", fixedIn: "5.7.2", url: "https://osv.dev/vulnerability/GHSA-c2qf-rxjj-qqgw" }],
      },
    ],
  },
};

/**
 * Two more fictional repositories for the demo code portfolio, derived from Cadenza's report
 * so the shape stays realistic: one healthier and checked clean, one older, owned by one
 * person, and never audited for libraries (no lockfile).
 */
export const DEMO_PORTFOLIO_REPORTS: { report: CodeHealthReport; scanId: string; projectName: string; clientName: string; history: number[] }[] = [
  // Cadenza is the repo scan in /demo/pulse, so it uses that scan's real (renamed) code measure.
  { report: RECORDED_CADENZA_CODE_HEALTH, scanId: "scan-cadenza", projectName: "cadenza (github)", clientName: "Cadenza", history: [RECORDED_CADENZA_CODE_HEALTH.score - 6, RECORDED_CADENZA_CODE_HEALTH.score - 3, RECORDED_CADENZA_CODE_HEALTH.score - 1, RECORDED_CADENZA_CODE_HEALTH.score] },
  {
    scanId: "scan-northwind",
    projectName: "northwind (github)",
    clientName: "Northwind Studio",
    history: [84, 86, 88],
    report: {
      ...DEMO_CODE_HEALTH,
      repo: "northwind-studio/platform",
      commit: "b81c4e0d9a2f3e5b7c1d4a6e8f0b2c4d6e8a0b1c",
      score: 88,
      band: "good",
      totals: { ...DEMO_CODE_HEALTH.totals, loc: 22_150, files: 160, complexLocShare: 0.04 },
      languages: [{ language: "typescript", files: 160, loc: 22_150 }],
      debt: DEMO_CODE_HEALTH.debt.filter((x) => x.severity === "moderate").map((x) => ({ ...x, path: x.path.replace(/^web\/src|^server/, "apps/api/src") })),
      effort: { hours: 54, days: 9 },
      history: { ...DEMO_CODE_HEALTH.history!, busFactor: 3, hotspots: [] },
      structure: { ...DEMO_CODE_HEALTH.structure!, modules: 160, edges: 402, cycleCount: 0, filesInCycles: 0, cycles: [], hubs: [] },
      dependencies: { ...DEMO_CODE_HEALTH.dependencies!, packages: 812, vulnerable: [], counts: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 } },
      trend: null,
    },
  },
  {
    scanId: "scan-fairway-api",
    projectName: "fairway booking api",
    clientName: "Fairway Nine",
    history: [58, 54, 49],
    report: {
      ...DEMO_CODE_HEALTH,
      repo: "fairway-nine/booking-api",
      commit: "c0ffee1234567890abcdef1234567890abcdef12",
      score: 49,
      band: "poor",
      totals: { ...DEMO_CODE_HEALTH.totals, loc: 18_900, files: 96, complexLocShare: 0.26 },
      languages: [{ language: "php", files: 96, loc: 18_900 }],
      debt: DEMO_CODE_HEALTH.debt.slice(0, 6).map((x, i) => ({ ...x, path: `app/Http/Controllers/${["Booking", "Payment", "Member", "Course", "Report", "Admin"][i]}Controller.php`, symbol: `${["Booking", "Payment", "Member", "Course", "Report", "Admin"][i]}Controller::handle` })),
      effort: { hours: 520, days: 86.7 },
      history: { ...DEMO_CODE_HEALTH.history!, busFactor: 1, owners: [{ name: "Sam K.", share: 0.91 }], hotspots: [{ path: "app/Http/Controllers/BookingController.php", changes: 71, complexity: 210, loc: 1_480, authors: 1, mainAuthorShare: 1, score: 1 }] },
      structure: { ...DEMO_CODE_HEALTH.structure!, languages: ["php"], cycleCount: 1, filesInCycles: 3, cycles: [{ files: ["app/Models/Booking.php", "app/Models/Member.php", "app/Services/Pricing.php"], path: ["app/Models/Booking.php", "app/Services/Pricing.php", "app/Models/Member.php", "app/Models/Booking.php"] }], hubs: [] },
      dependencies: { status: "no_lockfile", reason: "composer.json has no lockfile, so versions are not pinned and cannot be checked against known vulnerabilities.", lockfiles: [], packages: 0, vulnerable: [], counts: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 }, checkedAt: "2026-10-20T09:00:00.000Z" },
      trend: null,
    },
  },
];
