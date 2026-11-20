import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Care says each thing one way.
 *
 * Until Nov 2026 it said several things two ways: `care-constants.tsx` and `care-shared.tsx` both
 * exported `SourceIcon`, `SOURCE_LABEL`, `STATUS_LABEL`, `STATUS_TONE` and `PRIORITY_TONE`. They
 * were not copies of each other — `STATUS_LABEL` meant TICKET status in one and CONVERSATION
 * status in the other, which is exactly why nobody noticed the duplication — and they disagreed
 * on the thing that mattered: `care-shared`'s `SourceIcon` drew an envelope for `imap`, while
 * `care-constants`' had no `imap` case at all and fell through to a lightning bolt. Fellas'
 * mailbox is connected over IMAP, so every row in the queue showed the wrong icon, and which
 * answer you got depended on which screen you were looking at.
 *
 * This test is the thing that stops a second copy coming back. It reads source rather than
 * importing, because `care-constants.tsx` is a client component and pulling it into a Node test
 * drags a React tree in for no benefit.
 */

const dir = join(__dirname, "..");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

/** Every top-level `export const NAME` / `export function NAME` in a Care component file. */
function exportsOf(file: string): string[] {
  return [...read(file).matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
}

describe("the Care vocabulary is declared once", () => {
  it("care-constants and care-shared export no name in common", () => {
    const shared = new Set(exportsOf("care-shared.tsx"));
    const both = exportsOf("care-constants.tsx").filter((n) => shared.has(n));
    expect(both, `declared in BOTH care-constants and care-shared: ${both.join(", ")}`).toEqual([]);
  });

  it("care-shared re-exports nothing from care-constants either", () => {
    // Re-exporting would satisfy the test above while leaving two import paths for one thing,
    // which is how the names drifted apart in the first place.
    expect(read("care-shared.tsx")).not.toMatch(/export .*from ["']\.\/care-constants["']/);
  });

  it("no Care file declares its own SourceIcon or SOURCE_LABEL", () => {
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && f !== "care-constants.tsx")
      .filter((f) => /^export (?:const|function) (SourceIcon|SOURCE_LABEL)\b/m.test(read(f)));
    expect(offenders, `should import from care-constants: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("SourceIcon covers every source a client can actually be connected on", () => {
  const icon = read("care-constants.tsx").split("export function SourceIcon")[1].split("\n}")[0];

  /*
   * `LIVE_SOURCES` is the list the connector picker offers, so a source on it is one a real
   * client's mail arrives on. A missing case is not a compile error — the `default` swallows it
   * — so it has to be asserted, and `imap` is the one that was missing and the one Fellas uses.
   */
  const live = ["gmail", "imap", "discord", "reddit", "analytics", "app_reviews", "webhook"];
  it.each(live)("%s has its own case", (source) => {
    expect(icon, `SourceIcon falls through to the bolt for "${source}"`).toContain(`case "${source}":`);
  });

  it("imap draws the envelope, not the bolt", () => {
    const imapArm = icon.split('case "imap":')[1].split("return")[1];
    expect(imapArm).toContain("EnvelopeIcon");
  });
});
