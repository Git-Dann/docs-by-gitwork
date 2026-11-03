import { describe, expect, it } from "vitest";
import { matchesPerson, summariseRecipients } from "../message-recipients";

/**
 * The recipient field is the only place the choice is visible once the roster is behind
 * a dropdown, and the thing it describes sends a push notification to people's phones.
 * So the cases that matter are the ones where a wrong reading is expensive.
 */

describe("summariseRecipients", () => {
  it("prompts when nothing is chosen", () => {
    expect(summariseRecipients([], 29)).toBe("Choose people");
  });

  it("names one and two people outright", () => {
    expect(summariseRecipients(["Sian Woolridge"], 29)).toBe("Sian Woolridge");
    expect(summariseRecipients(["Sian Woolridge", "Harry Brown"], 29)).toBe(
      "Sian Woolridge and Harry Brown",
    );
  });

  it("names the first two and counts the rest", () => {
    // Naming SOMEBODY beats a bare count: "4 selected" makes you reopen the picker to
    // check you picked the right four, which is the check you want before sending.
    expect(
      summariseRecipients(["Sian Woolridge", "Harry Brown", "Umer Fayyaz", "Zain Ali"], 29),
    ).toBe("Sian Woolridge, Harry Brown +2");
  });

  it("says Everyone rather than listing the whole company", () => {
    // Sending to all 29 is the one choice that should never look like an ordinary list.
    const all = Array.from({ length: 29 }, (_, i) => `Person ${i}`);
    expect(summariseRecipients(all, 29)).toBe("Everyone (29)");
  });

  it("does not claim Everyone when one person is missing", () => {
    const most = Array.from({ length: 28 }, (_, i) => `Person ${i}`);
    expect(summariseRecipients(most, 29)).toBe("Person 0, Person 1 +26");
  });

  it("does not claim Everyone while the roster is still loading", () => {
    // totalPeople is 0 in flight. Nothing can be picked yet either, so the honest
    // answer is the prompt — asserted because "Everyone (0)" would be a lie about who
    // is about to be notified.
    expect(summariseRecipients([], 0)).toBe("Choose people");
  });

  it("ignores blank names rather than printing a gap", () => {
    expect(summariseRecipients(["", "  ", "Harry Brown"], 29)).toBe("Harry Brown");
  });
});

describe("matchesPerson", () => {
  it("matches on either name or email, case-insensitively", () => {
    expect(matchesPerson("sia", "Sian Woolridge", "sian@gitwork.co.uk")).toBe(true);
    expect(matchesPerson("WOOLRIDGE", "Sian Woolridge", "sian@gitwork.co.uk")).toBe(true);
    expect(matchesPerson("gitwork", "Sian Woolridge", "sian@gitwork.co.uk")).toBe(true);
  });

  it("matches a mid-name token, because people search by surname", () => {
    expect(matchesPerson("bin", "Syed Usama Bin Tahir", "syed@gitwork.co.uk")).toBe(true);
  });

  it("ignores accents in either direction", () => {
    expect(matchesPerson("bjorn", "Björn Khermik", "b@x.co")).toBe(true);
    expect(matchesPerson("björn", "Bjorn Khermik", "b@x.co")).toBe(true);
  });

  it("shows everyone for a blank or whitespace query", () => {
    // An empty filter box must not hide the roster.
    expect(matchesPerson("", "Anyone", "a@x.co")).toBe(true);
    expect(matchesPerson("   ", "Anyone", "a@x.co")).toBe(true);
  });

  it("excludes a genuine non-match", () => {
    expect(matchesPerson("zzz", "Sian Woolridge", "sian@gitwork.co.uk")).toBe(false);
  });
});
