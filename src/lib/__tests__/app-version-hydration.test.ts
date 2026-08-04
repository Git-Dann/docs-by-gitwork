import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * React hydration error #418, which fired on EVERY `/app` page.
 *
 * `AppVersion` renders the build stamp in the viewer's LOCAL time. The server that prerenders it
 * runs in UTC, so in London the server wrote "17:33" and the browser wrote "18:33" for the same
 * instant — different text, mismatched hydration, on a component that sits in the sidebar of
 * every authenticated page.
 *
 * It never reproduced locally, because a dev server and its browser share a timezone. That is
 * what made it look intermittent and environment-specific rather than deterministic.
 *
 * This is asserted on source rather than by rendering, because the defect only exists when the
 * two renders happen in DIFFERENT timezones — a single-process test renders both halves in the
 * same zone and would agree with itself no matter how the component is written. Source is where
 * the invariant actually lives: local-time formatters must not run during render.
 */

const source = readFileSync(
  join(__dirname, "..", "..", "components", "app-shell.tsx"),
  "utf8",
);

/**
 * The `AppVersion` function body with COMMENTS STRIPPED — the only place this rule applies.
 *
 * Stripping matters: the fix carries a comment explaining the bug, and that comment necessarily
 * names `getFullYear` and `suppressHydrationWarning`. Without stripping, these assertions match
 * the explanation instead of the code and fail on correct source — which is exactly what they
 * did on the first run.
 */
function appVersionBody(): string {
  const start = source.indexOf("function AppVersion(");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\nfunction ", start + 1);
  expect(end).toBeGreaterThan(start);

  return source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

// Formatters that read the machine's timezone. `toLocaleString` and friends are included
// because they are the obvious "tidier" rewrite and reintroduce exactly the same bug.
const LOCAL_TIME_CALLS = [
  "getFullYear",
  "getMonth",
  "getDate",
  "getHours",
  "getMinutes",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
];

describe("AppVersion — hydration", () => {
  it("never formats the build stamp during render", () => {
    const body = appVersionBody();

    // Everything before the first hook is render-path code. A local-time call there runs on the
    // server too, which is the defect.
    const effectStart = body.indexOf("useEffect(");
    expect(effectStart).toBeGreaterThan(-1);
    const renderPath = body.slice(0, effectStart);

    const offenders = LOCAL_TIME_CALLS.filter((call) => renderPath.includes(call));

    expect(offenders).toEqual([]);
  });

  it("defers the stamp to state set after mount", () => {
    const body = appVersionBody();

    expect(body).toMatch(/useState<string \| null>\(null\)/);
    expect(body).toContain("setBuilt(");
  });

  it("does not paper over the mismatch with suppressHydrationWarning", () => {
    // That flag silences the warning while leaving the two renders genuinely disagreeing, so the
    // user still sees the server's value replaced. Matching by construction is the real fix.
    expect(appVersionBody()).not.toContain("suppressHydrationWarning");
  });
});
