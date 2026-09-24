/**
 * Every panel that opts into `app-dialog-fixed` must contain a real scroll region.
 *
 * ## Why this test exists
 *
 * `app-dialog-fixed` pins a dialog to `height: 80vh` (clamped 460–680px) so it stops
 * resizing with its content — CLAUDE.md §46, where the standup review measured 281px for
 * a one-line update and 597px for a long one and moved under the cursor.
 *
 * ⚠️ **Pinning a panel without a scroll region inside it makes overflow UNREACHABLE.**
 * The panel is `overflow: hidden`, so content past 80vh is cut with nothing able to
 * scroll to it — strictly worse than the resizing it replaced, and invisible to `tsc`,
 * to `audit:ui` and to a page that happens to open the dialog with short content.
 *
 * The class this asserts is **`min-h-0` on the scrolling element**, because that is the
 * one requirement common to both layouts a dialog body uses:
 *   - in a FLEX column the child also needs `flex-1` to fill the pinned panel;
 *   - in a GRID (the two-column "meta | content" dialogs) `flex-1` is meaningless and
 *     the grid track carries it instead.
 * But BOTH need `min-h-0`: a flex/grid item's automatic minimum size is its content, so
 * without it the region refuses to shrink and pushes the footer out of the panel — the
 * same trap DESIGN.md documents for the Docs editor panes. Requiring all three on one
 * line was the first version of this test and it was simply wrong about grid children.
 *
 * Source-text, deliberately: these are `"use client"` components whose imports drag a
 * React tree into a node test for no benefit, and what is being checked is the presence
 * of a class, which is a fact about the source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "components");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Files that put `app-dialog-fixed` on a real element (not just mentioned in prose). */
function usersOfTheClamp(): { file: string; source: string }[] {
  return walk(ROOT)
    .map((f) => ({ file: path.relative(process.cwd(), f), source: readFileSync(f, "utf8") }))
    // ⚠️ `panelClassName` as well as `className`. The clamp now reaches some panels
    // as a PROP on the shared <Modal>, and a matcher that only knew `className=`
    // silently stopped covering them — which is how a dropped scroll region nearly
    // shipped on the leave and expense forms. The count assertion below is what
    // noticed; keep it.
    .filter(({ source }) =>
      /(?:panelC|c)lassName=\{?["'`][^"'`]*app-dialog-fixed/.test(source),
    );
}

describe("app-dialog-fixed panels can always reach their content", () => {
  const files = usersOfTheClamp();

  it("finds the panels at all (the sweep itself works)", () => {
    // Without this, a broken matcher reports "0 violations" and passes forever.
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.map((f) => f.file).join("\n")).toMatch(/backstage\/modal\.tsx/);
  });

  it("every one contains a flex-1 min-h-0 scroll region", () => {
    const bad: string[] = [];
    for (const { file, source } of files) {
      // A scrolling element that both fills the pinned panel and is allowed to shrink.
      const hasScroller = source
        .split("\n")
        .some(
          (l) =>
            /overflow-(y-)?auto/.test(l) && /\bmin-h-0\b/.test(l),
        );
      if (!hasScroller) bad.push(file);
    }
    expect(
      bad,
      bad.length
        ? `These panels are pinned by \`app-dialog-fixed\` but have no scrolling region ` +
          `carrying \`min-h-0\`, so it cannot shrink inside the pinned panel and anything ` +
          `past the panel height is UNREACHABLE (the panel is overflow:hidden):\n` +
          bad.map((f) => `  • ${f}`).join("\n")
        : "",
    ).toEqual([]);
  });

  it("the clamp is declared exactly once, and uses min() for its floor", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const decl = css.match(/\.app-dialog-fixed\s*\{[^}]*\}/g) ?? [];
    expect(decl).toHaveLength(1);
    // ⚠️ A bare 460px floor pushes the footer off a short viewport — the backdrop layer
    // does not scroll, so it would be unreachable rather than merely cramped (§46).
    expect(decl[0]).toMatch(/min-height:\s*min\(460px,\s*80vh\)/);
    expect(decl[0]).toMatch(/height:\s*80vh/);
  });
});
