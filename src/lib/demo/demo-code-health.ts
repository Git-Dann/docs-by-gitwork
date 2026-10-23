import type { CodeHealthReport, DebtItem } from "@/types/code-health";

/**
 * Mock code-health report for the demo Cadenza repo scan. Fictional repo and paths;
 * the shape and the proportions follow real measured repositories, so the panel is
 * exercised with a realistic mix of severities and kinds.
 */
const d = (o: Omit<DebtItem, "reason"> & { reason?: string }): DebtItem => ({ reason: "", ...o });

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
  coverage: { analysedFiles: 262, skippedLarge: 0, skippedMinified: 1, skippedGenerated: 3, unsupportedSourceFiles: 0, unsupportedLanguages: [], filesWithParseErrors: 2, truncated: false },
};
