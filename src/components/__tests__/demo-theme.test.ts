/**
 * The demo follows the theme like the app does (Nov 2026). Before, /demo was forced light, so dark
 * mode had never been looked at on any surface the demo is used to verify.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoThemeParam } from "@/components/providers/theme-provider";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("?theme on a demo page", () => {
  it("sets the mode on /demo and its pages", () => {
    expect(demoThemeParam("/demo", "?theme=dark")).toBe("dark");
    expect(demoThemeParam("/demo/wiki", "?theme=light")).toBe("light");
    expect(demoThemeParam("/demo/portal", "?shape=dense&theme=system")).toBe("system");
  });

  it("is ignored anywhere else, so a link can never change someone's saved preference", () => {
    expect(demoThemeParam("/app", "?theme=dark")).toBeNull();
    expect(demoThemeParam("/app/portal/wedge", "?theme=dark")).toBeNull();
    expect(demoThemeParam("/demonstration", "?theme=dark")).toBeNull();
  });

  it("ignores values that aren't a mode", () => {
    expect(demoThemeParam("/demo", "?theme=purple")).toBeNull();
    expect(demoThemeParam("/demo", "")).toBeNull();
  });
});

describe("the demo is not forced light", () => {
  const provider = read("src/components/providers/theme-provider.tsx");
  const layout = read("src/app/layout.tsx");

  it("in the provider", () => {
    const m = provider.match(/const FORCE_LIGHT = \/\^\\\/\(([^)]+)\)/);
    expect(m, "FORCE_LIGHT not found").not.toBeNull();
    expect(m![1].split("|")).not.toContain("demo");
  });

  it("in the anti-flash script, which also honours ?theme on /demo before first paint", () => {
    const m = layout.match(/force=\/\^\\\\\/\(([^)]+)\)/);
    expect(m, "anti-flash FORCE_LIGHT not found").not.toBeNull();
    expect(m![1].split("|")).not.toContain("demo");
    expect(layout).toContain("get('theme')");
  });

  it("the demo shell offers the same theme switch as the app", () => {
    const shell = read("src/components/demo/demo-shell.tsx");
    expect(shell).toContain('import { ThemeToggle } from "@/components/theme-toggle"');
    expect(shell).toMatch(/<ThemeToggle\b/);
  });
});
