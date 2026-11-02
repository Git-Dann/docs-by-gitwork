/**
 * Pulse → AI search, part two: what AI assistants say when a buyer asks them a question.
 *
 * A fixed list of buyer questions is put to each AI engine (with its web search on), and each
 * answer is judged on two facts that can be checked by reading it:
 *  - it NAMES Gitwork: one of the brand names appears as a whole word in the answer text;
 *  - it CITES Gitwork: one of its sources is a page on one of our domains (matched by host,
 *    never by substring, so `notgitwork.co.uk` is not us).
 *
 * Everything here is pure, so the page, the server and the demo can't disagree.
 *
 * Truth rules:
 *  - A failed or refused answer is "couldn't ask", never "didn't mention us". It is left out
 *    of both sides of every figure and counted on its own.
 *  - The answer text and sources are kept, so every tick can be checked by reading it.
 *  - AI answers vary between askings. Each run asks each question once per engine; the page
 *    says so rather than presenting one sample as a fixed fact.
 */

export const AI_ENGINES = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "perplexity", label: "Perplexity" },
  { id: "gemini", label: "Gemini" },
] as const;
export type AiEngineId = (typeof AI_ENGINES)[number]["id"];
export const AI_ENGINE_IDS: readonly AiEngineId[] = AI_ENGINES.map((e) => e.id);

export function engineLabel(id: AiEngineId): string {
  return AI_ENGINES.find((e) => e.id === id)?.label ?? id;
}

export function isAiEngineId(v: unknown): v is AiEngineId {
  return typeof v === "string" && (AI_ENGINE_IDS as readonly string[]).includes(v);
}

/** Questions a buyer of Gitwork's work would actually type, UK-first. Edit them in Setup. */
export const EXAMPLE_BUYER_QUESTIONS: readonly string[] = [
  "Who are the best software development agencies in Manchester?",
  "Which UK agency can build an MVP for my startup quickly?",
  "What are the best app development companies in the UK for startups?",
  "Who can turn an app I built with AI tools into a production-ready product?",
  "Which UK agencies help businesses add AI to their software?",
  "Where can a UK company hire dedicated React or Flutter developers?",
  "Which development partners do UK businesses use for offshore or nearshore developers?",
  "How can I check whether my app is ready to launch?",
  "Which agency can rescue a software project that is going badly?",
  "Who builds software for caravan, motorhome and holiday park businesses?",
  "What are the best fractional CTO services in the UK?",
  "What is Gitwork and what do they do?",
];

/** Limits shared by the editor, the validator and the server. */
export const AI_ANSWER_LIMITS = {
  maxQuestions: 30,
  maxQuestionLength: 300,
  maxBrandNames: 8,
  maxDomains: 8,
  /** How much of each answer is kept to read back. */
  excerptChars: 1500,
  maxCitations: 20,
} as const;

/** How often answers are asked again on their own, once the questions have been saved. */
export const AUTO_RUN_EVERY_DAYS = 7;
/** A run still marked as running after this long died part-way (a restart) and is shown as such. */
export const RUN_TIMEOUT_MINUTES = 30;

export interface BuyerQuestion {
  /** Stable id from the text, so a run can be compared with an earlier one question by question. */
  id: string;
  text: string;
}

export interface AiAnswersConfig {
  questions: BuyerQuestion[];
  brandNames: string[];
  domains: string[];
  engines: AiEngineId[];
  /** Ask again every AUTO_RUN_EVERY_DAYS. Only applies once the config has been saved. */
  autoWeekly: boolean;
  /** False while these are the built-in examples nobody has saved yet. */
  saved: boolean;
}

/** FNV-1a over the normalised text: the same question always gets the same id. */
export function questionId(text: string): string {
  const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i += 1) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `q${h.toString(36)}`;
}

export function toQuestions(texts: readonly string[]): BuyerQuestion[] {
  const seen = new Set<string>();
  const out: BuyerQuestion[] = [];
  for (const raw of texts) {
    const text = raw.trim().replace(/\s+/g, " ").slice(0, AI_ANSWER_LIMITS.maxQuestionLength);
    if (!text) continue;
    const id = questionId(text);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text });
    if (out.length >= AI_ANSWER_LIMITS.maxQuestions) break;
  }
  return out;
}

export const DEFAULT_AI_ANSWERS_CONFIG: AiAnswersConfig = {
  questions: toQuestions(EXAMPLE_BUYER_QUESTIONS),
  brandNames: ["Gitwork"],
  domains: ["gitwork.co.uk"],
  engines: [...AI_ENGINE_IDS],
  autoWeekly: true,
  saved: false,
};

/** A domain as typed (`https://www.gitwork.co.uk/x`) → `gitwork.co.uk`. Null when it isn't one. */
export function normaliseDomain(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(v) ? v : null;
}

