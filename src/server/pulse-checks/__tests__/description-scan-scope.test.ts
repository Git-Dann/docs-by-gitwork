import { describe, expect, it } from "vitest";
import { skipAllChecks } from "@/server/pulse-scan";

describe("description-only scan scope", () => {
  it("does not manufacture a catalogue of URL and repository checks", () => {
    expect(skipAllChecks("FREE_TEXT", "WEB_APP")).toEqual([]);
  });
});
