import { describe, it, expect } from "vitest";
import { MockTranscriptionProvider } from "../providers/transcription/mock";
import type { TranscriptionProvider } from "../providers/transcription/types";
import { scoreVideoTranscript } from "../video-scoring";

const noAiWorkspace = {
  aiProvider: "ANTHROPIC",
  anthropicApiKey: null,
  anthropicModel: null,
  openaiApiKey: null,
  openaiModel: null,
  geminiApiKey: null,
  geminiModel: null,
  localLlmUrl: null,
  localLlmModel: null,
};

describe("MockTranscriptionProvider", () => {
  it("returns its canned transcript and reports available", async () => {
    const p: TranscriptionProvider = new MockTranscriptionProvider("hello world");
    expect(p.available()).toBe(true);
    const r = await p.transcribe({ data: new Uint8Array(), mimeType: "audio/webm" });
    expect(r.transcript).toBe("hello world");
  });
});

describe("scoreVideoTranscript", () => {
  it("empty transcript → PENDING_HUMAN, no fabricated score", async () => {
    const r = await scoreVideoTranscript({ transcript: "  ", question: "q", workspace: noAiWorkspace });
    expect(r.status).toBe("PENDING_HUMAN");
    expect(r.subScores).toHaveLength(0);
    expect(r.flags.some((f) => f.code === "empty_transcript")).toBe(true);
  });

  it("no AI key → heuristic scoring, flagged (never a black box)", async () => {
    // Guard: only meaningful when the test env has no real AI key.
    if (process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY) return;
    const transcript = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const r = await scoreVideoTranscript({ transcript, question: "q", workspace: noAiWorkspace });
    expect(r.subScores.length).toBeGreaterThan(0);
    // Rubric never includes accent/emotion/tone as a scored dimension.
    const keys = r.subScores.map((s) => s.key);
    expect(keys).not.toContain("tone");
    expect(keys).not.toContain("accent");
    expect(keys).not.toContain("emotion");
    expect(r.flags.some((f) => f.code === "heuristic_scoring")).toBe(true);
  });
});
