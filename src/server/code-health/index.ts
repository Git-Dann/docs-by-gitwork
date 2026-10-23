import { githubRequest, parseGithubRepo } from "@/lib/github";
import type { PulseScanCheckInput } from "@/types/pulse";
import { analyseCheckout, buildReport } from "./analyse";
import { analyseHistory, HISTORY_MONTHS, logArgs, parseLog } from "./history";
import { codeHealthChecks, codeHealthUnavailable, dependencyChecks, structureChecks } from "./checks";
import { CloneError, withCheckout } from "./clone";
import { auditDependencies } from "./dependencies";
import type { CodeHealthReport } from "@/types/code-health";

export type { CodeHealthReport } from "@/types/code-health";
export { SUPERSEDED_BY_CODE_HEALTH, answeredByCodeHealth } from "./checks";

export interface CodeHealthResult {
  report: CodeHealthReport | null;
  checks: PulseScanCheckInput[];
  /** Why the full measure did not run, when it did not. */
  unavailable: string | null;
}

/**
 * Clone the repository, measure every supported source file, and return the report
 * plus its checks. Never throws: a measure that could not run returns one INCONCLUSIVE
 * check saying why, so "we could not look" is never read as "nothing is wrong" (§35).
 */
export async function runCodeHealth(repoInput: string, opts: { history?: boolean } = {}): Promise<CodeHealthResult> {
  const withHistory = opts.history ?? true;
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) return unavailable("the repository is not a GitHub owner/repo.");
  const slug = `${parsed.owner}/${parsed.repo}`;
  try {
    // One metadata call: the size (to refuse a huge repo before downloading it) and the
    // default branch, which is what gets measured.
    const meta = await githubRequest<{ size?: number; default_branch?: string }>(`/repos/${slug}`).catch(() => null);
    const branch = meta?.default_branch ?? null;
    const since = new Date(Date.now() - HISTORY_MONTHS * 30.44 * 86_400_000).toISOString().slice(0, 10);
    const report = await withCheckout(slug, { sizeKb: meta?.size ?? null, historySince: withHistory ? since : null }, async (c) => {
      const { report: measuredReport, measured } = await analyseCheckout({ repo: slug, branch, commit: c.commit, dir: c.dir, files: c.files });
      // The lockfile audit and the history are independent reads of the same checkout: they
      // run side by side, and neither failing can take the measure (or the other) with it.
      const [dependencies, history] = await Promise.all([
        auditDependencies({ dir: c.dir, files: c.files }),
        withHistory
          ? c
              .git(logArgs(since))
              .then((out) => analyseHistory(parseLog(out), measured))
              .catch((e) => {
                console.warn(`[code-health] ${slug}: history unavailable: ${(e as Error).message.slice(0, 200)}`);
                return null;
              })
          : Promise.resolve(null),
      ]);
      const report = history
        ? { ...buildReport(measuredReport, measured, measuredReport.coverage, () => Date.parse(measuredReport.measuredAt), history), structure: measuredReport.structure }
        : measuredReport;
      return { ...report, dependencies };
    });
    return { report, checks: [...codeHealthChecks(report), ...structureChecks(report), ...dependencyChecks(report)], unavailable: null };
  } catch (error) {
    if (error instanceof CloneError) {
      const why =
        error.code === "too_large" ? error.message + "." :
        error.code === "not_found" ? "the repository could not be downloaded (it may be private and not shared with Gitwork's GitHub access)." :
        error.code === "timeout" ? "the repository took too long to download." :
        error.code === "git_missing" ? "the scanner is missing a component it needs. This is on our side." :
        "the repository could not be downloaded.";
      console.warn(`[code-health] ${slug}: ${error.code} ${error.message}`);
      return unavailable(why);
    }
    console.error(`[code-health] ${slug}:`, error);
    return unavailable("the measure failed part-way. This is on our side.");
  }
}

function unavailable(reason: string): CodeHealthResult {
  return { report: null, checks: [codeHealthUnavailable(reason)], unavailable: reason };
}
