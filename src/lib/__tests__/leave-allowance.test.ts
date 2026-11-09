/** Whether leave uses up allowance: the request says, else only Annual leave does. */
import { describe, expect, it } from "vitest";
import { COUNTS_TO_ALLOWANCE_WHERE, countsToAllowance, defaultCountsToAllowance } from "@/lib/leave-allowance";

describe("countsToAllowance", () => {
  it("keeps the old rule for requests made before the choice existed", () => {
    expect(countsToAllowance({ type: "ANNUAL", countsToAllowance: null })).toBe(true);
    expect(countsToAllowance({ type: "SICK", countsToAllowance: null })).toBe(false);
    expect(countsToAllowance({ type: "OTHER", countsToAllowance: null })).toBe(false);
  });

  it("follows what the request says, either way", () => {
    // Annual leave for a funeral, agreed outside the allowance.
    expect(countsToAllowance({ type: "ANNUAL", countsToAllowance: false })).toBe(false);
    expect(countsToAllowance({ type: "OTHER", countsToAllowance: true })).toBe(true);
  });

  it("defaults new requests the same way as the old rule", () => {
    expect(defaultCountsToAllowance("ANNUAL")).toBe(true);
    expect(defaultCountsToAllowance("UNPAID")).toBe(false);
  });

  it("the database filter matches the rule", () => {
    expect(COUNTS_TO_ALLOWANCE_WHERE).toEqual({
      OR: [{ countsToAllowance: true }, { countsToAllowance: null, type: "ANNUAL" }],
    });
  });
});
