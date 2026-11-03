import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_ANSWERS_CONFIG,
  EXAMPLE_BUYER_QUESTIONS,
  comparableSummaries,
  effectiveRunStatus,
  excerptOf,
  isOurHost,
  judgeAnswer,
  mentionsBrand,
  nextAutoRunAt,
  normaliseDomain,
  parseAiAnswersConfig,
  questionId,
  serialiseAiAnswersConfig,
  sourceIsOurs,
  summariseRun,
  toQuestions,
  type AnswerResult,
} from "@/lib/ai-answers";

const cfg = { brandNames: ["Gitwork"], domains: ["gitwork.co.uk"] };

describe("mentionsBrand", () => {
  it("counts the name as a whole word, any case, possessive included", () => {
    expect(mentionsBrand("Try Gitwork in Manchester.", ["Gitwork"])).toBe(true);
    expect(mentionsBrand("gitwork's MVP service", ["Gitwork"])).toBe(true);
    expect(mentionsBrand("**Gitwork** (Salford)", ["Gitwork"])).toBe(true);
  });

  it("does not count a longer word or a different name", () => {
    expect(mentionsBrand("Gitworks Ltd is another firm", ["Gitwork"])).toBe(false);
    expect(mentionsBrand("notgitwork builds apps", ["Gitwork"])).toBe(false);
    expect(mentionsBrand("GitHub and work tracking", ["Gitwork"])).toBe(false);
  });
});

describe("whose page a source is", () => {
  it("matches our host and subdomains, never a substring", () => {
    expect(isOurHost("gitwork.co.uk", ["gitwork.co.uk"])).toBe(true);
    expect(isOurHost("foundry.gitwork.co.uk", ["gitwork.co.uk"])).toBe(true);
    expect(isOurHost("notgitwork.co.uk", ["gitwork.co.uk"])).toBe(false);
    expect(isOurHost("gitwork.co.uk.evil.example", ["gitwork.co.uk"])).toBe(false);
  });

  it("reads Gemini's redirect sources by a title that is exactly a domain, and nothing looser", () => {
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    expect(sourceIsOurs({ url: redirect, title: "gitwork.co.uk" }, ["gitwork.co.uk"])).toBe(true);
    expect(sourceIsOurs({ url: redirect, title: "Why we picked gitwork.co.uk over others" }, ["gitwork.co.uk"])).toBe(false);
    expect(sourceIsOurs({ url: redirect, title: "clutch.co" }, ["gitwork.co.uk"])).toBe(false);
    expect(sourceIsOurs({ url: "https://www.gitwork.co.uk/services", title: null }, ["gitwork.co.uk"])).toBe(true);
  });
});

describe("judgeAnswer", () => {
  it("names and cites are separate facts", () => {
    expect(judgeAnswer({ text: "Gitwork is one option.", sources: [] }, cfg)).toMatchObject({ named: true, cited: false });
    expect(
      judgeAnswer({ text: "One option is a Salford studio.", sources: [{ url: "https://gitwork.co.uk/mvp", title: "MVP" }] }, cfg),
    ).toMatchObject({ named: false, cited: true, ourSources: ["https://gitwork.co.uk/mvp"] });
  });

  it("counts a link written into the answer as a citation", () => {
    const v = judgeAnswer({ text: "See [their site](https://gitwork.co.uk/pulse).", sources: [] }, cfg);
    expect(v.cited).toBe(true);
    expect(v.ourSources).toEqual(["https://gitwork.co.uk/pulse"]);
  });

  it("an answer about other agencies is neither", () => {
    expect(
      judgeAnswer({ text: "Try Northbeam or Halcyon.", sources: [{ url: "https://clutch.co/uk", title: "Clutch" }] }, cfg),
    ).toEqual({ named: false, cited: false, ourSources: [] });
  });
});

const result = (q: string, engine: AnswerResult["engine"], over: Partial<AnswerResult> = {}): AnswerResult => ({
  questionId: questionId(q),
  question: q,
  engine,
  model: "m",
  status: "ok",
  named: false,
  cited: false,
  ourSources: [],
  sources: [],
  excerpt: "",
  error: null,
  askedAt: "2026-11-02T10:00:00Z",
  ...over,
});

