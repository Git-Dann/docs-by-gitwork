import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput } from "./_types";

// Guesses at repository settings from a website's HTML. Every key here is WITHHELD
// (check-relevance-data.ts): a page cannot show a repository setting. CODEOWNERS,
// templates, release automation, code/secret scanning and signed commits are now read
// from the repository itself (repo-collaboration.ts, code-agent.ts).
export async function runCodeQualityExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  const hasBranchProtection = /branch.*protection|protected.*branch|require.*review|required.*review/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_branch_protection", label: "Branch protection rules", status: hasBranchProtection ? "PASS" : "WARN", detail: hasBranchProtection ? "Branch protection signals detected." : "No branch protection signals — enable branch protection on main/master to require PR reviews and passing CI before merging." });

  const hasRequiredReviews = /require.*pull.*request|pr.*review|code.*review.*required|review.*before.*merge/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "github_required_reviews", label: "Required PR approvals", status: hasRequiredReviews ? "PASS" : "WARN", detail: hasRequiredReviews ? "Required review signals detected." : "No required review signals — require at least one approving review on PRs to catch bugs and maintain code quality." });

  const hasStaleBot = /stale.*bot|probot.*stale|stale.*issue|close.*stale/i.test(html);
  checks.push({ category: CATEGORIES.CODE_QUALITY, checkKey: "stale_bot_configured", label: "Stale issue / PR management", status: hasStaleBot ? "PASS" : "WARN", detail: hasStaleBot ? "Stale issue management signals detected." : "No stale bot signals — configure a stale bot to automatically close inactive issues and PRs, keeping the backlog manageable." });

  return checks;
}
