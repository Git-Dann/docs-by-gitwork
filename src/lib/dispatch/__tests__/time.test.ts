import { describe, expect, it } from "vitest";
import { formatMeeting, isValidTimeZone, localDate, nowLine, pickTimeZone } from "../time";
import { shortDay } from "../brief";
import { chatContext, DISPATCH_SYSTEM_PROMPT } from "../prompt";

// 26 Nov 2026, 14:05 in London (GMT, no daylight saving in November).
const now = new Date("2026-11-26T14:05:00Z");

describe("which timezone (§174)", () => {
  it("the first real zone wins; junk is skipped", () => {
    expect(pickTimeZone(["Asia/Karachi", "Europe/London"])).toBe("Asia/Karachi");
    expect(pickTimeZone([null, "PKT", "", "Asia/Karachi"])).toBe("Asia/Karachi");
    expect(pickTimeZone(["Mars/Olympus"])).toBe("Europe/London");
  });

  it("falls back to the country (the one leave uses), then UK time", () => {
    expect(pickTimeZone([null], "PK")).toBe("Asia/Karachi");
    expect(pickTimeZone([null], "pk")).toBe("Asia/Karachi");
    expect(pickTimeZone([], "ZZ")).toBe("Europe/London");
    expect(pickTimeZone([])).toBe("Europe/London");
  });

  it("only real IANA names count", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("GMT+5")).toBe(false);
    expect(isValidTimeZone("Asia/Karachi; DROP TABLE")).toBe(false);
  });
});

describe("the person's 'now' (§174)", () => {
  it("in Pakistan: their date, day and time, with UK time alongside", () => {
    expect(nowLine(now, "Asia/Karachi")).toBe("2026-11-26 (Thursday), 19:05 in Asia/Karachi (GMT+5); 14:05 UK time");
  });

  it("in the UK: just UK time", () => {
    expect(nowLine(now, "Europe/London")).toBe("2026-11-26 (Thursday), 14:05 UK time");
  });

  it("late evening in the UK is already tomorrow in Pakistan", () => {
    const late = new Date("2026-11-26T22:30:00Z");
    expect(localDate(late, "Asia/Karachi")).toBe("2026-11-27");
    expect(nowLine(late, "Asia/Karachi")).toMatch(/^2026-11-27 \(Friday\), 03:30 in Asia\/Karachi/);
  });

  it("an invalid zone falls back to UK time rather than breaking", () => {
    expect(nowLine(now, "Not/AZone")).toBe("2026-11-26 (Thursday), 14:05 UK time");
  });
});

describe("times and dates shown (§174)", () => {
  it("a meeting is shown in the person's zone", () => {
    expect(formatMeeting("2026-11-27T10:00:00Z", "Asia/Karachi", false)).toBe("Fri 27 Nov, 15:00");
    expect(formatMeeting("2026-11-27T10:00:00Z", "Europe/London", false)).toBe("Fri 27 Nov, 10:00");
  });

  it("an all-day event, a due date and a release date are dates, shown as written in any zone", () => {
    expect(formatMeeting("2026-11-27", "America/Los_Angeles", true)).toBe("Fri 27 Nov");
    expect(shortDay("2026-11-27T00:00:00.000Z")).toBe("Fri 27 Nov");
  });

  it("the chat context and prompt carry it", () => {
    const ctx = chatContext({ askerName: "Nasir", roleLabel: "Developer", clientName: "Wedge", today: nowLine(now, "Asia/Karachi") });
    expect(ctx).toContain("Now: 2026-11-26 (Thursday), 19:05 in Asia/Karachi (GMT+5); 14:05 UK time");
    expect(DISPATCH_SYSTEM_PROMPT).toContain("Never assume everyone is in the UK");
  });
});
