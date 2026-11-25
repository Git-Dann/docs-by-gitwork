/**
 * Dispatch reading the client's code on GitHub: the files, one file, a search, recent commits,
 * and what changed between two versions or in a pull request.
 *
 * Only the repositories linked on the pinned client's platforms (src/lib/dispatch/code.ts), read
 * with the server's GITHUB_TOKEN through `githubRequest` (ETag-cached, §84.15). Secret files are
 * never opened, and every result still goes through the credential redaction in runTool.
 * Read-only: there is no tool that writes to GitHub.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asSource } from "@/lib/dispatch/prompt";
import {
  cleanRef,
  cleanRepoPath,
  contentsPath,
  isSensitivePath,
  numberedLines,
  pickRepo,
  repoChoices,
  repoLabel,
  type RepoChoice,
} from "@/lib/dispatch/code";
import { GitHubRequestError, githubRequest, hasGithubToken } from "@/lib/github";
import type { DispatchScope } from "./scope";
import type { DispatchTool, ToolOutcome } from "./tools";

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const repoProp = {
  repo: { type: "string", description: "Which repository, when the client has more than one: owner/repo, its name, or its platform's name." },
};

function tool<S extends z.ZodTypeAny>(t: DispatchTool<S>): DispatchTool {
  return t as unknown as DispatchTool;
}

const ghUrl = (r: RepoChoice, rest = "") => `https://github.com/${r.owner}/${r.repo}${rest}`;

/** The repository for this call, or a refusal the model can read. */
async function repoFor(scope: DispatchScope, wanted: string | undefined): Promise<RepoChoice | ToolOutcome> {
  if (!hasGithubToken()) return { text: "GitHub isn't connected to Foundry on this server, so I can't read code.", isError: true };
  const platforms = await prisma.clientPlatform.findMany({
    where: { clientId: scope.client.id, repoUrl: { not: null } },
    select: { name: true, repoUrl: true },
    orderBy: { name: "asc" },
  });
  const picked = pickRepo(repoChoices(platforms), wanted);
  return typeof picked === "string" ? { text: picked, isError: true } : picked;
}

function githubProblem(err: unknown, r: RepoChoice): ToolOutcome {
  if (err instanceof GitHubRequestError) {
    if (err.code === "GITHUB_NOT_FOUND") {
      return {
        text: `GitHub says that doesn't exist in ${repoLabel(r)}, or Foundry's GitHub access can't open that repository. If repo_files at the top level also fails, Foundry can't read this repository: a Super Admin needs to give Gitwork's GitHub account access to ${repoLabel(r)}. Don't retry with other searches.`,
        isError: true,
      };
    }
    // Code search answers 422 "Validation Failed" for a repository it can't search, usually
    // one Foundry's GitHub access can't read.
    if (err.code === "GITHUB_REQUEST_FAILED" && /validation failed|cannot be searched/i.test(err.message)) {
      return {
        text: `GitHub can't search ${repoLabel(r)} with Foundry's access, most likely because Gitwork's GitHub account can't read it. A Super Admin needs to give it access. Don't retry with other searches.`,
        isError: true,
      };
    }
    if (err.code === "GITHUB_RATE_LIMITED") return { text: "GitHub is limiting requests right now. Try again in a minute.", isError: true };
    if (err.code === "GITHUB_FORBIDDEN") return { text: `Foundry's GitHub access can't open ${repoLabel(r)}: a Super Admin needs to give Gitwork's GitHub account access to it. Don't retry.`, isError: true };
  }
  return { text: "GitHub didn't answer just now.", isError: true };
}

const isRepo = (v: RepoChoice | ToolOutcome): v is RepoChoice => "owner" in v;

interface ContentEntry {
  type: string;
  name: string;
  path: string;
  size?: number;
  content?: string;
  encoding?: string;
  html_url?: string;
}

const repoFiles = tool({
  name: "repo_files",
  description: "List the files and folders at a path in the client's GitHub repository (the top level when no path is given). Use it to find your way around before read_code.",
  input_schema: obj({ ...repoProp, path: { type: "string" } }),
  schema: z.object({ repo: z.string().max(140).optional(), path: z.string().max(300).optional() }).strict(),
  status: "Looking through the code",
  async run(scope, { repo, path }) {
    const r = await repoFor(scope, repo);
    if (!isRepo(r)) return r;
    const p = cleanRepoPath(path);
    if (p === null) return { text: "That path isn't valid.", isError: true };
    try {
      const data = await githubRequest<ContentEntry[] | ContentEntry>(contentsPath(r, p));
      if (!Array.isArray(data)) return { text: `${p} is a file. Use read_code to read it.` };
      const rows = data
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
        .slice(0, 200)
        .map((e) => (e.type === "dir" ? `${e.path}/` : `${e.path}${e.size ? ` (${Math.ceil(e.size / 1024)} KB)` : ""}${isSensitivePath(e.path) ? " [secret file, not readable]" : ""}`));
      return {
        text: asSource("code", `${repoLabel(r)}:${p || "/"}`, rows.join("\n") || "(empty)"),
        sources: [{ kind: "code", id: `${repoLabel(r)}:${p}`, label: `${r.repo}/${p}`, href: ghUrl(r, p ? `/tree/HEAD/${p}` : "") }],
      };
    } catch (err) {
      return githubProblem(err, r);
    }
  },
});

