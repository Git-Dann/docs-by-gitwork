/**
 * Which of a client's design and code links Dispatch can actually open, and what to do about the
 * ones it can't (§173). Dan, 26 Nov 2026: two of Wedge's three Figma links didn't open, and
 * Dispatch can only read GitHub repos that are linked on a client's platforms; nobody could see
 * that without asking Dispatch and hitting the wall.
 *
 * Figma links are opened with the workspace's Figma token (Settings → Dispatch); repos with the
 * server's GitHub token. Each link gets a status and, when it fails, the fix in plain words.
 * Used by the `check_links` tool (one client) and Settings → Dispatch (every active client).
 */

import { prisma } from "@/lib/prisma";
import { parseFigmaUrl } from "@/lib/dispatch/figma";
import { GitHubRequestError, githubRequest, hasGithubToken, parseGithubRepo } from "@/lib/github";
import { readSecret } from "@/server/stored-secret";

export interface LinkStatus {
  kind: "design" | "repo";
  name: string;
  url: string | null;
  ok: boolean;
  /** What's wrong, plainly; null when it opens. */
  problem: string | null;
  /** Who does what to fix it; null when it opens. */
  fix: string | null;
}

export interface ClientLinks {
  clientId: string;
  clientName: string;
  clientSlug: string;
  links: LinkStatus[];
  /** Missing links worth knowing about ("No GitHub repository linked"). */
  gaps: string[];
}

const FIGMA_API = "https://api.figma.com/v1";

async function checkFigma(token: string | null, fileKey: string): Promise<{ ok: boolean; problem: string | null; fix: string | null }> {
  if (!token) return { ok: false, problem: "Figma isn't connected to Foundry.", fix: "A Super Admin adds a Figma token in Settings → Dispatch." };
  const res = await fetch(`${FIGMA_API}/files/${fileKey}?depth=1`, {
    headers: { "X-Figma-Token": token },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return { ok: false, problem: "Figma didn't answer.", fix: "Try the check again in a minute." };
  if (res.ok) return { ok: true, problem: null, fix: null };
  if (res.status === 403 || res.status === 404) {
    // Figma answers 404 for a file the token's account can't see, as well as one that's gone.
    return {
      ok: false,
      problem: "Foundry's Figma account can't open this file: it isn't shared with that account, or the link is old.",
      fix: "Open the link to check it's the right file, then share it (view access is enough) with the Figma account Foundry's token belongs to, or replace the link in Portal → Designs.",
    };
  }
  if (res.status === 429) return { ok: false, problem: "Figma is limiting requests right now.", fix: "Try the check again in a minute." };
  return { ok: false, problem: `Figma refused the request (${res.status}).`, fix: "Check the Figma token in Settings → Dispatch." };
}

async function checkRepo(owner: string, repo: string): Promise<{ ok: boolean; problem: string | null; fix: string | null }> {
  if (!hasGithubToken()) return { ok: false, problem: "GitHub isn't connected to Foundry on this server.", fix: "Set GITHUB_TOKEN on the server." };
  try {
    await githubRequest(`/repos/${owner}/${repo}`);
    return { ok: true, problem: null, fix: null };
  } catch (err) {
    const code = err instanceof GitHubRequestError ? err.code : "";
    if (code === "GITHUB_NOT_FOUND" || code === "GITHUB_FORBIDDEN") {
      return {
        ok: false,
        problem: "Foundry's GitHub account can't open this repository, or it doesn't exist.",
        fix: `Give Gitwork's GitHub account read access to ${owner}/${repo}, or fix the repository link on the client's platform in Portal.`,
      };
    }
    if (code === "GITHUB_RATE_LIMITED") return { ok: false, problem: "GitHub is limiting requests right now.", fix: "Try the check again in a minute." };
    return { ok: false, problem: "GitHub didn't answer.", fix: "Try the check again in a minute." };
  }
}

export async function checkClientLinks(workspaceId: string, clientId: string): Promise<ClientLinks | null> {
  const [client, ws] = await Promise.all([
    prisma.workspaceClient.findFirst({
      where: { id: clientId, workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        designs: { select: { name: true, url: true }, orderBy: { name: "asc" } },
        platforms: { where: { repoUrl: { not: null } }, select: { name: true, repoUrl: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { figmaToken: true } }),
  ]);
  if (!client) return null;
  const token = readSecret(ws?.figmaToken);
  const links: LinkStatus[] = [];

  for (const d of client.designs) {
    const parsed = parseFigmaUrl(d.url);
    if (!parsed) {
      links.push({
        kind: "design",
        name: d.name,
        url: d.url,
        ok: false,
        problem: d.url ? "Not a Figma file link, so Dispatch can't open it." : "No link saved.",
        fix: "Fine if it isn't a Figma design; otherwise paste the Figma file's link in Portal → Designs.",
      });
      continue;
    }
    links.push({ kind: "design", name: d.name, url: d.url, ...(await checkFigma(token, parsed.fileKey)) });
  }

  const seen = new Set<string>();
  for (const p of client.platforms) {
    const parsed = p.repoUrl ? parseGithubRepo(p.repoUrl) : null;
    if (!parsed) {
      links.push({ kind: "repo", name: p.name, url: p.repoUrl, ok: false, problem: "Not a GitHub repository link.", fix: "Use the repository's github.com link on the platform in Portal." });
      continue;
    }
    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ kind: "repo", name: `${p.name} (${parsed.owner}/${parsed.repo})`, url: p.repoUrl, ...(await checkRepo(parsed.owner, parsed.repo)) });
  }

  const gaps: string[] = [];
  if (!client.designs.length) gaps.push("No designs linked in Portal → Designs.");
  if (!client.platforms.length) gaps.push("No GitHub repository linked on any platform in Portal → Platforms.");
  return { clientId: client.id, clientName: client.name, clientSlug: client.slug, links, gaps };
}

/** Plain text for the model: what opens, what doesn't, and the fix. */
export function linksText(r: ClientLinks): string {
  const row = (l: LinkStatus) => (l.ok ? `- ${l.kind === "design" ? "Design" : "Code"}: ${l.name}: opens.` : `- ${l.kind === "design" ? "Design" : "Code"}: ${l.name}: doesn't open. ${l.problem} Fix: ${l.fix}`);
  return [`${r.clientName}'s links:`, ...r.links.map(row), ...r.gaps.map((g) => `- ${g}`)].join("\n");
}
