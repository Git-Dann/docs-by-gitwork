import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every wiki section's header actions (the buttons in a card's `widget-header`) use the house
 * button, `app-button … app-button-xs`, so "Add module", "Add monitor", "New table" and the rest
 * look the same on every wiki page. A hand-styled button there drifts on its own (Nov 2026: Code
 * Handover's filled blue "Add module" beside everyone else's quiet secondary button).
 */
const DIR = join(process.cwd(), "src/components/clients/wiki");

describe("wiki section header buttons", () => {
  it("use the house button, never a hand-styled one", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith(".tsx"))) {
      const s = readFileSync(join(DIR, f), "utf8");
      for (const m of s.matchAll(/<div className="widget-header[^"]*">/g)) {
        const seg = s.slice(m.index! + m[0].length, m.index! + m[0].length + 2500);
        const header = seg.slice(0, seg.indexOf("</div>\n"));
        for (const b of header.matchAll(/<button[\s\S]*?className="([^"]+)"/g)) {
          if (!/\bapp-button\b/.test(b[1])) offenders.push(`${f}: ${b[1].slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
