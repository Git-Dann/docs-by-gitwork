import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The forced-light route list, and the pages that depend on it.
 *
 * ── What went wrong (August 2026) ──────────────────────────────────────────────
 * `/login` was not in FORCE_LIGHT. Both sign-in pages are hand-painted in fixed
 * hexes so they look identical for every visitor, but they also used the `bg-white`
 * utility — and `[data-theme="dark"] .bg-white` remaps to `--surface-0`, near-black.
 * The inline `color` stayed dark ink, so for anyone whose stored theme or OS was
 * dark, the "Continue with Google" label and the Pulse/Study/Docs headings were
 * invisible: measured 1.04:1 contrast, dark text on rgb(22,22,23).
 *
 * Three properties are asserted here, each of which was silently untrue or
 * unenforced at the time:
 *
 *  1. The sign-in routes are in the list at all.
 *  2. The list in `theme-provider.tsx` and the copy inside the inline anti-flash
 *     script in `layout.tsx` are IDENTICAL. Both files say "kept in sync with"
 *     the other and nothing checked it. They cannot be shared: the script is a
 *     string executed before hydration to avoid a theme flash, so the pattern is
 *     genuinely duplicated — which is exactly why it needs a test.
 *  3. A theme-locked page uses no utility class the dark remap rewrites. Being in
 *     FORCE_LIGHT makes such a class safe, but relying on that means the page
 *     breaks silently the day the route is removed from the list.
 */

const ROOT = join(__dirname, "..", "..");
const provider = readFileSync(join(ROOT, "src/components/providers/theme-provider.tsx"), "utf8");
const rootLayout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

/** The alternation body, e.g. "docs|report|sign|…" — normalised so the two copies compare. */
function forcedLightAlternation(source: string): string {
  const m = source.match(/\^\\{1,2}\/\((docs\|[^)]+)\)/);
  if (!m) throw new Error("Could not find the FORCE_LIGHT alternation");
  // The layout copy is inside a JS string, so its backslashes are doubled.
  return m[1].replace(/\\\\/g, "\\");
}

const providerList = forcedLightAlternation(provider);
const layoutList = forcedLightAlternation(rootLayout);

describe("forced-light routes", () => {
  it("includes both sign-in pages", () => {
    // These are the pages the incident was about.
    expect(providerList).toContain("login");
    expect(providerList).toContain("portal\\/login");
  });

  it("keeps the provider list and the anti-flash script byte-identical", () => {
    expect(
      layoutList,
      "The FORCE_LIGHT pattern is duplicated in src/app/layout.tsx's inline anti-flash " +
        "script and must match src/components/providers/theme-provider.tsx exactly. " +
        "If they drift, a route renders one theme before hydration and the other after.",
    ).toBe(providerList);
  });

  it("matches the routes it claims to, and nothing adjacent", () => {
    const re = new RegExp(`^\\/(${providerList})(?:\\/|$)`);
    for (const path of ["/login", "/portal/login", "/docs/abc", "/report/abc", "/sign/abc"]) {
      expect(re.test(path), `${path} should be forced light`).toBe(true);
    }
    // Must not swallow the app or a lookalike segment.
    for (const path of ["/app", "/app/pulse", "/logins", "/portal", "/edge"]) {
      expect(re.test(path), `${path} should NOT be forced light`).toBe(false);
    }
  });
});

describe("theme-locked sign-in pages", () => {
  /** Every utility class the dark remap rewrites, read from globals.css. */
  const remapped = new Set(
    [...globals.matchAll(/\[data-theme="dark"\]\s+\.([a-zA-Z0-9-]+)\s*[,{]/g)].map((m) => m[1]),
  );

  it("found the remap rules (guards against the regex matching nothing)", () => {
    expect(remapped.size).toBeGreaterThan(10);
    expect(remapped.has("bg-white")).toBe(true);
  });

  it.each(["src/app/login/page.tsx", "src/components/portal/portal-login-form.tsx"])(
    "%s uses no dark-remapped utility class",
    (rel) => {
      const source = readFileSync(join(ROOT, rel), "utf8");
      // Only look inside className strings — these files mention `bg-white` in prose
      // comments explaining precisely why they must not use it.
      const classNames = [...source.matchAll(/className="([^"]*)"/g)].flatMap((m) =>
        m[1].split(/\s+/),
      );
      const offenders = classNames.filter((c) => remapped.has(c));
      expect(
        offenders,
        `${rel} is theme-locked to light, so a class the dark remap rewrites will invert ` +
          `its surface while its inline hex colour stays put — that is the 1.04:1 contrast ` +
          `sign-in page from August 2026. Use a fixed hex via style={{…}} instead.`,
      ).toEqual([]);
    },
  );
});
