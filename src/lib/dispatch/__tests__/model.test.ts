import { describe, expect, it } from "vitest";
import { chooseDispatchTier } from "../model";
import { skillsFor } from "../skills";

describe("chooseDispatchTier", () => {
  it.each([
    "What are my tasks on Wedge this week?",
    "Is anything stuck or overdue?",
    "What did we agree on the last call?",
    "Help me write a reply to Luke about the course request page.",
    "Draft release notes for the client.",
    "Break this task into subtasks with acceptance criteria.",
    "Draft my stand-up for today.",
    "Turn this client feedback into tickets: the scorecard crashes with five players.",
  ])("everyday questions go to Haiku: %s", (q) => {
    expect(chooseDispatchTier({ question: q })).toBe("everyday");
  });

  it.each([
    "Where in the code are course requests handled?",
    "Write the PR description for PR #42.",
    "What's the impact analysis for changing the scorecard API?",
    "Does the login screen match the Figma design?",
    "Show me the repo structure.",
    "What changed in the last commits on the iOS app?",
  ])("code and design questions go to Sonnet: %s", (q) => {
    expect(chooseDispatchTier({ question: q })).toBe("deep");
  });

  it("any attached picture goes to Sonnet", () => {
    expect(chooseDispatchTier({ question: "Is this right?", pictures: 1 })).toBe("deep");
  });

  it("most quick actions are everyday; only the code and design ones are deep", () => {
    const all = skillsFor("task");
    const deep = all.filter((s) => chooseDispatchTier({ question: s.prompt }) === "deep").map((s) => s.id);
    const everyday = all.length - deep.length;
    expect(everyday).toBeGreaterThan(deep.length);
  });
});