const readCode = tool({
  name: "read_code",
  description: "Read a file from the client's GitHub repository, with line numbers. For a long file, pass fromLine/toLine to read the part you need. Secret files (.env, keys, certificates) are never readable.",
  input_schema: obj({ ...repoProp, path: { type: "string" }, fromLine: { type: "number" }, toLine: { type: "number" } }, ["path"]),
  schema: z
    .object({
      repo: z.string().max(140).optional(),
      path: z.string().min(1).max(300),
      fromLine: z.number().int().min(1).optional(),
      toLine: z.number().int().min(1).optional(),
    })
    .strict(),
  status: "Reading the code",
  codeSized: true,
  async run(scope, { repo, path, fromLine, toLine }) {
    const r = await repoFor(scope, repo);
    if (!isRepo(r)) return r;
    const p = cleanRepoPath(path);
    if (!p) return { text: "That path isn't valid.", isError: true };
    if (isSensitivePath(p)) return { text: `${p} holds secrets, so I don't read it.`, isError: true };
    try {
      const data = await githubRequest<ContentEntry | ContentEntry[]>(contentsPath(r, p));
      if (Array.isArray(data)) return { text: `${p} is a folder. Use repo_files to list it.` };
      if (data.type !== "file") return { text: `${p} isn't a file I can read.` };
      if (!data.content || data.encoding !== "base64") return { text: `${p} is too large to read here (${Math.ceil((data.size ?? 0) / 1024)} KB). Open it on GitHub.` };
      const bytes = Buffer.from(data.content, "base64");
      if (bytes.includes(0)) return { text: `${p} is a binary file, not code.` };
      const cut = numberedLines(bytes.toString("utf8"), fromLine, toLine);
      const tail = cut.more ? `\n[${cut.total} lines in all; ask from line ${cut.more} for more]` : "";
      return {
        text: asSource("code", `${repoLabel(r)}:${p}`, `${cut.text}${tail}`),
        sources: [{ kind: "code", id: `${repoLabel(r)}:${p}`, label: `${r.repo}/${p}`, href: data.html_url ?? ghUrl(r, `/blob/HEAD/${p}`) }],
      };
    } catch (err) {
      return githubProblem(err, r);
    }
  },
});

const searchCode = tool({
  name: "search_code",
  description: "Search the client's GitHub repository for a word or name (a function, a screen, an error message). Returns the files it appears in; read them with read_code.",
  input_schema: obj({ ...repoProp, query: { type: "string" } }, ["query"]),
  schema: z.object({ repo: z.string().max(140).optional(), query: z.string().min(2).max(120) }).strict(),
  status: "Searching the code",
  async run(scope, { repo, query }) {
    const r = await repoFor(scope, repo);
    if (!isRepo(r)) return r;
    // GitHub's search syntax: quote the words, and the repo qualifier is ours, never the model's.
    const words = query.replace(/["\\]/g, " ").replace(/\b(repo|org|user):\S*/gi, " ").trim();
    if (!words) return { text: "Give me something to search for.", isError: true };
    try {
      const data = await githubRequest<{ total_count: number; items: { path: string; html_url: string }[] }>(
        `/search/code?per_page=20&q=${encodeURIComponent(`"${words}" repo:${r.owner}/${r.repo}`)}`,
      );
      const items = data.items.filter((i) => !isSensitivePath(i.path));
      if (!items.length) return { text: `Nothing in ${repoLabel(r)} matches "${words}". GitHub only searches the default branch.` };
      return {
        text: asSource("code", `${repoLabel(r)}:search`, `${data.total_count} match${data.total_count === 1 ? "" : "es"} for "${words}":\n${items.map((i) => `- ${i.path}`).join("\n")}`),
        sources: items.slice(0, 4).map((i) => ({ kind: "code" as const, id: `${repoLabel(r)}:${i.path}`, label: `${r.repo}/${i.path}`, href: i.html_url })),
      };
    } catch (err) {
      return githubProblem(err, r);
    }
  },
});

interface CommitRow {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } };
}

