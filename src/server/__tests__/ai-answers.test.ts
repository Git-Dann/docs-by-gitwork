/**
 * Pulse → AI search buyer questions, server side: a failed answer is "couldn't ask", never
 * "not mentioned"; a run refuses to start with nothing to ask; only one runs at a time; the
 * weekly run only starts for saved configs, once a week.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ws: Record<string, unknown> = {};
const runs: Array<Record<string, unknown>> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(async () => ws),
      findMany: vi.fn(async () => (ws.aiAnswersConfig ? [{ id: "w1", aiAnswersConfig: ws.aiAnswersConfig }] : [])),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(ws, data)),
    },
    aiAnswerRun: {
      findFirst: vi.fn(async ({ where }: { where: { status?: string; startedAt?: { gt: Date } } }) => {
        const rows = runs
          .filter((r) => !where.status || r.status === where.status)
          .filter((r) => !where.startedAt || (r.startedAt as Date) > where.startedAt.gt)
          .sort((a, b) => (b.startedAt as Date).getTime() - (a.startedAt as Date).getTime());
        return rows[0] ?? null;
      }),
      findMany: vi.fn(async () => [...runs].sort((a, b) => (b.startedAt as Date).getTime() - (a.startedAt as Date).getTime())),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => runs.find((r) => r.id === where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `run${runs.length + 1}`, finishedAt: null, ...data };
        runs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = runs.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));
vi.mock("@/server/ai-usage", () => ({ recordAiUsage: vi.fn() }));

import {
  AnswerRunRefused,
  askOne,
  executeAnswerRun,
  getAiAnswersReport,
  startAnswerRun,
  startDueAnswerRuns,
} from "@/server/ai-answers";
import { geminiAnswer, perplexitySources } from "@/server/ai-answers-engines";
import { DEFAULT_AI_ANSWERS_CONFIG, serialiseAiAnswersConfig, type AnswerResult } from "@/lib/ai-answers";

const NOW = new Date("2026-11-02T10:00:00Z");
const q = DEFAULT_AI_ANSWERS_CONFIG.questions[0];

beforeEach(() => {
  for (const k of Object.keys(ws)) delete ws[k];
  Object.assign(ws, { aiAnswersConfig: null, anthropicApiKey: "sk-a", openaiApiKey: null, geminiApiKey: null, platformAiKeysAllowed: false });
  runs.length = 0;
});

describe("askOne", () => {
  it("a thrown error is 'couldn't ask' with a reason, never 'not mentioned'", async () => {
    const r = await askOne(async () => Promise.reject(Object.assign(new Error("slow down"), { status: 429 })), {
      question: q, engine: "claude", apiKey: "k", model: "m", config: DEFAULT_AI_ANSWERS_CONFIG, workspaceId: "w1",
    });
    expect(r).toMatchObject({ status: "error", named: false, cited: false });
    expect(r.error).toContain("Rate limited");
  });

  it("a refusal and an empty answer are not counted as answers", async () => {
    const base = { question: q, engine: "claude" as const, apiKey: "k", model: "m", config: DEFAULT_AI_ANSWERS_CONFIG, workspaceId: "w1" };
    const zero = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    expect((await askOne(async () => ({ status: "refused", text: "", sources: [], usage: zero }), base)).status).toBe("refused");
    expect((await askOne(async () => ({ status: "ok", text: "  ", sources: [], usage: zero }), base)).status).toBe("error");
  });

  it("judges a real answer", async () => {
    const r = await askOne(
      async () => ({
        status: "ok",
        text: "Gitwork in Salford builds MVPs.",
        sources: [{ url: "https://gitwork.co.uk/mvp", title: "MVP" }],
        usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
      }),
      { question: q, engine: "claude", apiKey: "k", model: "m", config: DEFAULT_AI_ANSWERS_CONFIG, workspaceId: "w1" },
    );
    expect(r).toMatchObject({ status: "ok", named: true, cited: true, ourSources: ["https://gitwork.co.uk/mvp"] });
  });
});

describe("startAnswerRun", () => {
  it("refuses when no assistant has a key, rather than recording a run of failures", async () => {
    ws.anthropicApiKey = null;
    await expect(startAnswerRun("w1", { trigger: "manual", now: NOW })).rejects.toBeInstanceOf(AnswerRunRefused);
    expect(runs).toHaveLength(0);
  });

  it("asks only the assistants that have a key", async () => {
    const { run } = await startAnswerRun("w1", { trigger: "manual", now: NOW });
    expect(run.engines).toEqual(["claude"]);
    expect(run.questions).toHaveLength(DEFAULT_AI_ANSWERS_CONFIG.questions.length);
  });

  it("only one run at a time", async () => {
    const a = await startAnswerRun("w1", { trigger: "manual", now: NOW });
    const b = await startAnswerRun("w1", { trigger: "manual", now: new Date(NOW.getTime() + 60_000) });
    expect(b.created).toBe(false);
    expect(b.run.id).toBe(a.run.id);
  });
});

describe("executeAnswerRun", () => {
  it("stores every answer, and a run where nothing could be asked is failed, not done", async () => {
    ws.aiAnswersConfig = serialiseAiAnswersConfig({ ...DEFAULT_AI_ANSWERS_CONFIG, questions: DEFAULT_AI_ANSWERS_CONFIG.questions.slice(0, 2) });
    const { run } = await startAnswerRun("w1", { trigger: "manual", now: NOW });
    const fail = vi.fn(async () => Promise.reject(new Error("boom")));
    await executeAnswerRun(run.id, { ask: { claude: fail, chatgpt: fail, perplexity: fail, gemini: fail } });
    const row = runs[0];
    expect(row.status).toBe("failed");
    expect((row.results as AnswerResult[]).every((r) => r.status === "error")).toBe(true);
    expect(row.results as AnswerResult[]).toHaveLength(2);
  });

  it("reports the latest and previous finished runs", async () => {
    ws.aiAnswersConfig = serialiseAiAnswersConfig({ ...DEFAULT_AI_ANSWERS_CONFIG, questions: DEFAULT_AI_ANSWERS_CONFIG.questions.slice(0, 1) });
    const ok = vi.fn(async () => ({ status: "ok" as const, text: "Gitwork.", sources: [], usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } }));
    const ask = { claude: ok, chatgpt: ok, perplexity: ok, gemini: ok };
    const first = await startAnswerRun("w1", { trigger: "manual", now: new Date(NOW.getTime() - 86_400_000) });
    await executeAnswerRun(first.run.id, { ask });
    const second = await startAnswerRun("w1", { trigger: "manual", now: NOW });
    await executeAnswerRun(second.run.id, { ask });
    const report = await getAiAnswersReport("w1", new Date(NOW.getTime() + 60_000));
    expect(report.latest?.id).toBe(second.run.id);
    expect(report.previous?.id).toBe(first.run.id);
    expect(report.running).toBeNull();
    expect(report.config.saved).toBe(true);
  });
});

describe("startDueAnswerRuns", () => {
  it("does nothing until the questions are saved", async () => {
    expect((await startDueAnswerRuns(NOW)).started).toBe(0);
  });

  it("starts once a week for a saved config, and not again within the week", async () => {
    ws.aiAnswersConfig = serialiseAiAnswersConfig(DEFAULT_AI_ANSWERS_CONFIG);
    expect((await startDueAnswerRuns(NOW)).started).toBe(1);
    // Mark it finished so "already running" isn't what stops the second.
    runs[0].status = "done";
    expect((await startDueAnswerRuns(new Date(NOW.getTime() + 3 * 86_400_000))).started).toBe(0);
  });
});

describe("engine parsing", () => {
  it("Perplexity: citations and search results, deduplicated", () => {
    expect(
      perplexitySources({ citations: ["https://gitwork.co.uk/"], search_results: [{ url: "https://gitwork.co.uk/", title: "Gitwork" }, { url: "https://clutch.co" }] }),
    ).toEqual([
      { url: "https://gitwork.co.uk/", title: null },
      { url: "https://clutch.co", title: null },
    ]);
  });

  it("Gemini: grounding chunks are sources; a safety stop is a refusal", () => {
    expect(
      geminiAnswer({
        candidates: [{ content: { parts: [{ text: "A " }, { text: "B" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://r/1", title: "gitwork.co.uk" } }] } }],
      }),
    ).toEqual({ status: "ok", text: "A B", sources: [{ url: "https://r/1", title: "gitwork.co.uk" }] });
    expect(geminiAnswer({ candidates: [{ finishReason: "SAFETY" }] }).status).toBe("refused");
  });
});
