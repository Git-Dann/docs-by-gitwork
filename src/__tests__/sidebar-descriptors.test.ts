import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sidebar nav descriptors stay short enough to fit one line.
 *
 * DESIGN.md ("Sidebar nav") sets the rule at 2–3 words. It is a layout constraint, not a
 * style preference: at the 280px rail a descriptor gets ~204px at 11px, so a longer one
 * wraps and its row grows from 47px to 62px. Two ragged rows among seven is what made the
 * rail look unevenly spaced — measured, in August 2026, with "Proposals, SLAs, SOWs and
 * other documents" (Docs) and "Leave, public holidays and team availability" (Backstage).
 *
 * This is the kind of rule that decays silently: nothing breaks when someone adds an
 * eighth module with a sentence under it, and neither `audit:ui` nor `audit-clipping` can
 * see it — nothing is clipped and no class is misused, the rail just goes ragged. So the
 * rule is asserted rather than only written down.
 *
 * Word count, not character count, is deliberate: it is what DESIGN.md tells an author,
 * and it is the thing a person can check while typing. The 4-word ceiling here is the
 * hard fail; 2–3 is the guidance.
 */

const SHELL = join(__dirname, "..", "components", "app-shell.tsx");
/** A 4th word already risks the wrap at 280px, so that is where this fails. */
const MAX_WORDS = 3;

function descriptorsIn(source: string): string[] {
  // Matches the `description: "…"` entries in the nav item literals.
  return [...source.matchAll(/description:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("sidebar nav descriptors", () => {
  const source = readFileSync(SHELL, "utf8");
  const descriptors = descriptorsIn(source);

  it("finds the nav descriptors (guards against the regex silently matching nothing)", () => {
    // Without this, a rename would make every assertion below vacuously pass.
    expect(descriptors.length).toBeGreaterThanOrEqual(6);
  });

  it.each([...new Set(descriptorsIn(readFileSync(SHELL, "utf8")))])(
    "%s is at most 3 words",
    (descriptor) => {
      const words = descriptor.trim().split(/\s+/);
      expect(
        words.length,
        `"${descriptor}" is ${words.length} words. Sidebar descriptors are 2–3 words so the ` +
          `row stays one line at the 280px rail (see DESIGN.md → Sidebar nav). Say what the ` +
          `product IS, not what it contains — or drop the descriptor and let the label carry it.`,
      ).toBeLessThanOrEqual(MAX_WORDS);
    },
  );

  it("has no descriptor that merely repeats its own label", () => {
    // e.g. label "Docs" + descriptor "Docs and documents" earns nothing and still costs a line.
    for (const d of descriptors) {
      expect(d.trim().length).toBeGreaterThan(3);
    }
  });
});
