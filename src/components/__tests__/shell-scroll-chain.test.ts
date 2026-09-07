import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The shells must be scrollable on a phone.
 *
 * ── What broke (Aug 2026) ─────────────────────────────────────────────────────
 * app-shell frames itself as `h-[100dvh] overflow-hidden` and makes <main> the
 * scroll container. The height that bounds <main> came from
 * `lg:grid lg:grid-rows-[minmax(0,1fr)]` — which only applies at lg and above.
 *
 * Below lg the wrapper was a plain block, so the content column took its natural
 * height, `<main flex-1>` resolved against `auto` and grew to fit its content,
 * and the root's `overflow-hidden` clipped the lot. NOTHING scrolled — not the
 * page, not main. A developer's My Day list simply stopped at the fold with no
 * way to reach the rest. Measured at 390×844: main 2504px tall in an 844px
 * viewport, main-scrolls=false, page-scrolls=false.
 *
 * A browser test would be the honest check, but CI has no browser (see CLAUDE.md
 * §30), so this asserts the mechanism instead: below lg the wrapper must set a
 * flex context and the content column must claim a bounded share of it.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** The wrapper that becomes the desktop grid. */
const WRAPPER = /"([^"]*lg:grid-rows-\[minmax\(0,1fr\)\][^"]*)"/;

const SHELLS = [
  "src/components/app-shell.tsx",
  // The two are explicitly "kept in sync" per app-shell's own comment, and this
  // is the property that matters most — demo-shell serves 16 public demo pages.
  "src/components/demo/demo-shell.tsx",
];

describe("shell scroll chain", () => {
  it.each(SHELLS)("%s bounds its height below lg, not only at lg+", (rel) => {
    const src = read(rel);
    const m = src.match(WRAPPER);
    expect(m, `${rel}: could not find the lg grid wrapper`).toBeTruthy();
    const cls = m![1];

    // A display mode for mobile: without this the wrapper is a block and nothing
    // downstream can resolve a bounded height.
    expect(
      cls,
      `${rel}: the grid is lg-only, so below lg this wrapper needs \`flex\` + \`flex-col\` — ` +
        `otherwise <main> grows past the clipped root and the page cannot scroll at all.`,
    ).toMatch(/(^|\s)flex(\s|$)/);
    expect(cls).toMatch(/(^|\s)flex-col(\s|$)/);
    // And it must itself be bounded by its parent.
    expect(cls).toMatch(/(^|\s)min-h-0(\s|$)/);
    expect(cls).toMatch(/(^|\s)flex-1(\s|$)/);
  });

  it("app-shell's content column claims a bounded share of that flex context", () => {
    const src = read("src/components/app-shell.tsx");
    // The column holding <main>. `flex-1` is what stops it sizing to its content
    // below lg; `min-h-0` is what lets it shrink so <main> can scroll inside it.
    const col = src.match(/"flex min-h-0[^"]*bg-\[var\(--surface-canvas\)\][^"]*pb-12"/);
    expect(col, "could not find the content column").toBeTruthy();
    expect(col![0]).toContain("flex-1");
    expect(col![0]).toContain("min-h-0");
  });

  it("keeps <main> as the scroll container in both shells", () => {
    for (const rel of SHELLS) {
      expect(read(rel), `${rel}: <main> must stay the scroll container`).toMatch(
        /<main[^>]*min-h-0 flex-1 overflow-auto/,
      );
    }
  });
});