const recentCommits = tool({
  name: "recent_commits",
  description: "Recent commits on the client's repository (the default branch unless a branch is named), optionally only those touching a path, and how many days back (default 14).",
  input_schema: obj({ ...repoProp, path: { type: "string" }, branch: { type: "string" }, days: { type: "number" } }),
  schema: z
    .object({
      repo: z.string().max(140).optional(),
      path: z.string().max(300).optional(),
      branch: z.string().max(120).optional(),
      days: z.number().int().min(1).max(365).optional(),
    })
    .strict(),
  status: "Reading the commit history",
  async run(scope, { repo, path, branch, days }) {
    const r = await repoFor(scope, repo);
    if (!isRepo(r)) return r;
    const p = cleanRepoPath(path);
    const ref = branch ? cleanRef(branch) : null;
    if (p === null || (branch && !ref)) return { text: "That path or branch isn't valid.", isError: true };
    const since = new Date(Date.now() - (days ?? 14) * 86_400_000).toISOString();
    const qs = new URLSearchParams({ per_page: "30", since });
    if (p) qs.set("path", p);
    if (ref) qs.set("sha", ref);
    try {
      const rows = await githubRequest<CommitRow[]>(`/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/commits?${qs}`);
      if (!rows.length) return { text: `No commits in the last ${days ?? 14} days${p ? ` touching ${p}` : ""}.` };
      const lines = rows.map((c) => `${c.sha.slice(0, 7)} ${c.commit.author?.date?.slice(0, 10) ?? ""} ${c.commit.author?.name ?? "?"}: ${c.commit.message.split("\n")[0].slice(0, 160)}`);
      return {
        text: asSource("code", `${repoLabel(r)}:commits`, lines.join("\n")),
        sources: [{ kind: "code", id: `${repoLabel(r)}:commits`, label: `${r.repo} commits`, href: ghUrl(r, "/commits") }],
      };
    } catch (err) {
      return githubProblem(err, r);
    }
  },
});

interface CompareResult {
  status: string;
  ahead_by: number;
  behind_by: number;
  html_url: string;
  commits: CommitRow[];
  files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

const PATCH_CAP = 1500;

const compareCode = tool({
  name: "compare_code",
  description: "What changed in the client's repository: pass a pull request number, or base and head (branches, tags or commit shas). Lists the commits and the changed files with their diffs (long diffs shortened). Use it for PR descriptions, release notes and impact analysis.",
  input_schema: obj({ ...repoProp, pullRequest: { type: "number" }, base: { type: "string" }, head: { type: "string" } }),
  schema: z
    .object({
      repo: z.string().max(140).optional(),
      pullRequest: z.number().int().min(1).optional(),
      base: z.string().max(120).optional(),
      head: z.string().max(120).optional(),
    })
    .strict(),
  status: "Comparing versions of the code",
  codeSized: true,
  async run(scope, { repo, pullRequest, base, head }) {
    const r = await repoFor(scope, repo);
    if (!isRepo(r)) return r;
    const repoPath = `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`;
    try {
      let b = base ? cleanRef(base) : null;
      let h = head ? cleanRef(head) : null;
      let title = "";
      if (pullRequest) {
        const pr = await githubRequest<{ title: string; body: string | null; base: { sha: string; ref: string }; head: { sha: string; ref: string } }>(
          `${repoPath}/pulls/${pullRequest}`,
        );
        b = pr.base.sha;
        h = pr.head.sha;
        title = `Pull request #${pullRequest}: ${pr.title} (${pr.head.ref} into ${pr.base.ref})\n${(pr.body ?? "").slice(0, 1500)}\n\n`;
      }
      if (!b || !h) return { text: "Give a pull request number, or both base and head.", isError: true };
      const cmp = await githubRequest<CompareResult>(`${repoPath}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`);
      const commits = cmp.commits.slice(-30).map((c) => `- ${c.sha.slice(0, 7)} ${c.commit.author?.name ?? "?"}: ${c.commit.message.split("\n")[0].slice(0, 160)}`);
      const files = (cmp.files ?? []).slice(0, 60).map((f) => {
        const head = `${f.status} ${f.filename} (+${f.additions} -${f.deletions})`;
        if (isSensitivePath(f.filename)) return `${head} [secret file, diff not shown]`;
        const patch = f.patch ? (f.patch.length > PATCH_CAP ? `${f.patch.slice(0, PATCH_CAP)}\n… (diff shortened)` : f.patch) : "(no text diff)";
        return `${head}\n${patch}`;
      });
      const summary = `${title}${cmp.ahead_by} commit${cmp.ahead_by === 1 ? "" : "s"} ahead, ${cmp.behind_by} behind.\n\nCommits:\n${commits.join("\n")}\n\nFiles (${cmp.files?.length ?? 0}):\n${files.join("\n\n")}`;
      return {
        text: asSource("code", `${repoLabel(r)}:compare`, summary),
        sources: [{ kind: "code", id: `${repoLabel(r)}:${b}...${h}`, label: pullRequest ? `${r.repo} PR #${pullRequest}` : `${r.repo} ${b}…${h}`, href: pullRequest ? ghUrl(r, `/pull/${pullRequest}`) : cmp.html_url }],
      };
    } catch (err) {
      return githubProblem(err, r);
    }
  },
});

/** In registry order (the order is part of the cached prefix: append, never reorder). */
export const CODE_TOOLS: readonly DispatchTool[] = [repoFiles, readCode, searchCode, recentCommits, compareCode];
