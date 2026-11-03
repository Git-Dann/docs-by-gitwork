import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AI_ENGINES,
  AUTO_RUN_EVERY_DAYS,
  RUN_TIMEOUT_MINUTES,
  effectiveRunStatus,
  excerptOf,
  judgeAnswer,
  nextAutoRunAt,
  parseAiAnswersConfig,
  serialiseAiAnswersConfig,
  type AiAnswersConfig,
  type AiAnswersReport,
  type AiEngineId,
  type AnswerResult,
  type AnswerRun,
  type BuyerQuestion,
  type EngineAvailability,
  type RunStatus,
} from "@/lib/ai-answers";
import { aiKeyFor, type WorkspaceAiKeys } from "@/server/ai-keys";
import { AI_ANSWER_MODELS } from "@/server/ai-provider";
import { recordAiUsage } from "@/server/ai-usage";
import { ASK, ENGINE_PROVIDER, EngineHttpError, type AskArgs, type EngineAnswer } from "@/server/ai-answers-engines";

/**
 * Pulse → AI search: buyer questions. Puts each saved question to each AI assistant that has a
 * key, keeps every answer, and judges each one on whether it names or cites Gitwork.
 *
 * Runs are on demand ("Ask now", admins) and weekly once the questions have been saved,
 * from the every-minute jobs worker, so there is no crontab line to forget. A run is stored
 * as it goes, so the page can show progress and a run cut short by a restart still keeps
 * the answers it got (and says it was cut short).
 */

/** How many answers are asked at once. Enough to finish a run in a few minutes. */
const CONCURRENCY = 4;
/** Write progress back to the run after this many new answers. */
const SAVE_EVERY = 4;

type AnswersWorkspace = WorkspaceAiKeys & { aiAnswersConfig: Prisma.JsonValue | null };

async function loadWorkspace(workspaceId: string): Promise<AnswersWorkspace | null> {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      aiAnswersConfig: true,
      anthropicApiKey: true,
      openaiApiKey: true,
      geminiApiKey: true,
      platformAiKeysAllowed: true,
    },
  });
}

const KEY_NAME: Record<AiEngineId, string> = {
  claude: "an Anthropic key",
  chatgpt: "an OpenAI key",
  perplexity: "a Perplexity key (PERPLEXITY_API_KEY on the server)",
  gemini: "a Gemini key",
};

export function engineAvailability(ws: AnswersWorkspace | null, config: AiAnswersConfig): EngineAvailability[] {
  return AI_ENGINES.map(({ id, label }) => {
    const enabled = config.engines.includes(id);
    const key = ws ? aiKeyFor(ENGINE_PROVIDER[id], ws, "workspace") : null;
    return {
      engine: id,
      label,
      enabled,
      available: enabled && !!key,
      model: AI_ANSWER_MODELS[id],
      reason: !enabled ? "Switched off in Setup." : key ? null : `Needs ${KEY_NAME[id]}. Add one in Settings → Integrations.`,
    };
  });
}

function toRun(row: {
  id: string;
  status: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  questions: Prisma.JsonValue;
  engines: Prisma.JsonValue;
  results: Prisma.JsonValue;
}): AnswerRun {
  return {
    id: row.id,
    status: (["running", "done", "failed"].includes(row.status) ? row.status : "failed") as RunStatus,
    trigger: row.trigger === "weekly" ? "weekly" : "manual",
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    questions: Array.isArray(row.questions) ? (row.questions as unknown as BuyerQuestion[]) : [],
    engines: Array.isArray(row.engines) ? (row.engines as unknown as AiEngineId[]) : [],
    results: Array.isArray(row.results) ? (row.results as unknown as AnswerResult[]) : [],
  };
}

const RUN_SELECT = {
  id: true,
  status: true,
  trigger: true,
  startedAt: true,
  finishedAt: true,
  questions: true,
  engines: true,
  results: true,
} as const satisfies Prisma.AiAnswerRunSelect;