/** A brand name: 2–60 visible characters. */
export function normaliseBrandName(input: string): string | null {
  const v = input.trim().replace(/\s+/g, " ");
  return v.length >= 2 && v.length <= 60 ? v : null;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** A stored config read defensively. Nothing stored means the built-in examples. */
export function parseAiAnswersConfig(raw: unknown): AiAnswersConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_AI_ANSWERS_CONFIG;
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const brandNames = uniq(strings(r.brandNames).map(normaliseBrandName).filter((x): x is string => !!x)).slice(
    0,
    AI_ANSWER_LIMITS.maxBrandNames,
  );
  const domains = uniq(strings(r.domains).map(normaliseDomain).filter((x): x is string => !!x)).slice(0, AI_ANSWER_LIMITS.maxDomains);
  const engines = Array.isArray(r.engines) ? uniq(r.engines.filter(isAiEngineId)) : [...AI_ENGINE_IDS];
  return {
    questions: toQuestions(strings(r.questions)),
    brandNames: brandNames.length ? brandNames : DEFAULT_AI_ANSWERS_CONFIG.brandNames,
    domains: domains.length ? domains : DEFAULT_AI_ANSWERS_CONFIG.domains,
    engines,
    autoWeekly: r.autoWeekly !== false,
    saved: true,
  };
}

/** What is stored: question TEXTS (ids are derived), never `saved`. */
export function serialiseAiAnswersConfig(c: AiAnswersConfig) {
  return {
    questions: c.questions.map((q) => q.text),
    brandNames: c.brandNames,
    domains: c.domains,
    engines: c.engines,
    autoWeekly: c.autoWeekly,
  };
}

// ─── Judging an answer ────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A brand name as a whole word, any case. "Gitwork's" counts; "Gitworks" and "notgitwork" don't. */
export function mentionsBrand(text: string, names: readonly string[]): boolean {
  return names.some((name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "iu").test(text));
}

export function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The host is one of ours, or a subdomain of one. Never a substring match. */
export function isOurHost(host: string | null, domains: readonly string[]): boolean {
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface AnswerSource {
  url: string;
  title: string | null;
}

/**
 * A source belongs to us when its URL's host is ours. Gemini's grounding links go through a
 * Google redirect and carry the site's domain as their title, so a title that is exactly a
 * domain is read as that domain too — and nothing looser than that.
 */
export function sourceIsOurs(source: AnswerSource, domains: readonly string[]): boolean {
  if (isOurHost(hostOfUrl(source.url), domains)) return true;
  const title = source.title ? normaliseDomain(source.title) : null;
  return !!title && title === source.title?.trim().toLowerCase().replace(/^www\./, "") && isOurHost(title, domains);
}

/** Links written into the answer itself (markdown or bare), which some engines use instead of citations. */
export function linksInText(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>()\]"'`]+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, ""));
}

export function judgeAnswer(
  answer: { text: string; sources: readonly AnswerSource[] },
  config: Pick<AiAnswersConfig, "brandNames" | "domains">,
): { named: boolean; cited: boolean; ourSources: string[] } {
  const all: AnswerSource[] = [...answer.sources, ...linksInText(answer.text).map((url) => ({ url, title: null }))];
  const ourSources = uniq(all.filter((s) => sourceIsOurs(s, config.domains)).map((s) => s.url));
  return { named: mentionsBrand(answer.text, config.brandNames), cited: ourSources.length > 0, ourSources };
}

/** The part of the answer worth reading back: around the first mention, else the opening. */
export function excerptOf(text: string, names: readonly string[], max: number = AI_ANSWER_LIMITS.excerptChars): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  let at = -1;
  for (const name of names) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "iu").exec(clean);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  if (at < 0 || at < max / 2) return `${clean.slice(0, max - 1).trimEnd()}…`;
  const start = Math.max(0, at - Math.floor(max / 3));
  return `…${clean.slice(start, start + max - 2).trim()}…`;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export type AnswerStatus = "ok" | "error" | "refused";

export interface AnswerResult {
  questionId: string;
  question: string;
  engine: AiEngineId;
  model: string;
  status: AnswerStatus;
  named: boolean;
  cited: boolean;
  /** Our pages among the sources. */
  ourSources: string[];
  /** Every source the engine gave, capped. */
  sources: AnswerSource[];
  excerpt: string;
  /** Why it couldn't be asked, when it couldn't. */
  error: string | null;
  askedAt: string;
}

export type RunStatus = "running" | "done" | "failed" | "interrupted";

export interface AnswerRun {
  id: string;
  status: RunStatus;
  trigger: "manual" | "weekly";
  startedAt: string;
  finishedAt: string | null;
  /** The questions and engines this run set out to ask. */
  questions: BuyerQuestion[];
  engines: AiEngineId[];
  results: AnswerResult[];
}

