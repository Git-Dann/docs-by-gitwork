import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The editor's scroll chain — a load-bearing invariant that has now broken production once.
 *
 * On `lg` the editor is a FIXED-HEIGHT frame: the page itself never scrolls, the document
 * scrolls inside the canvas. That only works if every link in the chain passes a bounded height
 * down, and `min-h-0` appears at each level (a flex item's automatic minimum size is its
 * content, so without it the item grows instead of scrolling):
 *
 *   root `lg:h-full lg:min-h-0 lg:overflow-hidden`
 *     → shell   `lg:flex lg:min-h-0 lg:flex-1`
 *       → canvas  `lg:flex lg:min-h-0 lg:flex-1 lg:flex-col`
 *         → card    `lg:flex lg:min-h-0 lg:flex-1 lg:flex-col`
 *           → scroller `overflow-auto lg:min-h-0 lg:flex-1`
 *
 * How it broke: converting the three-column grid to a floating layout left the shell as
 * `relative` alone — which is `display: block`. The canvas child's `lg:flex-1 lg:min-h-0` then
 * resolved against nothing, the canvas never took the frame's height, and the scroller had no
 * bounded height to scroll within. The document could not be scrolled at all. The grid had been
 * supplying that height via `grid-rows-1`; when the columns went, nothing replaced it.
 *
 * Asserted on source because the failure is pure CSS layout: jsdom does not do layout, so a
 * render test would pass on the broken markup. This is the cheapest thing that actually fails.
 */

const source = readFileSync(
  join(__dirname, "..", "..", "components", "proposals", "proposal-editor-layout.tsx"),
  "utf8",
);

/**
 * The class string literal CONTAINING `marker`.
 *
 * Deliberately the enclosing string literal rather than the nearest `className="`: these
 * elements are a mix of plain `className="…"` and `className={cn("…", cond && "…")}`, and
 * walking back to the nearest `className="` finds a different element entirely on the `cn` ones.
 */
function classesNear(marker: string): string {
  const at = source.indexOf(marker);
  expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1);
  const open = source.lastIndexOf('"', at);
  const close = source.indexOf('"', at + marker.length);
  expect(close).toBeGreaterThan(open);
  return source.slice(open + 1, close);
}

describe("editor scroll chain", () => {
  it("makes the editor shell a flex container, not a bare `relative` block", () => {
    // The regression in one assertion: `relative` alone is display:block, and a block parent
    // gives its child no height to flex against.
    const shell = classesNear("relative lg:flex");

    expect(shell).toContain("lg:flex");
    expect(shell).toContain("lg:min-h-0");
    expect(shell).toContain("lg:flex-1");
  });

  it("lets the canvas claim the full height and width of that shell", () => {
    // The canvas is the only IN-FLOW child (both rails are absolutely positioned), so it has to
    // claim the space itself rather than inherit it from a sibling track.
    const canvas = classesNear("min-w-0 lg:flex");

    expect(canvas).toContain("lg:flex-1");
    expect(canvas).toContain("lg:min-h-0");
    expect(canvas).toContain("lg:w-full");
  });

  it("keeps the document scroller bounded", () => {
    const scroller = classesNear("overflow-auto p-4");

    expect(scroller).toContain("overflow-auto");
    expect(scroller).toContain("lg:min-h-0");
    expect(scroller).toContain("lg:flex-1");
  });

  it("keeps `min-h-0` on every link, since one omission collapses the whole chain", () => {
    for (const marker of ["relative lg:flex", "min-w-0 lg:flex", "overflow-auto p-4"]) {
      expect(classesNear(marker), marker).toContain("min-h-0");
    }
  });
});
