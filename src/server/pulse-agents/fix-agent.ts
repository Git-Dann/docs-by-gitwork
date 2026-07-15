import Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { githubRequest, githubHeaders, parseGithubRepo } from "@/lib/github";
import type { AiConfig } from "@/server/pulse-ai";
import { getModelForTask } from "@/server/pulse-ai";
import { recordAiUsage, usageFromAnthropic, usageFromOpenAI } from "@/server/ai-usage";

export interface ProposedFix {
  checkKey: string;
  filePath: string;
  newContent: string;
  explanation: string;
}

export interface ManualAction {
  checkKey: string;
  label: string;
  why: string;
}

export interface FixAgentResult {
  proposedFixes: ProposedFix[];
  prUrl: string | null;
  manualActions: ManualAction[];
  summary: string;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOL_DEFS = {
  read_file: {
    description: "Read the full contents of a file from the repository.",
    parameters: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path from repo root, e.g. 'src/middleware.ts'" },
      },
      required: ["path"],
    },
  },
  list_directory: {
    description: "List files and subdirectories at a path.",
    parameters: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path, e.g. '.github/workflows' or empty string for root" },
      },
      required: ["path"],
    },
  },
  propose_fix: {
    description: "Propose a complete file change to fix an audit issue. Only call this after reading the file.",
    parameters: {
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
} as const;

// Anthropic tool format
const ANTHROPIC_TOOLS: Anthropic.Tool[] = Object.entries(TOOL_DEFS).map(([name, def]) => ({
  name,
  description: def.description,
  input_schema: {
    type: def.parameters.type,
    properties: def.parameters.properties as Record<string, unknown>,
    required: [...def.parameters.required],
  },
}));

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

// ── GitHub helpers ────────────────────────────────────────────────────────────

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

async function executeTool(
  name: string,
  input: Record<string, string>,
  owner: string,
  repo: string,
  proposedFixes: ProposedFix[],
): Promise<string> {
  try {
    if (name === "read_file") {
      return await readGithubFile(owner, repo, input.path);
    }
    if (name === "list_directory") {
      const items = await listGithubDirectory(owner, repo, input.path ?? "");
      return items.join("\n") || "(empty directory)";
    }
    if (name === "propose_fix") {
      proposedFixes.push({
        checkKey: input.checkKey,
        filePath: input.filePath,
        newContent: input.newContent,
        explanation: input.explanation,
      });
      return `Fix queued for ${input.filePath}`;
    }
    return "Unknown tool";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ── Anthropic agent loop ──────────────────────────────────────────────────────

/**
 * Return a view of `messages` with a single cache breakpoint on the last block of the most-recent
 * turn, so each loop iteration reads the growing tool_use/tool_result prefix from cache instead of
 * re-billing it at full input rates. Stored messages stay clean (no accumulating breakpoints);
 * combined with the static system breakpoint that's 2 total, within the 4-breakpoint limit.
 */
function withPrefixCache(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const cc = { type: "ephemeral" as const };
  const out = [...messages];
  const last = out[out.length - 1];
  if (typeof last.content === "string") {
    out[out.length - 1] = { ...last, content: [{ type: "text", text: last.content, cache_control: cc }] };
  } else {
    const blocks = [...last.content];
    // The last block here is always tool_result / text / tool_use (never a thinking block),
    // all of which carry optional cache_control — the cast narrows the param union.
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: cc } as Anthropic.ContentBlockParam;
    out[out.length - 1] = { ...last, content: blocks };
  }
  return out;
}

async function runAnthropicLoop(
  client: Anthropic,
  model: string,
  userMessage: string,
  owner: string,
  repo: string,
  proposedFixes: ProposedFix[],
  workspaceId?: string,
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  const cachedSystem: Anthropic.TextBlockParam[] = [
    { type: "text", text: FIX_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];

  let t0 = Date.now();
  let response = await client.messages.create({
    model,
    max_tokens: 4096,
    tools: ANTHROPIC_TOOLS,
    system: cachedSystem,
    messages: withPrefixCache(messages),
  });
  if (workspaceId) recordAiUsage({ module: "PULSE", workspaceId, operation: "fixAgent", provider: "ANTHROPIC", model, usage: usageFromAnthropic(response.usage), latencyMs: Date.now() - t0 });

  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < 20) {
    iterations++;
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const result = await executeTool(
          block.name,
          block.input as Record<string, string>,
          owner,
          repo,
          proposedFixes,
        );
        return { type: "tool_result" as const, tool_use_id: block.id, content: result };
      }),
    );

    messages.push({ role: "user", content: toolResults });

    t0 = Date.now();
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      tools: ANTHROPIC_TOOLS,
      system: cachedSystem,
      messages: withPrefixCache(messages),
    });
    if (workspaceId) recordAiUsage({ module: "PULSE", workspaceId, operation: "fixAgent", provider: "ANTHROPIC", model, usage: usageFromAnthropic(response.usage), latencyMs: Date.now() - t0 });
  }
}

