/**
 * The developer details a person can fill in for themselves, from Backstage → Me: the things
 * they know better than anyone (their GitHub handle, their stack, where they are). Rates,
 * clients and reviews stay with the team, in Code.
 *
 * Pure, so the form and the route apply exactly the same rules.
 */

export interface DeveloperSelfDetails {
  githubHandle?: string | null;
  primaryStack?: string | null;
  techStacks?: string[];
  location?: string | null;
  timezone?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
}

/** What someone sees of their own developer details. */
export interface OwnDeveloperDetails {
  recordId: string;
  /** Listed under Code → Developers (marked, or has a GitHub handle). */
  isDeveloper: boolean;
  githubHandle: string | null;
  primaryStack: string | null;
  techStacks: string[];
  location: string | null;
  timezone: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

/** GitHub's own rule: letters, digits and single hyphens, not at either end, 39 at most. */
const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** "@name", "github.com/name" and "https://github.com/name/" all mean "name". */
export function cleanGithubHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?github\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .split(/[/?#]/)[0];
}

function cleanUrl(raw: string | null | undefined, label: string): { value: string | null } | { error: string } {
  const t = raw?.trim() ?? "";
  if (!t) return { value: null };
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return { error: `${label} must be a web address` };
    if (withScheme.length > 300) return { error: `${label} must be 300 characters or fewer` };
    return { value: withScheme };
  } catch {
    return { error: `${label} must be a web address` };
  }
}

export function normaliseDeveloperSelfDetails(
  input: DeveloperSelfDetails,
): { ok: true; value: DeveloperSelfDetails } | { ok: false; error: string } {
  const out: DeveloperSelfDetails = {};

  if (input.githubHandle !== undefined && input.githubHandle !== null && input.githubHandle.trim()) {
    const handle = cleanGithubHandle(input.githubHandle);
    if (!GITHUB_USERNAME.test(handle)) {
      return { ok: false, error: "That isn't a GitHub username: letters, numbers and single hyphens, up to 39 characters" };
    }
    out.githubHandle = handle;
  }
  // A blank handle is "leave it as it is": removing it would quietly take someone off the
  // Developers list, which is the team's call, not a side effect of a form.

  for (const [key, max, label] of [
    ["primaryStack", 60, "Main stack"],
    ["location", 80, "Location"],
    ["timezone", 60, "Time zone"],
  ] as const) {
    const v = input[key];
    if (v === undefined) continue;
    const t = (v ?? "").trim();
    if (t.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer` };
    out[key] = t || null;
  }

  if (input.techStacks !== undefined) {
    const seen = new Set<string>();
    const stacks: string[] = [];
    for (const s of input.techStacks) {
      const t = s.trim();
      if (!t) continue;
      if (t.length > 40) return { ok: false, error: "Each technology must be 40 characters or fewer" };
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      stacks.push(t);
    }
    if (stacks.length > 15) return { ok: false, error: "Add 15 technologies at most" };
    out.techStacks = stacks;
  }

  for (const [key, label] of [
    ["linkedinUrl", "LinkedIn"],
    ["portfolioUrl", "Portfolio"],
  ] as const) {
    if (input[key] === undefined) continue;
    const r = cleanUrl(input[key], label);
    if ("error" in r) return { ok: false, error: r.error };
    out[key] = r.value;
  }

  return { ok: true, value: out };
}

/** What's still missing for a useful developer card. Empty when nothing is. */
export function missingDeveloperDetails(d: { githubHandle: string | null | undefined; primaryStack: string | null | undefined }): string[] {
  const missing: string[] = [];
  if (!d.githubHandle?.trim()) missing.push("GitHub handle");
  if (!d.primaryStack?.trim()) missing.push("main stack");
  return missing;
}
