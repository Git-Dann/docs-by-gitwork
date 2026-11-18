/**
 * Staff's tabs all live under /app/staff now (CLAUDE.md §87), so People — which owns
 * /app/staff/[id] profiles — must not light up on its sibling tabs' pages.
 */
import { describe, expect, it } from "vitest";
import { isTabActive } from "../codeclear-shared";

describe("which Staff tab is lit", () => {
  it.each([
    ["/app/staff", "/app/staff"],
    ["/app/staff/c123", "/app/staff"],
    ["/app/staff/suppliers", "/app/staff/suppliers"],
    ["/app/staff/developers", "/app/staff/developers"],
    ["/app/staff/hiring", "/app/staff/hiring"],
    ["/app/staff/hiring/pipeline", "/app/staff/hiring/pipeline"],
    ["/app/staff/hiring/devsignal/ds-1", "/app/staff/hiring/devsignal"],
  ])("%s lights %s", (pathname, tab) => {
    expect(isTabActive(tab, pathname)).toBe(true);
  });

  it.each(["/app/staff/developers", "/app/staff/hiring", "/app/staff/hiring/pipeline", "/app/staff/suppliers"])(
    "People is not lit on %s",
    (pathname) => {
      expect(isTabActive("/app/staff", pathname)).toBe(false);
    },
  );

  it("Overview is only the bare Hiring page", () => {
    expect(isTabActive("/app/staff/hiring", "/app/staff/hiring/pipeline")).toBe(false);
    expect(isTabActive("/app/staff/hiring", "/app/staff/hiring/candidates/c1")).toBe(false);
  });
});
