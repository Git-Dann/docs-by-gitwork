import type {
  CodeRunnerProvider,
  CodeRunnerResult,
  CodeRunnerSubmission,
  CodeRunnerTestResult,
} from "./types";

/**
 * Deterministic mock runner for tests + local dev. Runs NO candidate code — it
 * fabricates a stable result from the submission so the pipeline is exercisable
 * without any sandbox. Determinism (no Math.random) keeps unit tests stable.
 */
export interface MockCodeRunnerOptions {
  /** How many hidden tests to simulate. */
  testsTotal?: number;
  /** Force a specific number of passing tests; defaults to a content heuristic. */
  testsPassed?: number;
  status?: CodeRunnerResult["status"];
  languages?: string[];
}

export class MockCodeRunnerProvider implements CodeRunnerProvider {
  readonly name = "mock";
  private readonly opts: Required<Omit<MockCodeRunnerOptions, "testsPassed">> & {
    testsPassed?: number;
  };

  constructor(opts: MockCodeRunnerOptions = {}) {
    this.opts = {
      testsTotal: opts.testsTotal ?? 5,
      status: opts.status ?? "completed",
      languages: opts.languages ?? ["javascript", "typescript"],
      testsPassed: opts.testsPassed,
    };
  }

  supportsLanguage(language: string): boolean {
    return this.opts.languages.includes(language.toLowerCase());
  }

  async run(submission: CodeRunnerSubmission): Promise<CodeRunnerResult> {
    const total = this.opts.testsTotal;
    // Heuristic when not forced: non-empty submissions "pass" more tests.
    const contentLen = submission.files.reduce((n, f) => n + f.content.trim().length, 0);
    const heuristicPass = contentLen === 0 ? 0 : Math.min(total, Math.max(1, Math.round(total * 0.8)));
    const passed = this.opts.status === "completed" ? this.opts.testsPassed ?? heuristicPass : 0;

    const results: CodeRunnerTestResult[] = Array.from({ length: total }, (_, i) => ({
      name: `test_${i + 1}`,
      passed: i < passed,
      durationMs: 1,
      message: i < passed ? undefined : "assertion failed (mock)",
    }));

    return {
      provider: this.name,
      executionId: `mock-${submission.language}-${total}-${passed}`,
      status: this.opts.status,
      testsPassed: passed,
      testsTotal: total,
      results,
      stdout: "",
      stderr: "",
    };
  }
}
