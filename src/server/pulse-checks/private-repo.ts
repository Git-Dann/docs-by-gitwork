// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE REPOSITORIES — open-source conventions are not launch requirements.
//
// Most repos Gitwork scans are a client's PRIVATE product code: an iOS app shipped
// through the App Store, a SaaS deployed from a branch. Pulse graded them like public
// open-source projects — no LICENSE, no CONTRIBUTING.md, no code of conduct, no
// GitHub stars, a low issue-close rate, no tagged releases — and every one of those
// marked a perfectly healthy private product down. None of them is something the
// product's users, its store reviewer or its acquirer will ever look for.
//
// The rule is applied in runLiteScan's ingest (in-app, public and MCP scans alike),
// and only when GitHub has SAID the repo is private. Unknown visibility (null)
// changes nothing — "we could not tell" is never read as "private" (§35).
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";

/** true = private (or enterprise-internal), false = public, null = not established. */
export type RepoVisibility = boolean | null;

/** Open-source hygiene: only meaningful when strangers can read, use and contribute. */
export const OPEN_SOURCE_ONLY_KEYS: ReadonlySet<string> = new Set([
  "has_license",
  "has_license_graphql",
  "has_contributing",
  "has_code_of_conduct",
  "has_security_md",
  "has_changelog_file",
  "issue_close_rate",
  "github_stars",
  "github_issue_templates",
  "github_pr_template",
]);

export const PRIVATE_REPO_DETAIL =
  "Private product repository: this is an open-source convention, not a launch requirement.";

const RELEASES_PRIVATE_DETAIL =
  "No tagged releases — fine for a private product shipped through an app store or deployed from a branch, where the store or deploy history is the version record.";

const isAdverse = (status: PulseScanCheckInput["status"]) => status === "WARN" || status === "FAIL";

/**
 * Read GitHub's own answer from a REST `/repos/{owner}/{repo}` body (or a GraphQL
 * `repository { isPrivate visibility }`). Anything we cannot read is `null`.
 */
export function parseRepoVisibility(meta: unknown): RepoVisibility {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as { private?: unknown; isPrivate?: unknown; visibility?: unknown };
  const visibility = typeof m.visibility === "string" ? m.visibility.toLowerCase() : null;
  // "internal" is an enterprise-only repo: not public, so not an open-source project.
  if (visibility === "private" || visibility === "internal") return true;
  if (visibility === "public") return false;
  if (typeof m.private === "boolean") return m.private;
  if (typeof m.isPrivate === "boolean") return m.isPrivate;
  return null;
}

/** Adjust one check for the repo's visibility. Public and unknown repos are untouched. */
export function applyPrivateRepoPolicy(
  check: PulseScanCheckInput,
  isPrivate: RepoVisibility,
): PulseScanCheckInput {
  if (isPrivate !== true) return check;

  if (OPEN_SOURCE_ONLY_KEYS.has(check.checkKey)) {
    // A PASS stands as well — it is still not a requirement, so it should not lift the
    // score of a private repo that happens to carry an MIT licence either.
    if (check.status === "NOT_APPLICABLE" || check.status === "SKIPPED") return check;
    return { ...check, status: "NOT_APPLICABLE", detail: PRIVATE_REPO_DETAIL };
  }

  if (check.checkKey === "has_releases" && isAdverse(check.status)) {
    return { ...check, status: "PASS", detail: RELEASES_PRIVATE_DETAIL, evidence: check.detail ?? check.evidence };
  }

  if (check.checkKey === "commit_velocity" && check.status === "FAIL") {
    return {
      ...check,
      status: "WARN",
      detail: `${check.detail ?? "Little recent commit activity."} For a private product this is informational — a shipped app in maintenance can be quiet for weeks.`,
    };
  }

  return check;
}

export function applyPrivateRepoPolicyAll(
  checks: PulseScanCheckInput[],
  isPrivate: RepoVisibility,
): PulseScanCheckInput[] {
  return isPrivate === true ? checks.map((c) => applyPrivateRepoPolicy(c, isPrivate)) : checks;
}