describe("summariseRun", () => {
  it("counts questions where any assistant showed us, and keeps failures out of every figure", () => {
    const s = summariseRun([
      result("A?", "chatgpt", { named: true }),
      result("A?", "claude"),
      result("B?", "chatgpt"),
      result("B?", "claude", { cited: true }),
      result("C?", "chatgpt"),
      result("C?", "claude", { status: "error", named: false, error: "429" }),
      result("D?", "chatgpt", { status: "refused" }),
    ]);
    expect(s).toMatchObject({
      questionsAnswered: 3,
      questionsShownUp: 2,
      answers: 5,
      answersNamedOrCited: 2,
      answersNamed: 1,
      answersCited: 1,
      failed: 2,
    });
    expect(s.byEngine.find((e) => e.engine === "claude")).toMatchObject({ answered: 2, namedOrCited: 1, failed: 1 });
  });

  it("a question every assistant failed on is not counted as answered", () => {
    expect(summariseRun([result("A?", "chatgpt", { status: "error" })]).questionsAnswered).toBe(0);
  });
});

describe("comparableSummaries", () => {
  it("compares only the question and assistant pairs both runs asked", () => {
    const latest = [result("A?", "chatgpt", { named: true }), result("New?", "chatgpt", { named: true })];
    const previous = [result("A?", "chatgpt"), result("Old?", "chatgpt", { named: true })];
    const c = comparableSummaries(latest, previous)!;
    expect(c.sharedQuestions).toBe(1);
    expect(c.latest.answersNamedOrCited).toBe(1);
    expect(c.previous.answersNamedOrCited).toBe(0);
  });

  it("nothing in common is no comparison, not a fall to zero", () => {
    expect(comparableSummaries([result("A?", "chatgpt")], [result("B?", "chatgpt")])).toBeNull();
  });
});

describe("config", () => {
  it("ships twelve example questions with stable, distinct ids", () => {
    expect(DEFAULT_AI_ANSWERS_CONFIG.questions).toHaveLength(EXAMPLE_BUYER_QUESTIONS.length);
    expect(new Set(DEFAULT_AI_ANSWERS_CONFIG.questions.map((q) => q.id)).size).toBe(EXAMPLE_BUYER_QUESTIONS.length);
    expect(DEFAULT_AI_ANSWERS_CONFIG.saved).toBe(false);
    expect(questionId("  Who builds MVPs? ")).toBe(questionId("who builds   mvps?"));
  });

  it("drops blanks and duplicates", () => {
    expect(toQuestions(["A?", "", "a?", "B?"]).map((q) => q.text)).toEqual(["A?", "B?"]);
  });

  it("normalises domains as typed", () => {
    expect(normaliseDomain("https://www.Gitwork.co.uk/services")).toBe("gitwork.co.uk");
    expect(normaliseDomain("gitwork")).toBeNull();
    expect(normaliseDomain("javascript:alert(1)")).toBeNull();
  });

  it("a saved config round-trips and is marked saved; nothing stored is the examples", () => {
    const saved = parseAiAnswersConfig(serialiseAiAnswersConfig({ ...DEFAULT_AI_ANSWERS_CONFIG, engines: ["claude"], autoWeekly: false }));
    expect(saved).toMatchObject({ saved: true, engines: ["claude"], autoWeekly: false });
    expect(saved.questions).toEqual(DEFAULT_AI_ANSWERS_CONFIG.questions);
    expect(parseAiAnswersConfig(null)).toBe(DEFAULT_AI_ANSWERS_CONFIG);
  });

  it("weekly asking only applies once saved", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    expect(nextAutoRunAt(DEFAULT_AI_ANSWERS_CONFIG, null, now)).toBeNull();
    const saved = { ...DEFAULT_AI_ANSWERS_CONFIG, saved: true };
    expect(nextAutoRunAt(saved, null, now)).toBe(now.toISOString());
    expect(nextAutoRunAt(saved, "2026-11-01T10:00:00Z", now)).toBe("2026-11-08T10:00:00.000Z");
    expect(nextAutoRunAt({ ...saved, autoWeekly: false }, null, now)).toBeNull();
  });
});

describe("runs and excerpts", () => {
  it("a run still running after 30 minutes was cut short", () => {
    const now = new Date("2026-11-02T10:31:00Z");
    expect(effectiveRunStatus({ status: "running", startedAt: "2026-11-02T10:00:00Z" }, now)).toBe("interrupted");
    expect(effectiveRunStatus({ status: "running", startedAt: "2026-11-02T10:10:00Z" }, now)).toBe("running");
    expect(effectiveRunStatus({ status: "done", startedAt: "2026-11-02T08:00:00Z" }, now)).toBe("done");
  });

  it("keeps the part of a long answer that mentions us", () => {
    const text = `${"Intro words. ".repeat(300)}Gitwork is based in Salford. ${"More. ".repeat(100)}`;
    const ex = excerptOf(text, ["Gitwork"], 400);
    expect(ex).toContain("Gitwork is based in Salford");
    expect(ex.length).toBeLessThanOrEqual(400);
  });
});
