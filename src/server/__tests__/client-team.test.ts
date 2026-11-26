import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/slack/client", () => ({}));
import { dedupeTeam } from "../client-team";
import { welcomeText } from "../slack/provisioning";

describe("a client's team (§168)", () => {
  it("one row per person: the same email in any case, or the same name with no email", () => {
    const team = dedupeTeam([
      { name: "Nasir Javed", email: "nasir@gitwork.co.uk" },
      { name: "Nasir J", email: "NASIR@gitwork.co.uk" },
      { name: "Hassaan Bin Sajjad", email: null },
      { name: "hassaan bin sajjad", email: null },
      { name: "", email: null },
    ]);
    expect(team).toEqual([
      { name: "Hassaan Bin Sajjad", email: null },
      { name: "Nasir Javed", email: "nasir@gitwork.co.uk" },
    ]);
  });
});

describe("the new internal channel's welcome", () => {
  it("says who was added and who needs adding by hand", () => {
    const text = welcomeText("Wedge", { invited: ["Nasir Javed", "Sibghat Ullah"], notInvited: ["Hassaan Bin Sajjad"] });
    expect(text).toContain("linked to *Wedge*");
    expect(text).toContain("I've added the team: Nasir Javed, Sibghat Ullah.");
    expect(text).toContain("I couldn't find Hassaan Bin Sajjad in Slack");
  });

  it("when Slack refuses the invite, says why and that they need adding by hand", () => {
    const text = welcomeText("Wedge", { invited: [], notInvited: ["Nasir Javed"], error: "missing_scope" });
    expect(text).toContain("Slack said `missing_scope`");
    expect(text).not.toContain("I couldn't find");
  });
});
