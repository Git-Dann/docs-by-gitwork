import { describe, expect, it } from "vitest";
import { meetingStatusChip } from "../meeting-status";

describe("meeting notes states", () => {
  it("a failed summary says so, not that the notes couldn't be read, and isn't red", () => {
    const c = meetingStatusChip("ERROR");
    expect(c.label).toBe("Summary failed");
    expect(c.label).not.toMatch(/read/i);
    expect(c.cls).not.toContain("red");
    expect(c.title).toMatch(/Retry/);
  });

  it("gives the stored reason on hover when there is one", () => {
    const c = meetingStatusChip("ERROR", "The AI provider account is out of credit.");
    expect(c.title).toMatch(/^The AI provider account is out of credit\./);
  });

  it("every state explains itself on hover", () => {
    for (const s of ["SUMMARISED", "TRANSCRIBED", "AWAITING_TRANSCRIPT", "ERROR", "NO_TRANSCRIPT"] as const) {
      expect(meetingStatusChip(s).title.length).toBeGreaterThan(10);
    }
  });

  it("only summarising is shown as working", () => {
    expect(meetingStatusChip("TRANSCRIBED").working).toBe(true);
    expect(meetingStatusChip("ERROR").working).toBeFalsy();
  });
});