export async function getAiAnswersReport(workspaceId: string, now = new Date()): Promise<AiAnswersReport> {
  const [ws, rows] = await Promise.all([
    loadWorkspace(workspaceId),
    prisma.aiAnswerRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: "desc" },
      take: 6,
      select: RUN_SELECT,
    }),
  ]);
  const config = parseAiAnswersConfig(ws?.aiAnswersConfig);
  const runs = rows.map(toRun).map((r) => ({ ...r, status: effectiveRunStatus(r, now) }));
  const running = runs.find((r) => r.status === "running") ?? null;
  // Interrupted runs are shown (with what they got) but not used as the comparison baseline
  // unless nothing better exists.
  const finished = runs.filter((r) => r.status !== "running" && r.results.length > 0);
  const latest = finished[0] ?? null;
  const previous = finished[1] ?? null;
  return {
    config,
    engines: engineAvailability(ws, config),
    latest,
    previous,
    running,
    nextAutoRunAt: nextAutoRunAt(config, runs[0]?.startedAt ?? null, now),
  };
}

export async function setAiAnswersConfig(workspaceId: string, config: AiAnswersConfig): Promise<AiAnswersConfig> {
  const stored = serialiseAiAnswersConfig(config);
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { aiAnswersConfig: stored as unknown as Prisma.InputJsonValue },
  });
  return parseAiAnswersConfig(stored);
}

export class AnswerRunRefused extends Error {
  readonly status = 400;
}

/**
 * Create a run, or return the one already running. Throws (400) when there is nothing to ask
 * or no assistant to ask it of. The caller then runs `executeAnswerRun` in the background.
 */
export async function startAnswerRun(
  workspaceId: string,
  opts: { trigger: "manual" | "weekly"; startedById?: string | null; now?: Date },
): Promise<{ run: AnswerRun; created: boolean }> {
  const now = opts.now ?? new Date();
  const ws = await loadWorkspace(workspaceId);
  const config = parseAiAnswersConfig(ws?.aiAnswersConfig);
  const existing = await prisma.aiAnswerRun.findFirst({
    where: { workspaceId, status: "running", startedAt: { gt: new Date(now.getTime() - RUN_TIMEOUT_MINUTES * 60_000) } },
    orderBy: { startedAt: "desc" },
    select: RUN_SELECT,
  });
  if (existing) return { run: toRun(existing), created: false };
  if (!config.questions.length) throw new AnswerRunRefused("There are no buyer questions to ask. Add some in Setup.");
  const engines = engineAvailability(ws, config).filter((e) => e.available).map((e) => e.engine);
  if (!engines.length) {
    throw new AnswerRunRefused("No AI assistant can be asked: each needs its API key. Add one in Settings → Integrations.");
  }
  const row = await prisma.aiAnswerRun.create({
    data: {
      workspaceId,
      status: "running",
      trigger: opts.trigger,
      startedById: opts.startedById ?? null,
      startedAt: now,
      questions: config.questions as unknown as Prisma.InputJsonValue,
      engines: engines as unknown as Prisma.InputJsonValue,
      results: [],
    },
    select: RUN_SELECT,
  });
  return { run: toRun(row), created: true };
}

function failureMessage(err: unknown): string {
  if (err instanceof EngineHttpError || (err as { status?: unknown })?.status) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return "The API key was refused.";
    if (status === 429) return "Rate limited by the provider. It will be asked again next run.";
  }
  const name = (err as { name?: string })?.name;
  if (name === "AbortError" || name === "TimeoutError") return "The assistant took too long to answer.";
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 240 ? `${msg.slice(0, 237)}…` : msg;
}

/** Ask one question of one engine and judge the answer. Never throws. */
export async function askOne(
  ask: (args: AskArgs) => Promise<EngineAnswer>,
  input: { question: BuyerQuestion; engine: AiEngineId; apiKey: string; model: string; config: AiAnswersConfig; workspaceId: string; now?: () => Date },
): Promise<AnswerResult> {
  const now = input.now ?? (() => new Date());
  const base = { questionId: input.question.id, question: input.question.text, engine: input.engine, model: input.model };
  const started = Date.now();
  try {
    const answer = await ask({ question: input.question.text, apiKey: input.apiKey, model: input.model, signal: AbortSignal.timeout(150_000) });
    recordAiUsage({
      module: "PULSE",
      workspaceId: input.workspaceId,
      operation: `ai_search.answers.${input.engine}`,
      provider: ENGINE_PROVIDER[input.engine],
      model: input.model,
      usage: answer.usage,
      latencyMs: Date.now() - started,
    });
    if (answer.status === "refused" || !answer.text.trim()) {
      return {
        ...base,
        status: answer.status === "refused" ? "refused" : "error",
        named: false,
        cited: false,
        ourSources: [],
        sources: answer.sources,
        excerpt: "",
        error: answer.status === "refused" ? "The assistant declined to answer." : "The assistant returned no text.",
        askedAt: now().toISOString(),
      };
    }
    const verdict = judgeAnswer(answer, input.config);
    return {
      ...base,
      status: "ok",
      named: verdict.named,
      cited: verdict.cited,
      ourSources: verdict.ourSources,
      sources: answer.sources,
      excerpt: excerptOf(answer.text, input.config.brandNames),
      error: null,
      askedAt: now().toISOString(),
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      named: false,
      cited: false,
      ourSources: [],
      sources: [],
      excerpt: "",
      error: failureMessage(err),
      askedAt: now().toISOString(),
    };
  }
}

