import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { githubRequest, githubHeaders, parseGithubRepo } from "@/lib/github";
import type { AiConfig } from "@/server/pulse-ai";
import { getModelForTask } from "@/server/pulse-ai";

export interface ProposedFix {
  checkKey: string;
  filePath: string;
  newContent: string;
  explanation: string;
}

export interface FixAgentResult {
  proposedFixes: ProposedFix[];
  prUrl: string | null;
  summary: string;
}

const FIX_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the full contents of a file from the repository.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path from repo root, e.g. 'src/middleware.ts'" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: "List files and subdirectories at a path.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path, e.g. '.github/workflows' or empty string for root" },
      },
      required: ["path"],
    },
  },
  {
    name: "propose_fix",
    description: "Propose a complete file change to fix an audit issue. Only call this after reading the file.",
    input_schema: {
      type: "object" as const,
      properties: {
        checkKey:    { type: "string", description: "The audit check key this addresses, e.g. 'csp_header'" },
        filePath:    { type: "string", description: "Path to the file to create or update" },
        newContent:  { type: "string", description: "Complete new file content (not a diff)" },
        explanation: { type: "string", description: "1–2 sentence explanation of the change" },
      },
      required: ["checkKey", "filePath", "newContent", "explanation"],
    },
  },
];

const FIX_SYSTEM_PROMPT = `You are an expert software engineer making targeted fixes to a real production codebase.

You have three tools: read_file, list_directory, and propose_fix.

Rules:
- Always read_file before proposing any change — never guess file contents
- Start with list_directory("") to understand the project structure
- Keep each fix minimal — patch the specific issue, do not refactor
- If a file needs multiple fixes, combine them into one propose_fix call
- Maximum 6 propose_fix calls total
- Only fix things you can see clearly in the file contents
- If a file doesn't exist yet (e.g. no .github/workflows), you may create it from scratch
- Stop when you have addressed the highest-priority issues`;

async function readGithubFile(owner: string, repo: string, path: string): Promise<string> {
  const data = await githubRequest<{ content: string; encoding: string }>(
    `/repos/${owner}/${repo}/contents/${path}`,
  );
  if (data.encoding === "base64") {
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  }
  return data.content;
}

async function listGithubDirectory(owner: string, repo: string, path: string): Promise<string[]> {
  const data = await githubRequest<Array<{ name: string; type: string; path: string }>>(
    `/repos/${owner}/${repo}/contents/${path || ""}`,
  );
  return data.map((item) => `${item.type === "dir" ? "📁" : "📄"} ${item.path}`);
}

