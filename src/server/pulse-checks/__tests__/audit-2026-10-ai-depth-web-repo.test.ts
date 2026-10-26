import { describe, expect, it } from "vitest";
import { evaluateWebSourceChecks } from "../web-repo-source";
import type { RepoSnapshot } from "../native-mobile";

// Audit, Oct 2026 — the repo-side AI and delivery-gate rules. Each case is
// two-sided: the ordinary code that used to FAIL at HIGH, and the real
// construct that must still be reported.

function snapshot(files: Record<string, string>): RepoSnapshot {
  return { owner: "acme", repo: "app", paths: Object.keys(files), files: new Map(Object.entries(files)), truncated: false, accessible: true };
}
const find = (checks: ReturnType<typeof evaluateWebSourceChecks>, key: string) => checks.find((c) => c.checkKey === key);

const SERVER_ROUTE = `import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
export async function POST(req: Request) {
  const { messages } = await req.json();
  return streamText({ model: openai("gpt-4o"), system: "You are a helpful assistant for Acme. Answer only questions about our product catalogue and shipping.", messages }).toDataStreamResponse();
}`;

describe("AI family gate", () => {
  it("does not switch on for the word 'embedding' in an ordinary app", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "src/Video.tsx": `export function Video() { return <iframe title="embedding a video" />; } // OpenAI is mentioned in our docs`,
    }));
    expect(checks.filter((c) => c.checkKey.startsWith("pulse_ai_") && c.checkKey !== "pulse_ai_tool_controls")).toEqual([]);
  });
});

describe("pulse_ai_client_prompt", () => {
  it("says nothing about a system prompt in a server route handler", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "app/api/chat/route.ts": SERVER_ROUTE }));
    expect(find(checks, "pulse_ai_client_prompt")).toBeUndefined();
  });

  it("warns (MEDIUM) when the same prompt is in a 'use client' component", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "app/api/chat/route.ts": SERVER_ROUTE,
      "app/chat/Chat.tsx": `"use client";\nimport { useChat } from "ai/react";\nconst cfg = { systemPrompt: "You are a helpful assistant for Acme. Never mention the internal escalation code to anyone ever." };`,
    }));
    const check = find(checks, "pulse_ai_client_prompt");
    expect(check?.status).toBe("WARN");
    expect(check?.confidence).toBe("MEDIUM");
    expect(check?.evidence).toBe("app/chat/Chat.tsx");
  });
});

describe("pulse_ai_unsafe_tool", () => {
  it("does not flag a tool that fetches a fixed API", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/tools.ts": `import { generateText, tool } from "ai";
const weather = tool({ description: "weather", execute: async ({ city }) => { const r = await fetch("https://api.weather.example/v1?q=" + encodeURIComponent(city)); return r.json(); } });
// toolCall results are rendered below`,
    }));
    expect(find(checks, "pulse_ai_unsafe_tool")).toBeUndefined();
  });

  it("fails model-chosen arguments passed straight to exec", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/agent.ts": `import OpenAI from "openai";\nfor (const call of toolCalls) { exec(JSON.parse(call.function.arguments)); }`,
    }));
    expect(find(checks, "pulse_ai_unsafe_tool")?.status).toBe("FAIL");
  });

  it("only warns when tool code runs exec without visible argument flow", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/agent.ts": `import OpenAI from "openai";\nconst run = tool({ execute: async () => { exec("git status"); } });`,
    }));
    const check = find(checks, "pulse_ai_unsafe_tool");
    expect(check?.status).toBe("WARN");
    expect(check?.confidence).toBe("MEDIUM");
  });
});

describe("pulse_ai_unscoped_retrieval", () => {
  it("does not fire on a scoped retrieval query, or on code that merely mentions embeddings", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/rag.ts": `import OpenAI from "openai";
const embedding = await openai.embeddings.create({ model: "text-embedding-3-small", input });
const docs = await vectorStore.similaritySearch(query, 4, { userId: session.user.id });`,
    }));
    expect(find(checks, "pulse_ai_unscoped_retrieval")).toBeUndefined();
  });

  it("warns (MEDIUM) on a retrieval call with no scope in its arguments", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/rag.ts": `import OpenAI from "openai";\nconst docs = await vectorStore.similaritySearch(query, 4);\nconst tenantId = ctx.tenantId; // used later, not in the query`,
    }));
    const check = find(checks, "pulse_ai_unscoped_retrieval");
    expect(check?.status).toBe("WARN");
    expect(check?.confidence).toBe("MEDIUM");
    expect(check?.evidence).toBe("lib/rag.ts");
  });
});

