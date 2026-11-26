import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { isLeadershipTitle } from "../people-context";
import { chatContext, noClientContext, DISPATCH_SYSTEM_PROMPT } from "@/lib/dispatch/prompt";

describe("who counts as leadership (§169)", () => {
  it("directors, founders and MDs; not everyone with a title", () => {
    expect(isLeadershipTitle("Managing Director")).toBe(true);
    expect(isLeadershipTitle("Co-founder")).toBe(true);
    expect(isLeadershipTitle("MD")).toBe(true);
    expect(isLeadershipTitle("Senior iOS Developer")).toBe(false);
    expect(isLeadershipTitle(null, "DIRECTOR")).toBe(true);
    expect(isLeadershipTitle("Head of Admin", "EMPLOYEE")).toBe(false);
  });
});

describe("the asker's title and the leadership reach the chat (§169)", () => {
  const leadership = ["Dan Lindsay, Managing Director", "Harry Brown, Managing Director"];

  it("in a client chat", () => {
    const ctx = chatContext({ askerName: "Dan Lindsay", roleLabel: "Super Admin", askerTitle: "Managing Director", leadership, clientName: "Wedge", today: "2026-11-26" });
    expect(ctx).toContain("Asking: Dan Lindsay (Super Admin, Managing Director)");
    expect(ctx).toContain("Gitwork's leadership: Dan Lindsay, Managing Director; Harry Brown, Managing Director");
  });

  it("in a channel with no client", () => {
    const ctx = noClientContext({ askerName: "Dan Lindsay", roleLabel: "Super Admin", askerTitle: "Managing Director", leadership, today: "2026-11-26", where: "channel" });
    expect(ctx).toContain("Harry Brown, Managing Director");
  });

  it("no title, no clutter", () => {
    expect(chatContext({ askerName: "Nasir", roleLabel: "Developer", clientName: "Wedge", today: "2026-11-26" })).toContain("Asking: Nasir (Developer)");
  });

  it("the prompt says to be cheeky and even-handed, never to rank anyone", () => {
    expect(DISPATCH_SYSTEM_PROMPT).toContain("be cheeky and even-handed");
    expect(DISPATCH_SYSTEM_PROMPT).toContain("never seriously rank anyone");
  });
});
