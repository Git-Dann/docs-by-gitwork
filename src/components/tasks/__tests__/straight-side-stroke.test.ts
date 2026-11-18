/**
 * A coloured stroke down a card's left side is fine; one that bends round a rounded corner is
 * not (Dan, Nov 2026: "I liked the stroke on the left… just not the rounded edge"). Wherever a
 * card draws a left stroke, the same class list squares the left corners.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["src/components/clients/wiki/wiki-board-section.tsx", "src/components/tasks/task-card.tsx"];

describe("side strokes are straight", () => {
  for (const file of FILES) {
    it(`${file}: every left stroke has square left corners`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const strings = [...src.matchAll(/"([^"\n]*\bborder-l-\[\d+px\][^"\n]*)"/g)].map((m) => m[1]);
      expect(strings.length).toBeGreaterThan(0);
      for (const cls of strings) expect(cls, cls).toMatch(/\brounded-l-none\b/);
    });
  }
});
