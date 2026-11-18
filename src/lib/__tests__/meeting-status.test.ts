import { describe, expect, it } from "vitest";
import { meetingStatusChip } from "../meeting-status";

describe("meeting notes states", () => {
  it("a failed read says what happened, never a bare 'Error', and isn't red", () => {
    const c = meetingStatusChip("ERROR");
    expect(c.label).toBe("Couldn't read");
    expect(c.label.toLowerCase()).not.toBe("error");
    expect(c.cls).not.toContain("red");
    expect(c.title).toMatch(/Retry/);
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
