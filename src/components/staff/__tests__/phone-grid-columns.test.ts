import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A grid with no column count on a phone gets one implicit `auto` track, sized to its widest
 * content. A card whose client list doesn't wrap then pushes the column past the edge of a
 * `.widget-card` (overflow: hidden), and the card is cut off. That is what Staff → People did
 * on a phone (Nov 2026). `grid-cols-1` is minmax(0, 1fr), which can't grow past its container.
 */
const DIR = join(process.cwd(), "src/components/staff");

describe("Staff grids have one bounded column on a phone", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

  it("finds the Staff components", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("gives every breakpoint grid an explicit grid-cols-1", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(join(DIR, f), "utf8").matchAll(/className="(grid [^"]*?\b(?:sm|md|lg):grid-cols-[^"]*)"/g)) {
        if (!/\bgrid-cols-1\b/.test(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