// ── OpenAI-compatible agent loop (OpenAI, Gemini, Local) ─────────────────────

async function runOpenAILoop(
  aiConfig: AiConfig,
  userMessage: string,
  owner: string,
  repo: string,
  proposedFixes: ProposedFix[],
  workspaceId?: string,
): Promise<void> {
  const { default: OpenAIClient } = await import("openai");
  const client = new OpenAIClient({
    apiKey: aiConfig.apiKey ?? "local",
    ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {}),
  });

  const openaiTools = Object.entries(TOOL_DEFS).map(([name, def]) => ({
    type: "function" as const,
    function: {
      name,
      description: def.description,
      parameters: { ...def.parameters, required: [...def.parameters.required] },
    },
  }));

  type OAIMessage = OpenAI.ChatCompletionMessageParam;
  const messages: OAIMessage[] = [
    { role: "system", content: FIX_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let t0 = Date.now();
  let response = await client.chat.completions.create({
    model: aiConfig.model,
    max_tokens: 4096,
    tools: openaiTools,
    tool_choice: "auto",
    messages,
  });
  if (workspaceId) recordAiUsage({ module: "PULSE", workspaceId, operation: "fixAgent", provider: "OPENAI", model: aiConfig.model, usage: usageFromOpenAI(response.usage), latencyMs: Date.now() - t0 });

  let iterations = 0;
  while (response.choices[0]?.finish_reason === "tool_calls" && iterations < 20) {
    iterations++;
    const assistantMsg = response.choices[0].message;
    messages.push(assistantMsg as OAIMessage);

    type FnToolCall = { id: string; function: { name: string; arguments: string } };
    const toolCalls = (assistantMsg.tool_calls ?? []).filter(
      (tc): tc is FnToolCall & typeof tc => "function" in tc,
    ) as FnToolCall[];

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const input = JSON.parse(toolCall.function.arguments) as Record<string, string>;
        const result = await executeTool(
          toolCall.function.name,
          input,
          owner,
          repo,
          proposedFixes,
        );
        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: result,
        } satisfies OpenAI.ChatCompletionToolMessageParam;
      }),
    );

    messages.push(...toolResults);

    t0 = Date.now();
    response = await client.chat.completions.create({
      model: aiConfig.model,
      max_tokens: 4096,
      tools: openaiTools,
      tool_choice: "auto",
      messages,
    });
    if (workspaceId) recordAiUsage({ module: "PULSE", workspaceId, operation: "fixAgent", provider: "OPENAI", model: aiConfig.model, usage: usageFromOpenAI(response.usage), latencyMs: Date.now() - t0 });
  }
}

// ── PR creation ───────────────────────────────────────────────────────────────

