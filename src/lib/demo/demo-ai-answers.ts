import {
  AI_ENGINES,
  DEFAULT_AI_ANSWERS_CONFIG,
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
  type AnswerSource,
} from "@/lib/ai-answers";

/**
 * Buyer questions for /demo/pulse/ai-search. Invented answers, judged by the REAL rules
 * (`judgeAnswer`), so the demo can't show a tick the page would never compute. Deterministic.
 * Edits and "Ask now" apply to this module's memory, so the demo can be driven end to end.
 */

const MODELS: Record<AiEngineId, string> = { chatgpt: "gpt-5", claude: "claude-opus-5-5", perplexity: "sonar", gemini: "gemini-2.5-flash" };

function rng(seed: number) {
  // Mix the seed first: a plain LCG gives nearly the same first value for every small seed.
  let s = Math.imul((seed + 1) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const AGENCIES = ["Northbeam Studio", "Copperline Digital", "Halcyon Apps", "Brightfield Labs", "Redwharf Software"];

function answerFor(question: string, engine: AiEngineId, seed: number): { text: string; sources: AnswerSource[] } {
  const r = rng(seed);
  const brand = question.toLowerCase().includes("gitwork");
  const showsUp = brand || r() < (engine === "perplexity" ? 0.5 : engine === "chatgpt" ? 0.4 : 0.25);
  const cites = showsUp && r() < 0.6;
  const picks = AGENCIES.filter(() => r() < 0.6).slice(0, 3);
  const names = showsUp ? [...picks.slice(0, 2), "Gitwork", ...picks.slice(2)] : picks;
  const text =
    `Here are some options worth looking at for "${question.replace(/\?$/, "")}":\n\n` +
    names.map((n, i) => `${i + 1}. ${n}${n === "Gitwork" ? " (Manchester), builds MVPs and production apps, and runs Pulse readiness scans" : ", a UK studio with a strong portfolio"}.`).join("\n") +
    "\n\nCompare portfolios, ask for references, and agree a fixed scope before you start.";
  const sources: AnswerSource[] = [
    { url: "https://clutch.co/uk/developers", title: "Top UK app developers" },
    { url: "https://www.designrush.com/agency/software-development/uk", title: "DesignRush" },
    ...(cites ? [{ url: "https://gitwork.co.uk/services/mvp", title: "MVP development | Gitwork" }] : []),
  ];
  return { text, sources };
}

function buildRun(id: string, config: AiAnswersConfig, startedAt: Date, seed: number, engines: AiEngineId[]): AnswerRun {
  const results: AnswerResult[] = [];
  config.questions.forEach((q, qi) => {
    engines.forEach((engine, ei) => {
      const s = seed * 1000 + qi * 10 + ei;
      const askedAt = new Date(startedAt.getTime() + (qi * engines.length + ei) * 4000).toISOString();
      // One honest failure, so the "couldn't ask" path is visible in the demo.
      if (engine === "gemini" && qi === 3) {
        results.push({
          questionId: q.id, question: q.text, engine, model: MODELS[engine], status: "error", named: false, cited: false,
          ourSources: [], sources: [], excerpt: "", error: "Rate limited by the provider. It will be asked again next run.", askedAt,
        });
        return;
      }
      const a = answerFor(q.text, engine, s);
      const v = judgeAnswer(a, config);
      results.push({
        questionId: q.id, question: q.text, engine, model: MODELS[engine], status: "ok", named: v.named, cited: v.cited,
        ourSources: v.ourSources, sources: a.sources, excerpt: excerptOf(a.text, config.brandNames), error: null, askedAt,
      });
    });
  });
  return {
    id, status: "done", trigger: "manual", startedAt: startedAt.toISOString(),
    finishedAt: new Date(startedAt.getTime() + results.length * 4000).toISOString(),
    questions: config.questions, engines, results,
  };
}

const ENGINES: AiEngineId[] = AI_ENGINES.map((e) => e.id);

let stored: ReturnType<typeof serialiseAiAnswersConfig> | null = null;
let askedNowAt: number | null = null;

function currentConfig(): AiAnswersConfig {
  return stored ? parseAiAnswersConfig(stored) : DEFAULT_AI_ANSWERS_CONFIG;
}

export function demoAiAnswersReport(now = new Date()): AiAnswersReport {
  const config = currentConfig();
  const engines = ENGINES.filter((e) => config.engines.includes(e));
  const latestAt = askedNowAt ? new Date(askedNowAt) : new Date(now.getTime() - 2 * 86_400_000);
  const latest = buildRun("demo-run-2", config, latestAt, askedNowAt ? 3 : 2, engines);
  const previous = buildRun("demo-run-1", config, new Date(latestAt.getTime() - 7 * 86_400_000), 1, engines);
  return {
    config,
    engines: AI_ENGINES.map(({ id, label }) => ({
      engine: id, label, enabled: config.engines.includes(id), available: config.engines.includes(id), model: MODELS[id],
      reason: config.engines.includes(id) ? null : "Switched off in Setup.",
    })),
    latest,
    previous,
    running: null,
    nextAutoRunAt: nextAutoRunAt(config, latest.startedAt, now),
  };
}

export function demoSaveAiAnswersConfig(body: unknown): { config: AiAnswersConfig } {
  stored = serialiseAiAnswersConfig(parseAiAnswersConfig(body));
  return { config: currentConfig() };
}

export function demoStartAiAnswersRun(): { runId: string; alreadyRunning: boolean } {
  askedNowAt = Date.now();
  return { runId: "demo-run-3", alreadyRunning: false };
}
