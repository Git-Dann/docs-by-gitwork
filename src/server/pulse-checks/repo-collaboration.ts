// ─────────────────────────────────────────────────────────────────────────────
// REPOSITORY COLLABORATION FILES — read from the repository, not guessed.
//
// These keys used to be answered by grepping a WEBSITE's HTML for words like
// "codeowners" or "semantic-release", which says nothing about the repository and
// was withheld in the October 2026 audit. The repository snapshot already holds
// the full path list and the contents of every `.github/workflows` file, so each
// can be answered from the files themselves with no extra GitHub call (§62.5).
//
// Two kinds of answer, kept apart:
//   - FILE checks (CODEOWNERS, templates): the path list is the whole answer, so
//     absence is a finding — unless GitHub truncated the tree.
//   - TOOL checks (code scanning, secret scanning): a workflow that runs the tool
//     proves it, but GitHub's own built-in setups are repository SETTINGS that
//     leave no file, so absence is INCONCLUSIVE, never a WARN.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import { stripYamlComments, workflowFiles } from "./ci-workflows";
import type { RepoSnapshot } from "./native-mobile";

export const REPO_COLLABORATION_KEYS = [
  "github_codeowners",
  "github_pr_template",
  "github_issue_templates",
  "release_automation",
  "github_code_scanning",
  "github_secret_scanning",
] as const;
type Key = (typeof REPO_COLLABORATION_KEYS)[number];

const LABELS: Record<Key, string> = {
  github_codeowners: "CODEOWNERS file",
  github_pr_template: "PR description template",
  github_issue_templates: "Issue templates",
  release_automation: "Release automation (semantic-release / release-please)",
  github_code_scanning: "Code scanning (CodeQL / Snyk)",
  github_secret_scanning: "GitHub secret scanning",
};

/** GitHub reads CODEOWNERS from these three places only. */
const CODEOWNERS = /^(\.github\/|docs\/)?CODEOWNERS$/;
const PR_TEMPLATE = /^(\.github\/|docs\/)?(pull_request_template\.md|PULL_REQUEST_TEMPLATE\/[^/]+\.md)$/i;
const ISSUE_TEMPLATE = /^(\.github\/ISSUE_TEMPLATE\/[^/]+\.(md|ya?ml)|(\.github\/|docs\/)?issue_template\.md)$/i;

/** Config files a release tool reads; their presence is the tool. */
const RELEASE_CONFIG = /^(\.releaserc(\.(json|ya?ml|js|cjs|mjs))?|release\.config\.(js|cjs|mjs|ts)|release-please-config\.json|\.release-please-manifest\.json|\.changeset\/config\.json|\.goreleaser\.ya?ml|\.github\/release-drafter\.ya?ml|\.github\/release\.ya?ml)$/i;
const RELEASE_IN_WORKFLOW = /\b(semantic-release|release-please|changesets\/action|goreleaser|softprops\/action-gh-release|ncipollo\/release-action|release-drafter\/release-drafter|fastlane (deliver|supply|release)|npm (stage )?publish|pnpm publish|yarn npm publish|cargo publish|twine upload|pypa\/gh-action-pypi-publish)\b/;

const CODE_SCANNING_IN_WORKFLOW = /\b(github\/codeql-action|snyk\/actions|returntocorp\/semgrep|semgrep\/semgrep|semgrep ci|sonarsource\/sonar|SonarSource\/sonar|aquasecurity\/trivy-action|ossf\/scorecard-action|zizmorcore|bearer\/bearer-action|checkmarx|veracode)/i;
const SECRET_SCANNING_IN_WORKFLOW = /\b(gitleaks|trufflehog|trufflesecurity|detect-secrets|ggshield|gitguardian)/i;

function row(key: Key, status: PulseScanCheckInput["status"], detail: string, confidence: "HIGH" | "MEDIUM" | "LOW", evidence?: unknown): PulseScanCheckInput {
  return {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: key,
    label: LABELS[key],
    status,
    detail,
    confidence,
    ...(status === "INCONCLUSIVE" ? {} : { evidenceStrength: "VERIFIED" as const }),
    ...(evidence !== undefined ? { evidence: JSON.stringify(evidence).slice(0, 600) } : {}),
  };
}

export function evaluateRepoCollaborationChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const out: PulseScanCheckInput[] = [];
  const paths = snapshot.paths;
  const find = (re: RegExp) => paths.filter((p) => re.test(p)).slice(0, 4);
  const truncatedNote = "GitHub truncated this repository's file list, so a missing file cannot be established.";

  const fileCheck = (key: Key, re: RegExp, found: string, missing: string) => {
    const hits = find(re);
    if (hits.length > 0) out.push(row(key, "PASS", `${found} (${hits.join(", ")}).`, "HIGH", hits));
    else if (snapshot.truncated) out.push(row(key, "INCONCLUSIVE", truncatedNote, "LOW"));
    else out.push(row(key, "WARN", missing, "HIGH"));
  };

  fileCheck(
    "github_codeowners",
    CODEOWNERS,
    "A CODEOWNERS file assigns reviewers automatically",
    "No CODEOWNERS file in the root, .github/ or docs/. With one, GitHub requests a review from whoever owns the code a pull request changes, and branch rules can require their approval.",
  );
  fileCheck(
    "github_pr_template",
    PR_TEMPLATE,
    "A pull request template is in place",
    "No pull request template. One in .github/pull_request_template.md prompts each PR for what changed, how it was tested and how to roll it back.",
  );
  fileCheck(
    "github_issue_templates",
    ISSUE_TEMPLATE,
    "Issue templates are in place",
    "No issue templates. Forms in .github/ISSUE_TEMPLATE/ ask reporters for the version, steps and expected result up front.",
  );

  // Workflow contents. A workflow listed in the tree but not read (the snapshot caps
  // how many config files it fetches) leaves "no workflow runs the tool" unproven.
  const workflows = workflowFiles(snapshot).map((w) => ({ path: w.path, text: stripYamlComments(w.text) }));
  const listed = paths.filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p)).length;
  const allWorkflowsRead = workflows.length >= listed;
  const inWorkflows = (re: RegExp) => workflows.filter((w) => re.test(w.text)).map((w) => w.path).slice(0, 4);

  // Release automation: a release tool's config, or a workflow that publishes.
  const pkg = snapshot.files.get("package.json") ?? "";
  const releaseHits = [...find(RELEASE_CONFIG), ...inWorkflows(RELEASE_IN_WORKFLOW)];
  // A release tool as a dependency, or a script that runs one (sindresorhus/ky: "release": "np").
  if (
    /"(semantic-release|release-it|@changesets\/cli|standard-version|np|bumpp)"\s*:/.test(pkg) ||
    /"[\w:-]*(release|publish|version)[\w:-]*"\s*:\s*"[^"]*\b(np|release-it|semantic-release|changeset (version|publish)|standard-version|lerna (publish|version)|bumpp)\b/.test(pkg)
  ) releaseHits.push("package.json");
  if (releaseHits.length > 0) {
    out.push(row("release_automation", "PASS", `Releases are automated (${releaseHits.slice(0, 4).join(", ")}).`, "HIGH", releaseHits));
  } else if (!allWorkflowsRead || snapshot.truncated) {
    out.push(row("release_automation", "INCONCLUSIVE", "Not every workflow file could be read, so a release step may exist that was not seen.", "LOW"));
  } else {
    out.push(row(
      "release_automation",
      "WARN",
      "No release tool or publishing workflow found, so versions and release notes appear to be made by hand. semantic-release, release-please or changesets cut the version and changelog from the commit history.",
      "MEDIUM",
    ));
  }

  // Code scanning and secret scanning: a workflow proves it; nothing proves absence.
  const tool = (key: Key, re: RegExp, what: string, builtIn: string) => {
    const hits = inWorkflows(re);
    if (hits.length > 0) out.push(row(key, "PASS", `${what} runs in CI (${hits.join(", ")}).`, "HIGH", hits));
    else out.push(row(key, "INCONCLUSIVE", `No workflow runs ${what.toLowerCase()}. ${builtIn} is a repository setting that leaves no file, so whether it is on cannot be read from the repository.`, "LOW"));
  };
  tool("github_code_scanning", CODE_SCANNING_IN_WORKFLOW, "Code scanning", "GitHub's CodeQL default setup");
  tool("github_secret_scanning", SECRET_SCANNING_IN_WORKFLOW, "Secret scanning", "GitHub's built-in secret scanning and push protection");

  return out;
}
