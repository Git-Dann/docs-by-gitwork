import { githubRequest, parseGithubRepo } from "@/lib/github";
import type { PulseScanCheckInput } from "@/types/pulse";
import { analyseCheckout } from "./analyse";
import { codeHealthChecks, codeHealthUnavailable } from "./checks";
import { CloneError, withCheckout } from "./clone";
import type { CodeHealthReport } from "@/types/code-health";

export type { CodeHealthReport } from "@/types/code-health";
export { SUPERSEDED_BY_CODE_HEALTH } from "./checks";

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
export async function runCodeHealth(repoInput: string): Promise<CodeHealthResult> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) return unavailable("the repository is not a GitHub owner/repo.");
  const slug = `${parsed.owner}/${parsed.repo}`;
  try {
    // One metadata call: the size (to refuse a huge repo before downloading it) and the
    // default branch, which is what gets measured.
    const meta = await githubRequest<{ size?: number; default_branch?: string }>(`/repos/${slug}`).catch(() => null);
    const branch = meta?.default_branch ?? null;
    const report = await withCheckout(slug, { sizeKb: meta?.size ?? null }, (c) =>
      analyseCheckout({ repo: slug, branch, commit: c.commit, dir: c.dir, files: c.files }),
    );
    return { report, checks: codeHealthChecks(report), unavailable: null };
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
