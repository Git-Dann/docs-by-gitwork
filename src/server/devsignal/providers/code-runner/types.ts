/**
 * CodeRunnerProvider — the abstraction over "run this candidate's code and tell
 * me which hidden tests passed". CRITICAL SECURITY BOUNDARY: untrusted candidate
 * code must NEVER execute in the Foundry app process, Docker app/DB container,
 * GitHub Action runner, or the VPS shell (see CLAUDE.md §23).
 *
 * Approved execution patterns (Dan, 2026-07-06): browser-based JS/TS (runs in
 * the candidate's own browser) + a mock for tests/local. A managed external
 * runner (e.g. Judge0/E2B) may be added later behind this same interface, but
 * only with explicit approval — do not wire one in without it.
 */

export interface CodeRunnerFile {
  path: string;
  content: string;
}

export interface CodeRunnerSubmission {
  language: string;
  files: CodeRunnerFile[];
  entrypoint?: string;
  /** Reference to the challenge whose hidden tests to run (tests stay server-side). */
  challengeRef?: string;
}

export interface CodeRunnerTestResult {
  name: string;
  passed: boolean;
  durationMs?: number;
  message?: string;
}

export type CodeRunnerStatus = "completed" | "error" | "timeout";

export interface CodeRunnerResult {
  provider: string;
  /** Provider-side execution id for audit (e.g. browser session id). */
  executionId: string;
  status: CodeRunnerStatus;
  testsPassed: number;
  testsTotal: number;
  results: CodeRunnerTestResult[];
  stdout?: string;
  /** Redacted of anything secret-shaped before it reaches here. */
  stderr?: string;
  errorLog?: string;
}

export interface CodeRunnerProvider {
  name: string;
  supportsLanguage(language: string): boolean;
  run(submission: CodeRunnerSubmission): Promise<CodeRunnerResult>;
}

/** 0–100 pass rate from a runner result (used by the coding_challenge stage). */
export function passRate(result: Pick<CodeRunnerResult, "testsPassed" | "testsTotal">): number {
  if (result.testsTotal <= 0) return 0;
  return Math.round((result.testsPassed / result.testsTotal) * 100);
}