/** A run left "running" past RUN_TIMEOUT_MINUTES didn't finish (the server restarted). */
export function effectiveRunStatus(run: Pick<AnswerRun, "status" | "startedAt">, now: Date): RunStatus {
  if (run.status !== "running") return run.status;
  return now.getTime() - Date.parse(run.startedAt) > RUN_TIMEOUT_MINUTES * 60_000 ? "interrupted" : "running";
}

export interface EngineSummary {
  engine: AiEngineId;
  answered: number;
  namedOrCited: number;
  named: number;
  cited: number;
  failed: number;
}

export interface RunSummary {
  /** Questions with at least one answer that could be read. */
  questionsAnswered: number;
  /** Of those, questions where at least one engine named or cited us. */
  questionsShownUp: number;
  /** Answers that could be read. */
  answers: number;
  answersNamedOrCited: number;
  answersNamed: number;
  answersCited: number;
  /** Answers that couldn't be asked (errors and refusals). Not in any other figure. */
  failed: number;
  byEngine: EngineSummary[];
}

export function summariseRun(results: readonly AnswerResult[]): RunSummary {
  const ok = results.filter((r) => r.status === "ok");
  const byQuestion = new Map<string, boolean>();
  for (const r of ok) byQuestion.set(r.questionId, (byQuestion.get(r.questionId) ?? false) || r.named || r.cited);
  const engines = uniq(results.map((r) => r.engine));
  return {
    questionsAnswered: byQuestion.size,
    questionsShownUp: [...byQuestion.values()].filter(Boolean).length,
    answers: ok.length,
    answersNamedOrCited: ok.filter((r) => r.named || r.cited).length,
    answersNamed: ok.filter((r) => r.named).length,
    answersCited: ok.filter((r) => r.cited).length,
    failed: results.length - ok.length,
    byEngine: AI_ENGINE_IDS.filter((e) => engines.includes(e)).map((engine) => {
      const mine = results.filter((r) => r.engine === engine);
      const good = mine.filter((r) => r.status === "ok");
      return {
        engine,
        answered: good.length,
        namedOrCited: good.filter((r) => r.named || r.cited).length,
        named: good.filter((r) => r.named).length,
        cited: good.filter((r) => r.cited).length,
        failed: mine.length - good.length,
      };
    }),
  };
}

/**
 * The same figures over only the questions and engines both runs asked, so a change of
 * question list is never shown as a rise or fall.
 */
export function comparableSummaries(
  latest: readonly AnswerResult[],
  previous: readonly AnswerResult[],
): { latest: RunSummary; previous: RunSummary; sharedQuestions: number } | null {
  const key = (r: AnswerResult) => `${r.questionId}:${r.engine}`;
  const prevKeys = new Set(previous.map(key));
  const latestKeys = new Set(latest.map(key));
  const a = latest.filter((r) => prevKeys.has(key(r)));
  const b = previous.filter((r) => latestKeys.has(key(r)));
  if (!a.length) return null;
  return { latest: summariseRun(a), previous: summariseRun(b), sharedQuestions: new Set(a.map((r) => r.questionId)).size };
}

export interface EngineAvailability {
  engine: AiEngineId;
  label: string;
  /** Switched on in Setup. */
  enabled: boolean;
  /** A key exists to ask it with. */
  available: boolean;
  model: string;
  /** Why it can't be asked, in plain words. */
  reason: string | null;
}

export interface AiAnswersReport {
  config: AiAnswersConfig;
  engines: EngineAvailability[];
  /** The newest run that finished (done or failed), with its summary. */
  latest: AnswerRun | null;
  /** The finished run before it. */
  previous: AnswerRun | null;
  /** A run in progress right now, if any. */
  running: AnswerRun | null;
  /** When the next automatic run is due, or null when weekly asking is off or not yet saved. */
  nextAutoRunAt: string | null;
}

export function nextAutoRunAt(config: AiAnswersConfig, lastStartedAt: string | null, now: Date): string | null {
  if (!config.saved || !config.autoWeekly) return null;
  if (!lastStartedAt) return now.toISOString();
  return new Date(Date.parse(lastStartedAt) + AUTO_RUN_EVERY_DAYS * 86_400_000).toISOString();
}

export const AI_ANSWER_CAVEATS: readonly string[] = [
  "AI answers change from one asking to the next. Each run asks every question once per assistant, so read one run as a sample and the trend over several runs as the signal.",
  "Questions are asked through each company's API with web search on and a UK location. The consumer apps can answer differently for a signed-in person with their own history.",
  "Named means a brand name appears as a whole word in the answer. Cited means one of the sources is a page on one of our domains.",
];
