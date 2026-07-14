import { describe, expect, it } from "vitest";
import { pickBestChallenge, seniorityFromYears } from "../challenge-store";
import type { DevSignalChallenge } from "../challenges";

function ch(partial: Partial<DevSignalChallenge> & { id: string }): DevSignalChallenge {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    language: partial.language ?? "javascript",
    difficulty: partial.difficulty ?? "mid",
    roles: partial.roles ?? [],
    stacks: partial.stacks ?? [],
    competencies: partial.competencies ?? [],
    promptMarkdown: partial.promptMarkdown ?? "",
    functionName: partial.functionName ?? "fn",
    starterCode: partial.starterCode ?? "",
    timeLimitSec: partial.timeLimitSec ?? 1800,
    tests: partial.tests ?? [{ name: "t", args: [], expected: null }],
  };
}

describe("seniorityFromYears", () => {
  it("bands experience", () => {
    expect(seniorityFromYears(0)).toBe("junior");
    expect(seniorityFromYears(1)).toBe("junior");
    expect(seniorityFromYears(3)).toBe("mid");
    expect(seniorityFromYears(6)).toBe("senior");
    expect(seniorityFromYears(12)).toBe("staff");
  });

  it("defaults to mid when unknown", () => {
    expect(seniorityFromYears(null)).toBe("mid");
    expect(seniorityFromYears(undefined)).toBe("mid");
    expect(seniorityFromYears(NaN)).toBe("mid");
  });
});

describe("pickBestChallenge", () => {
  const bank = [
    ch({ id: "js-junior", difficulty: "junior", stacks: ["javascript"], roles: ["frontend"] }),
    ch({ id: "js-senior", difficulty: "senior", stacks: ["javascript", "node"], roles: ["backend"] }),
    ch({ id: "py-mid", difficulty: "mid", stacks: ["python"], roles: ["data"] }),
  ];

  it("returns null for an empty bank", () => {
    expect(pickBestChallenge([], { primaryStack: "javascript" })).toBeNull();
  });

  it("matches on stack overlap above all else", () => {
    const picked = pickBestChallenge(bank, { primaryStack: "Python", yearsExperience: 3 });
    expect(picked?.id).toBe("py-mid");
  });

  it("uses seniority to break between same-stack challenges", () => {
    const picked = pickBestChallenge(bank, { primaryStack: "javascript", yearsExperience: 10 });
    expect(picked?.id).toBe("js-senior");
  });

  it("prefers junior JS for a junior dev", () => {
    const picked = pickBestChallenge(bank, { primaryStack: "JavaScript", yearsExperience: 0 });
    expect(picked?.id).toBe("js-junior");
  });

  it("with no stack signal, matches on the default (mid) seniority band", () => {
    const picked = pickBestChallenge(bank, {});
    expect(picked?.id).toBe("py-mid");
  });

  it("tokenizes multi-value stack strings", () => {
    const picked = pickBestChallenge(bank, { primaryStack: "Node.js / TypeScript", yearsExperience: 8 });
    // "node" token overlaps js-senior's stacks.
    expect(picked?.id).toBe("js-senior");
  });
});
