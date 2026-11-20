/**
 * Care home's layout, as source-shape rules.
 *
 * The page Dan opened was two cards floating in a void: `h-full overflow-y-auto` around a plain
 * `space-y-4` block, so nothing inside was a flex child and nothing could claim the slack. With
 * two clients the content came to ~320px and ~1,100px of the viewport was empty — measured at
 * 284px, 521px and 260px of dead space at 1440, 768 and 390 before this, 24px / 0 / 0 after.
 *
 * The geometry itself is checked by driving `/demo/care` headlessly (there is no way to assert a
 * rendered height from jsdom, which computes no layout). What IS worth pinning here is the pair
 * of constructions that produced the bug and the fix, because both are invisible to tsc, to lint
 * and to `audit:ui`, and both are one careless edit away.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/components/care/care-home.tsx"), "utf8");

describe("Care home fills the page", () => {
  it("the page is a flex column that owns the viewport, not a block", () => {
    // `h-full` alone makes the div the scroller and nothing else. The children have to be flex
    // items of a column for any of them to be able to grow.
    expect(SRC).toMatch(/className="flex h-full min-h-0 w-full flex-col overflow-y-auto/);
    expect(SRC).toMatch(/mx-auto flex min-h-full w-full max-w-6xl flex-col/);
  });

  it("the band grows into spare room", () => {
    expect(SRC).toContain('className="flex flex-1 flex-col gap-4 lg:flex-row"');
  });

  it("⚠️ the band never carries min-h-0", () => {
    /*
     * This is the single edit that re-breaks the page, and nothing else catches it.
     *
     * `flex-1 min-h-0` lets a flex item shrink below its own content. `widget-card` is
     * `overflow: hidden`, so the panels did not become scrollable — they became 2px tall and
     * everything inside them was gone. Measured: both band panels 2px at 1280×620, and the
     * Clients panel 2px at 390, with `audit:clipping` reporting ZERO findings and the page
     * reporting zero overflow, because hidden overflow absorbs both.
     *
     * Without `min-h-0` a flex item's automatic minimum size is its content, so the band grows
     * into spare room, never collapses, and past that the page scrolls.
     */
    const band = SRC.slice(SRC.indexOf("lg:flex-row"));
    const bandOpen = SRC.slice(SRC.lastIndexOf("<div className=", SRC.indexOf("lg:flex-row")), SRC.indexOf("lg:flex-row"));
    expect(bandOpen, "the band div must not carry min-h-0").not.toContain("min-h-0");
    expect(band.slice(0, 2000)).not.toMatch(/className="[^"]*flex-1[^"]*min-h-0[^"]*"\s*>\s*<CarePanel/);
  });

  it("the pairing idiom is the right way round", () => {
    /*
     * The LEADER is "Needs you first", not "Clients" — the opposite of the obvious reading. The
     * leader must be the panel whose height is PREDICTABLE: a fixed handful of rows. "Clients" is
     * two cards today and twenty next year, so if it led, a two-client workspace would collapse
     * the row and we would be back to the void. As the follower its intrinsic height contributes
     * nothing (`lg:h-0`) and it then fills (`lg:min-h-full`).
     */
    expect(SRC).toMatch(/lg:h-full lg:w-\[360px\] lg:shrink-0/);
    expect(SRC).toContain("lg:h-0 lg:min-h-full");
    const leader = SRC.indexOf('title="Needs you first"');
    const follower = SRC.indexOf('title="Clients"');
    expect(leader).toBeGreaterThan(0);
    expect(follower).toBeGreaterThan(leader);
    // `lg:h-0 lg:min-h-full` belongs to the follower, never the leader.
    expect(SRC.slice(leader, follower)).not.toContain("lg:h-0");
  });

  it("a coloured side stroke squares its own corners", () => {
    // DESIGN.md rules out a stroke bending round a radius; `straight-side-stroke.test.ts`
    // enforces it repo-wide, and this says it at the one place Care introduces one.
    const card = SRC.slice(SRC.indexOf("function ClientCard"), SRC.indexOf("function ClientRow"));
    expect(card).toMatch(/rounded-\[10px\] rounded-l-none border border-l-\[3px\]/);
  });

  it("small stale text does not use --warning-500", () => {
    /*
     * `--warning-500` is #D97706 in light, which measures 3.19:1 against `--surface-0` — under AA
     * for the 11px data labels it appeared on. It is right for a bar or a side stroke, where
     * nothing has to be read. DESIGN.md's badge recipe names `text-amber-700` for the readable
     * form, and the amber family is remapped for dark (§131), so it flips.
     */
    expect(SRC).toContain('const STALE_TEXT = "font-semibold text-amber-700"');
    expect(SRC).not.toContain('font-semibold text-[var(--warning-500)]');
  });

  it("the unassigned figure is no longer a headline", () => {
    /*
     * It read 573 beside awaiting's 573, and that is not a coincidence: `unassigned` is a strict
     * SUBSET of `awaiting` (`{...awaiting, assigneeId: null}`), so when nothing is assigned the
     * two are identical by construction. A number that always equals the one beside it says
     * nothing. It is one fact in the readout now, not a 32px figure of its own.
     */
    // lastIndexOf: the same label appears in the file's own header comment above the JSX.
    const hero = SRC.slice(SRC.lastIndexOf("01 // THE DESK"), SRC.lastIndexOf("02\n"));
    expect(hero).toContain("<BigFigure");
    expect(hero.match(/<BigFigure/g)?.length).toBe(1);
    expect(hero).toMatch(/\{totals\.unassigned\} unassigned/);
  });
});
