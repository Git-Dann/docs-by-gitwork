import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

// These checks run for GitHub repo scans but we surface them as availability/signal checks
// from the page HTML for web URL scans
export async function runCodeQualityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  // These are primarily GitHub repo checks, but we can detect signals from the page HTML.
  const hasCodeScanning = /code.*scanning|codeql|snyk|sonarqube|semgrep|deepsource|code.*analysis/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_code_scanning", label: "Code scanning (CodeQL / Snyk)", status: hasCodeScanning ? "PASS" : "WARN", detail: hasCodeScanning ? "Code scanning tool signals detected." : "No code scanning signals — integrate CodeQL, Snyk, or Semgrep to catch vulnerabilities before they reach production." });

  const hasBranchProtection = /branch.*protection|protected.*branch|require.*review|required.*review/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_branch_protection", label: "Branch protection rules", status: hasBranchProtection ? "PASS" : "WARN", detail: hasBranchProtection ? "Branch protection signals detected." : "No branch protection signals — enable branch protection on main/master to require PR reviews and passing CI before merging." });

  const hasRequiredReviews = /require.*pull.*request|pr.*review|code.*review.*required|review.*before.*merge/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_required_reviews", label: "Required PR approvals", status: hasRequiredReviews ? "PASS" : "WARN", detail: hasRequiredReviews ? "Required review signals detected." : "No required review signals — require at least one approving review on PRs to catch bugs and maintain code quality." });

  const hasCodeowners = /codeowners|code.*owner/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_codeowners", label: "CODEOWNERS file", status: hasCodeowners ? "PASS" : "WARN", detail: hasCodeowners ? "CODEOWNERS signals detected." : "No CODEOWNERS signals — a CODEOWNERS file automatically requests reviews from domain experts when their code is changed." });

  const hasSecretScanning = /secret.*scanning|credential.*scanning|gitleaks|trufflehog|detect.*secret/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_secret_scanning", label: "GitHub secret scanning", status: hasSecretScanning ? "PASS" : "WARN", detail: hasSecretScanning ? "Secret scanning signals detected." : "No secret scanning signals — enable GitHub Secret Scanning and push protection to prevent API keys being committed." });

  const hasPrTemplate = /pull.*request.*template|pr.*template|\.github\/pull_request_template/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_pr_template", label: "PR description template", status: hasPrTemplate ? "PASS" : "WARN", detail: hasPrTemplate ? "PR template signals detected." : "No PR template signals — PR templates prompt engineers to include test plans, screenshots, and rollback procedures." });

  const hasIssueTemplates = /issue.*template|bug.*report.*template|feature.*request.*template|\.github\/issue_templates/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_issue_templates", label: "Issue templates", status: hasIssueTemplates ? "PASS" : "WARN", detail: hasIssueTemplates ? "Issue template signals detected." : "No issue template signals — issue templates reduce the back-and-forth needed to understand bug reports." });

  const hasCommitSigning = /signed.*commit|gpg.*signed|commit.*signing|sigstore|gitsign/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "commit_signing_enabled", label: "Signed commits (GPG / Sigstore)", status: hasCommitSigning ? "PASS" : "WARN", detail: hasCommitSigning ? "Commit signing signals detected." : "No commit signing signals — signed commits provide non-repudiation and are required by some compliance frameworks (FedRAMP, SOC 2)." });

  const hasReleaseAutomation = /semantic-release|release-please|changesets|conventional.*commit|automated.*release/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "release_automation", label: "Release automation (semantic-release / release-please)", status: hasReleaseAutomation ? "PASS" : "WARN", detail: hasReleaseAutomation ? "Release automation signals detected." : "No release automation signals — automate versioning and changelog generation with semantic-release or release-please to enforce consistent releases." });

  const hasStaleBot = /stale.*bot|probot.*stale|stale.*issue|close.*stale/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "stale_bot_configured", label: "Stale issue / PR management", status: hasStaleBot ? "PASS" : "WARN", detail: hasStaleBot ? "Stale issue management signals detected." : "No stale bot signals — configure a stale bot to automatically close inactive issues and PRs, keeping the backlog manageable." });

  return checks;
}
