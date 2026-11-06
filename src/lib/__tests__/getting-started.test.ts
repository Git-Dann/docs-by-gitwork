import { describe, expect, it } from "vitest";
import { gettingStartedSteps, showGettingStarted } from "@/lib/getting-started";

const empty = { isHome: false, hasLogo: false, otherPeople: 0, pendingInvites: 0, hasAiKey: false, clients: 0 };

describe("the new-business checklist", () => {
  it("shows a new business every step as to do", () => {
    expect(showGettingStarted(empty)).toBe(true);
    expect(gettingStartedSteps(empty).every((s) => !s.done)).toBe(true);
  });
  it("counts a pending invite as inviting the team", () => {
    expect(gettingStartedSteps({ ...empty, pendingInvites: 1 }).find((s) => s.id === "people")?.done).toBe(true);
  });
  it("disappears once every step is done", () => {
    expect(showGettingStarted({ ...empty, hasLogo: true, otherPeople: 2, hasAiKey: true, clients: 1 })).toBe(false);
  });
  it("is never shown to Gitwork", () => {
    expect(showGettingStarted({ ...empty, isHome: true })).toBe(false);
  });
});