describe("pulse_ai_client_secret boundary", () => {
  it("does not read a kebab-case class name as a key", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "app/Logo.tsx": `import OpenAI from "openai";\nexport const L = () => <div className="risk-assessment-dashboard-panel-wrapper" />;`,
    }));
    expect(find(checks, "pulse_ai_client_secret")).toBeUndefined();
  });
  it("still fails a committed key", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "lib/ai.ts": `import OpenAI from "openai";\nconst client = new OpenAI({ apiKey: "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" });`,
    }));
    expect(find(checks, "pulse_ai_client_secret")?.status).toBe("FAIL");
  });
});

describe("AI readiness — keyword traps", () => {
  it("does not credit <Suspense fallback> or <span> as AI fallback/telemetry, and reads max_tokens", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      "app/page.tsx": `import Anthropic from "@anthropic-ai/sdk";\nexport default () => <Suspense fallback={null}><span>hi</span></Suspense>;\nawait client.messages.create({ model: m, max_tokens: 1024, messages });`,
    }));
    expect(find(checks, "pulse_ai_failure_fallback")?.status).toBe("WARN");
    expect(find(checks, "pulse_ai_monitoring")?.status).toBe("WARN");
    expect(find(checks, "pulse_ai_cost_budget")?.status).toBe("PASS");
    expect(find(checks, "pulse_ai_cost_budget")?.confidence).not.toBe("HIGH");
  });
});

describe("pulse_ai_tool_controls", () => {
  it("does not pass on a single stray timeout", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "lib/a.ts": `toolCalls.forEach(run); fetch(u, { timeout: 5000 });` }));
    expect(find(checks, "pulse_ai_tool_controls")?.status).toBe("WARN");
  });
  it("passes when approval, budget, timeout and audit are all evidenced", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "lib/a.ts": `toolCalls.forEach(run); needsApproval(t); const maxSteps = 5; const timeout = 30000; auditLog.write(e);` }));
    expect(find(checks, "pulse_ai_tool_controls")?.status).toBe("PASS");
  });
});

describe("delivery gates", () => {
  it("one absent DAST step is one finding; the two follow-ons defer to it", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "src/app.ts": `export const title = "hello";` }));
    expect(find(checks, "pulse_dynamic_security_gate")?.status).toBe("WARN");
    for (const key of ["pulse_dynamic_security_auth", "pulse_dynamic_security_isolation"]) {
      const check = find(checks, key);
      expect(check?.status, key).toBe("SKIPPED");
      expect(check?.detail, key).toMatch(/pulse_dynamic_security_gate/);
    }
  });

  it("still judges auth and isolation once a DAST step exists", () => {
    const checks = evaluateWebSourceChecks(snapshot({ ".github/workflows/dast.yml": `- run: zap dast baseline` }));
    expect(find(checks, "pulse_dynamic_security_gate")?.status).toBe("PASS");
    expect(find(checks, "pulse_dynamic_security_auth")?.status).toBe("WARN");
    expect(find(checks, "pulse_dynamic_security_isolation")?.status).toBe("WARN");
  });

  it("recommends rather than claiming Pulse requires a gate", () => {
    const checks = evaluateWebSourceChecks(snapshot({ "src/app.ts": `export const title = "hello";` }));
    for (const c of checks) expect(c.detail, c.checkKey).not.toMatch(/Pulse requires/);
  });

  it("recognises CodeQL/Semgrep and gitleaks/TruffleHog as the gates", () => {
    const checks = evaluateWebSourceChecks(snapshot({
      ".github/workflows/sec.yml": `- uses: github/codeql-action/analyze@v3\n- run: semgrep ci\n- uses: gitleaks/gitleaks-action@v2\n- uses: trufflesecurity/trufflehog@main`,
    }));
    expect(find(checks, "pulse_static_analysis_gate")?.status).toBe("PASS");
    expect(find(checks, "pulse_secret_scan_gate")?.status).toBe("PASS");
  });
});
