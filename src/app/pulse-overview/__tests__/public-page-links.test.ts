import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// /pulse-overview is a PUBLIC, shareable product page (CLAUDE.md §4) and is
// allowed in robots.ts. It had drifted into being internal-facing:
//
//   · an "INTERNAL" badge in the header, visible to every prospect
//   · all four "Run a scan" CTAs pointing at auth-gated /app/pulse/new
//   · a "Settings → Integrations" link beside the main call to action
//
// So the public page for Pulse told visitors it was internal and then sent every
// one of them to a login screen. Now that the page embeds a working free scanner,
// the CTAs point at that instead.
// ─────────────────────────────────────────────────────────────────────────────

const source = readFileSync("src/app/pulse-overview/page.tsx", "utf8");

describe("the public Pulse page does not send visitors to a login", () => {
  it("links to no auth-gated /app route", () => {
    // Anchored on a path-segment boundary, not a bare prefix. `/app` must not match
    // `/apple-icon.png` — the root layout injects exactly that, and an unanchored
    // prefix would fail this test for a favicon. Same trap CLAUDE.md §33 records for
    // MODULE_PATHS, where `/app/code` incidentally matched `/app/codex`.
    const gated = [...source.matchAll(/href="(\/app(?:\/[^"]*)?)"/g)].map((m) => m[1]);
    expect(gated).toEqual([]);
  });

  it("that guard does not fire on a path that merely starts with the same letters", () => {
    // Proves the anchoring above actually anchors, rather than passing by luck.
    const decoy = '<link rel="apple-touch-icon" href="/apple-icon.png"/>';
    expect([...decoy.matchAll(/href="(\/app(?:\/[^"]*)?)"/g)]).toHaveLength(0);
  });

  it("does not describe itself as INTERNAL", () => {
    expect(source).not.toContain("INTERNAL");
  });

  it("points its call to action at the embedded free scanner", () => {
    expect(source).toContain('href="#try-it-free"');
    // …and that anchor must actually exist on the page.
    expect(source).toContain('id="try-it-free"');
  });

  it("clears the sticky header when the anchor is jumped to", () => {
    // Without scroll-margin the sticky header covers the target heading.
    expect(source).toMatch(/id="try-it-free"[\s\S]{0,400}scrollMarginTop/);
  });

  it("still embeds the live scanner", () => {
    expect(source).toContain('src="/embed/pulse"');
  });
});