/** Run every question × engine for a created run, saving as it goes. Never throws. */
export async function executeAnswerRun(runId: string, deps: { ask?: typeof ASK } = {}): Promise<void> {
  const ask = deps.ask ?? ASK;
  const row = await prisma.aiAnswerRun.findUnique({ where: { id: runId }, select: { ...RUN_SELECT, workspaceId: true } });
  if (!row || row.status !== "running") return;
  const run = toRun(row);
  const ws = await loadWorkspace(row.workspaceId);
  const config = parseAiAnswersConfig(ws?.aiAnswersConfig);
  const tasks = run.questions.flatMap((question) =>
    run.engines.map((engine) => ({ question, engine, apiKey: ws ? aiKeyFor(ENGINE_PROVIDER[engine], ws, "workspace") : null })),
  );
  const results: AnswerResult[] = [];
  let unsaved = 0;
  const save = (status: "running" | "done" | "failed") =>
    prisma.aiAnswerRun.update({
      where: { id: runId },
      data: {
        status,
        results: results as unknown as Prisma.InputJsonValue,
        ...(status === "running" ? {} : { finishedAt: new Date() }),
      },
    });
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const t = tasks[next++];
      const model = AI_ANSWER_MODELS[t.engine];
      const result = t.apiKey
        ? await askOne(ask[t.engine], { question: t.question, engine: t.engine, apiKey: t.apiKey, model, config, workspaceId: row.workspaceId })
        : {
            questionId: t.question.id,
            question: t.question.text,
            engine: t.engine,
            model,
            status: "error" as const,
            named: false,
            cited: false,
            ourSources: [],
            sources: [],
            excerpt: "",
            error: "The API key was removed during the run.",
            askedAt: new Date().toISOString(),
          };
      results.push(result);
      unsaved += 1;
      if (unsaved >= SAVE_EVERY) {
        unsaved = 0;
        await save("running").catch((err) => console.error("[ai-answers] progress save failed", err));
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
    await save(results.some((r) => r.status === "ok") ? "done" : "failed");
  } catch (err) {
    console.error("[ai-answers] run failed", { runId, err });
    await save("failed").catch(() => undefined);
  }
}

/**
 * From the jobs worker: start a weekly run for each workspace that saved its questions, has
 * weekly asking on, and hasn't been asked in AUTO_RUN_EVERY_DAYS. Starts the run and returns
 * without waiting for it (a run takes minutes; the next tick sees it as running).
 */
export async function startDueAnswerRuns(now = new Date()): Promise<{ started: number }> {
  const workspaces = await prisma.workspace.findMany({
    where: { aiAnswersConfig: { not: Prisma.DbNull } },
    select: { id: true, aiAnswersConfig: true },
  });
  let started = 0;
  for (const ws of workspaces) {
    const config = parseAiAnswersConfig(ws.aiAnswersConfig);
    if (!config.autoWeekly || !config.questions.length) continue;
    const last = await prisma.aiAnswerRun.findFirst({
      where: { workspaceId: ws.id },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (last && now.getTime() - last.startedAt.getTime() < AUTO_RUN_EVERY_DAYS * 86_400_000) continue;
    try {
      const { run, created } = await startAnswerRun(ws.id, { trigger: "weekly", now });
      if (created) {
        started += 1;
        void executeAnswerRun(run.id);
      }
    } catch (err) {
      // Nothing to ask, or no keys: not an error worth failing the worker for.
      if (!(err instanceof AnswerRunRefused)) console.error("[ai-answers] weekly start failed", { workspaceId: ws.id, err });
    }
  }
  return { started };
}

