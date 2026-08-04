import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The document display weight is a property of the THEME's face, not of the block.
 *
 * Foundry's DM Serif Display ships a single 400 cut, so 700 there would synthesise a fake bold.
 * Gitwork's Fraunces is always 700 in the brand reference (63 of 63 display occurrences in the
 * signing emails, with no lighter cut used anywhere). A block that hardcodes either number is
 * therefore wrong in one theme by construction.
 *
 * That is not hypothetical: five call sites pinned `font-normal` next to
 * `font-[family-name:var(--font-display)]`, which is why Gitwork headings kept rendering at 400
 * long after the heading rule itself was corrected. These tests make the rule enforceable so the
 * fix cannot quietly rot back — nothing else in the gate can see inside a class string or a
 * `style` object.
 */

const root = join(__dirname, "..", "..", "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

const DOC_FACE_FILES = [
  "src/components/document-cover.tsx",
  "src/lib/sections/heading.tsx",
  "src/lib/sections/pricing-tiers.tsx",
  "src/lib/sections/kpi-strip.tsx",
];

describe("document display weight", () => {
  it("defines --doc-display-weight for both themes, and only 400 or 700", () => {
    const declared = [...css.matchAll(/--doc-display-weight:\s*(\d+)\s*;/g)].map((m) => m[1]);

    // There are exactly two themes — Foundry (the base block) and Gitwork.
    expect(declared).toEqual(["400", "700"]);
  });

  it("resolves the heading rule through the token rather than a literal", () => {
    const headingRule = css.match(
      /\.proposal-document h1,[\s\S]*?\n}/,
    )?.[0];

    expect(headingRule).toBeTruthy();
    expect(headingRule).toContain("font-weight: var(--doc-display-weight)");
  });

  it("exposes .doc-display-face for non-heading display text", () => {
    const rule = css.match(/\.doc-display-face\s*{[\s\S]*?\n}/)?.[0];

    expect(rule).toBeTruthy();
    expect(rule).toContain("font-weight: var(--doc-display-weight)");
  });

  it("never pairs the display face with a hardcoded Tailwind weight", () => {
    const offenders: string[] = [];

    for (const file of DOC_FACE_FILES) {
      const source = readFileSync(join(root, file), "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        const usesDisplayFace =
          line.includes("font-[family-name:var(--font-display)]") ||
          line.includes("doc-display-face");
        if (!usesDisplayFace) continue;

        // `font-normal` / `font-bold` / `font-semibold` next to the display face pins a weight
        // that is correct in at most one of the two themes.
        if (/\bfont-(?:normal|medium|semibold|bold|black|light)\b/.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * The remap of app tokens onto document tokens must be EXHAUSTIVE.
   *
   * Any app token left unremapped keeps its app value inside `.proposal-document`, so a block
   * that reaches for it paints app-blue, cool grey, traffic-light green or a drop shadow onto
   * cream paper. That is why documents read subtly off-brand while every *named* colour looked
   * correct — the defect is in what nobody remembered to name.
   *
   * It was found by hand twice and undercounted both times (once as 7, once as 8; the real
   * figure was 22, and the two hand lists overlapped on a single token). A hand-maintained list
   * is exactly the wrong tool, so this derives both sets from the stylesheet and fails on any
   * token that is neither remapped nor deliberately exempt with a stated reason.
   */
  describe("app-token remap", () => {
    /** Tokens that legitimately need no remap, each with the reason it doesn't. */
    const EXEMPT: Record<string, string> = {
      // Aliases of tokens the remap already covers. Custom properties resolve at USE time, so
      // these pick up the document values automatically — restating them would be noise that
      // could silently drift out of step with what they alias.
      "--accent": "alias of --brand-700, which is remapped",
      "--bg": "alias of --surface-canvas, which is remapped",
    };

    const root = css.slice(css.indexOf(":root,"), css.indexOf("@theme {"));
    const remapBlock = css.slice(
      css.indexOf("Remap the app palette tokens"),
      css.indexOf("\n}", css.indexOf("Remap the app palette tokens")),
    );

    const appTokens = [...new Set([...root.matchAll(/^ {2}(--[a-z0-9-]+):/gm)].map((m) => m[1]))];
    const remapped = new Set([...remapBlock.matchAll(/^ {2}(--[a-z0-9-]+):/gm)].map((m) => m[1]));

    it("finds the app palette and the remap block", () => {
      // Guards the parsing itself: if globals.css is restructured, this test must fail loudly
      // rather than quietly assert over two empty sets and pass forever.
      expect(appTokens.length).toBeGreaterThan(30);
      expect(remapped.size).toBeGreaterThan(20);
    });

    it("remaps every app token, or exempts it with a reason", () => {
      const leaking = appTokens.filter((t) => !remapped.has(t) && !(t in EXEMPT));

      expect(leaking).toEqual([]);
    });

    it("keeps the exempt list honest — an exempt token must not also be remapped", () => {
      // If someone remaps an exempt token, the stated reason has stopped being true and the
      // entry should go, rather than sit there justifying nothing.
      expect(Object.keys(EXEMPT).filter((t) => remapped.has(t))).toEqual([]);
    });
  });

  it("removes the invented 44x2px purple rule under Gitwork section headers", () => {
    // The gap analysis found no such underline in EITHER reference — it was invented, so it must
    // stay removed rather than be re-tuned. Section hierarchy is the mono overline + bold title.
    expect(css).not.toMatch(/section\.proposal-block-avoid\s*>\s*header::after/);
  });
});
