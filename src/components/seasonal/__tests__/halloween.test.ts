import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HALLOWEEN_PATHS, halloweenSeason } from "@/components/providers/theme-provider";

describe("Halloween theme", () => {
  it("is in season from 20 October to 2 November", () => {
    expect(halloweenSeason(new Date(2026, 9, 19))).toBe(false);
    expect(halloweenSeason(new Date(2026, 9, 20))).toBe(true);
    expect(halloweenSeason(new Date(2026, 9, 31))).toBe(true);
    expect(halloweenSeason(new Date(2026, 10, 2))).toBe(true);
    expect(halloweenSeason(new Date(2026, 10, 3))).toBe(false);
  });

  it("shows on the demo only, never on a client deliverable or a sign-in page", () => {
    for (const p of ["/demo", "/demo/dev", "/demo/tasks"]) expect(HALLOWEEN_PATHS.test(p)).toBe(true);
    for (const p of ["/app", "/demonstrate", "/docs/abc", "/wiki/x/tok", "/login", "/portal/login"]) {
      expect(HALLOWEEN_PATHS.test(p)).toBe(false);
    }
  });

  it("uses the same route rule in the anti-flash script", () => {
    // The script runs before React, so a page that disagrees would flash the wrong theme.
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("var hal=/^\\\\/demo(?:\\\\/|$)/.test(p)");
    expect(layout).toContain("'foundry.halloween.v1'");
  });
});