async function createFixPR(
  owner: string,
  repo: string,
  fixes: ProposedFix[],
  scanId: string,
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;

  const headers = { ...githubHeaders(), "Content-Type": "application/json" };

  // Get default branch + its HEAD SHA
  const repoData = await githubRequest<{ default_branch: string }>(`/repos/${owner}/${repo}`);
  const defaultBranch = repoData.default_branch;
  const branchData = await githubRequest<{ commit: { sha: string } }>(
    `/repos/${owner}/${repo}/branches/${defaultBranch}`,
  );
  const baseSha = branchData.commit.sha;

  const fixBranch = `pulse/audit-fixes-${new Date().toISOString().slice(0, 10)}`;

  // Create the fix branch
  await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${fixBranch}`, sha: baseSha }),
  });

  // Commit each proposed fix
  for (const fix of fixes) {
    let existingSha: string | undefined;
    try {
      const existing = await githubRequest<{ sha: string }>(
        `/repos/${owner}/${repo}/contents/${fix.filePath}?ref=${fixBranch}`,
      );
      existingSha = existing.sha;
    } catch {
      // New file — no SHA needed
    }

    await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fix.filePath}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `fix(pulse): ${fix.explanation}`,
        content: Buffer.from(fix.newContent, "utf-8").toString("base64"),
        branch: fixBranch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
  }

  // Create pull request
  const prBody = `## Pulse Audit — Automated Fixes

This PR was generated by [Gitwork Pulse](https://gitwork.io) from audit scan \`${scanId}\`.

### Changes (${fixes.length})

${fixes.map((f) => `**\`${f.filePath}\`** (\`${f.checkKey}\`)\n> ${f.explanation}`).join("\n\n")}

---
*Review each change carefully before merging. These are AI-generated suggestions based on static analysis.*`;

  const prResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `Pulse Audit: Fix ${fixes.length} issue${fixes.length > 1 ? "s" : ""}`,
      body: prBody,
      head: fixBranch,
      base: defaultBranch,
    }),
  });

  if (!prResp.ok) return null;
  const prData = (await prResp.json()) as { html_url: string };
  return prData.html_url;
}

export async function runFixAgent(scanId: string, aiConfig: AiConfig): Promise<FixAgentResult> {
  if (aiConfig.provider !== "ANTHROPIC" || !aiConfig.apiKey) {
    throw new Error("Fix agent requires an Anthropic API key.");
  }

  const scan = await prisma.pulseScan.findUnique({
    where: { id: scanId },
    include: { checks: { orderBy: { sortOrder: "asc" } } },
  });

  if (!scan || !scan.inputGithubRepo) {
    throw new Error("Fix agent requires a completed GitHub repo scan.");
  }

  const parsed = parseGithubRepo(scan.inputGithubRepo);
  if (!parsed) throw new Error("Invalid GitHub repo format.");
  const { owner, repo } = parsed;

  const issueChecks = scan.checks
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .slice(0, 10)
    .map((c) => `- [${c.status}] ${c.checkKey}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`)
    .join("\n");

  const userMessage = `Repository: ${owner}/${repo}

The following Pulse audit checks failed. Investigate the repo and propose targeted fixes for as many as you can:

${issueChecks}

Start by listing the root directory, then dive into relevant files.`;

  const client = new Anthropic({ apiKey: aiConfig.apiKey });
  const proposedFixes: ProposedFix[] = [];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  let response = await client.messages.create({
    model: getModelForTask(aiConfig, "fix-agent"),
    max_tokens: 4096,
    tools: FIX_AGENT_TOOLS,
    system: FIX_SYSTEM_PROMPT,
    messages,
  });

  // Agent loop — keep going while Claude wants to use tools
  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < 20) {
    iterations++;
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let result: string;
        try {
          const input = block.input as Record<string, string>;
          if (block.name === "read_file") {
            result = await readGithubFile(owner, repo, input.path);
          } else if (block.name === "list_directory") {
            const items = await listGithubDirectory(owner, repo, input.path ?? "");
            result = items.join("\n") || "(empty directory)";
          } else if (block.name === "propose_fix") {
            proposedFixes.push({
              checkKey: input.checkKey,
              filePath: input.filePath,
              newContent: input.newContent,
              explanation: input.explanation,
            });
            result = `Fix queued for ${input.filePath}`;
          } else {
            result = "Unknown tool";
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
        }
        return { type: "tool_result" as const, tool_use_id: block.id, content: result };
      }),
    );

    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: getModelForTask(aiConfig, "fix-agent"),
      max_tokens: 4096,
      tools: FIX_AGENT_TOOLS,
      system: FIX_SYSTEM_PROMPT,
      messages,
    });
  }

  if (proposedFixes.length === 0) {
    return {
      proposedFixes: [],
      prUrl: null,
      summary: "The agent could not generate automated fixes for the failing checks in this scan.",
    };
  }

  const prUrl = await createFixPR(owner, repo, proposedFixes, scanId);

  return {
    proposedFixes,
    prUrl,
    summary: `Generated ${proposedFixes.length} fix${proposedFixes.length > 1 ? "es" : ""} addressing: ${proposedFixes.map((f) => f.checkKey).join(", ")}.`,
  };
}