async function createFixPR(
  owner: string,
  repo: string,
  fixes: ProposedFix[],
  scanId: string,
  manualActions: ManualAction[] = [],
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return null;

  const headers = { ...githubHeaders(), "Content-Type": "application/json" };

  const repoData = await githubRequest<{ default_branch: string }>(`/repos/${owner}/${repo}`);
  const defaultBranch = repoData.default_branch;
  const branchData = await githubRequest<{ commit: { sha: string } }>(
    `/repos/${owner}/${repo}/branches/${defaultBranch}`,
  );
  const baseSha = branchData.commit.sha;

  const fixBranch = `pulse/audit-fixes-${new Date().toISOString().slice(0, 10)}`;

  await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${fixBranch}`, sha: baseSha }),
  });

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

  const prBody = `## Pulse Audit — Automated Fixes

This PR was generated by [Gitwork Pulse](https://gitwork.io) from audit scan \`${scanId}\`.

### Changes (${fixes.length})

${fixes.map((f) => `**\`${f.filePath}\`** (\`${f.checkKey}\`)\n> ${f.explanation}`).join("\n\n")}
${manualActions.length > 0 ? `

### ⚠️ Needs manual action (${manualActions.length}) — not safe to auto-fix in a PR

${manualActions.map((m) => `- **${m.label}** (\`${m.checkKey}\`) — ${m.why}`).join("\n")}
` : ""}
---
*Review each change carefully before merging. These are AI-generated suggestions based on static analysis. Manual-action items (RLS, DNS, secrets) require dashboard/runtime changes a PR can't safely make.*`;

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

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runFixAgent(scanId: string, aiConfig: AiConfig): Promise<FixAgentResult> {
  if (!aiConfig.apiKey) {
    throw new Error("No AI API key configured — add one in Settings → Integrations.");
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

  const failing = scan.checks.filter((c) => c.status === "FAIL" || c.status === "WARN");

  // Only attempt findings a PR can SAFELY land — config/static-file/markup changes.
  // Everything else (RLS, DNS, secrets, Firebase rules) is a dashboard/runtime change
  // and is surfaced as a "manual action" instead of a risky auto-edit.
  const fixableChecks = failing.filter((c) => MECHANICALLY_FIXABLE.has(c.checkKey)).slice(0, 10);
  const manualActions = failing
    .filter((c) => c.trustBucket === "CONFIRMED" && !MECHANICALLY_FIXABLE.has(c.checkKey))
    .map((c) => ({ checkKey: c.checkKey, label: c.label, why: c.detail ?? "" }));

  // Nothing safe to PR — still report the confirmed manual actions.
  if (fixableChecks.length === 0) {
    return {
      proposedFixes: [],
      prUrl: null,
      manualActions,
      summary: manualActions.length > 0
        ? `No PR-safe fixes — ${manualActions.length} confirmed issue(s) need manual action (e.g. Supabase RLS, DNS, secrets).`
        : "No mechanically-fixable issues found in this scan.",
    };
  }

  const issueChecks = fixableChecks
    .map((c) => `- [${c.status}] ${c.checkKey}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`)
    .join("\n");

  const userMessage = `Repository: ${owner}/${repo}

These Pulse audit findings are mechanically fixable via a code/config change. Investigate the repo and propose targeted, minimal fixes for as many as you can (e.g. security headers in next.config/vercel.json, a /.well-known/security.txt, robots.txt, meta/OG tags, a "Do Not Sell" footer link). Do NOT attempt runtime/infra changes (database RLS, DNS, secrets):

${issueChecks}

Start by listing the root directory, then dive into relevant files.`;

  const proposedFixes: ProposedFix[] = [];

  if (aiConfig.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: aiConfig.apiKey });
    await runAnthropicLoop(
      client,
      getModelForTask(aiConfig),
      userMessage,
      owner,
      repo,
      proposedFixes,
      scan.workspaceId,
    );
  } else {
    await runOpenAILoop(aiConfig, userMessage, owner, repo, proposedFixes, scan.workspaceId);
  }

  if (proposedFixes.length === 0) {
    return {
      proposedFixes: [],
      prUrl: null,
      manualActions,
      summary: "The agent could not generate automated fixes for the fixable checks in this scan.",
    };
  }

  const prUrl = await createFixPR(owner, repo, proposedFixes, scanId, manualActions);

  return {
    proposedFixes,
    prUrl,
    manualActions,
    summary: `Generated ${proposedFixes.length} fix${proposedFixes.length > 1 ? "es" : ""} addressing: ${proposedFixes.map((f) => f.checkKey).join(", ")}.${manualActions.length > 0 ? ` ${manualActions.length} confirmed issue(s) need manual action.` : ""}`,
  };
}

// PR-safe findings: config / static files / markup the fix-agent can land in a PR.
const MECHANICALLY_FIXABLE = new Set<string>([
  "csp_header", "hsts_header", "x_frame_options", "referrer_policy", "permissions_policy",
  "content_security_policy_nonce", "csp_frame_ancestors", "csp_report_directive",
  "cross_origin_opener_policy", "cross_origin_resource_policy", "cross_origin_embedder_policy",
  "security_txt", "has_robots_txt", "has_sitemap", "favicon", "pwa_manifest",
  "meta_title", "meta_description", "og_tags", "twitter_card", "canonical_url", "charset_utf8",
  "ccpa_do_not_sell", "accessibility_statement_eaa",
]);
