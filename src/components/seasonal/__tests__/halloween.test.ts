import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HALLOWEEN_PATHS } from "@/components/providers/theme-provider";
import { SEASONAL_KEY, SEASONAL_THEMES, activeSeasonalTheme, isSeasonalThemeId } from "@/lib/seasonal-themes";

describe("Halloween theme", () => {
  it("is a workspace setting: off unless an admin switches it on, and only to a theme we ship", () => {
    expect(activeSeasonalTheme(false, "halloween")).toBeNull();
    expect(activeSeasonalTheme(true, "halloween")).toBe("halloween");
    expect(activeSeasonalTheme(true, "easter-2019")).toBeNull();
    expect(activeSeasonalTheme(true, null)).toBeNull();
    expect(SEASONAL_THEMES.every((t) => isSeasonalThemeId(t.id))).toBe(true);
  });

  it("has no date default and no header toggle any more", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).not.toContain("HalloweenToggle");
    expect(readFileSync("src/components/providers/theme-provider.tsx", "utf8")).not.toContain("halloweenSeason");
  });

  it("shows on the app and the demo, never on a client deliverable or a sign-in page", () => {
    for (const p of ["/app", "/app/pulse", "/demo", "/demo/dev"]) expect(HALLOWEEN_PATHS.test(p)).toBe(true);
    for (const p of ["/apply", "/demonstrate", "/docs/abc", "/wiki/x/tok", "/login", "/portal/login", "/edge"]) {
      expect(HALLOWEEN_PATHS.test(p)).toBe(false);
    }
  });

  it("uses the same route rule in the anti-flash script", () => {
    // The script runs before React, so a page that disagrees would flash the wrong theme.
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("var hal=/^\\\\/(app|demo)(?:\\\\/|$)/.test(p)");
    expect(layout).toContain(`'${SEASONAL_KEY}'`);
    expect(layout).toContain("sv==='halloween'");
  });
});
