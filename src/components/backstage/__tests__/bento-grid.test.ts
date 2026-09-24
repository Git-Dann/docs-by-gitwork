import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Backstage bento row must be exactly full at EVERY permission level.
 *
 * Two of its four cards are gated — Expenses is Super Admin, Handover is Admin —
 * so a hard-coded column count leaves a hole for everybody else, which is the
 * gap the house card-grid rule exists to prevent. The column count follows the
 * units that actually render, and Team counts as two because it spans two.
 *
 * Source assertions: this is a "use client" component whose imports drag a React
 * tree into a node test for no benefit, and the property under test is a class
 * string, not behaviour.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const overview = stripComments(read("src/components/backstage/backstage-overview.tsx"));
const team = stripComments(read("src/components/backstage/team-card.tsx"));

/** The units formula, mirrored from the component so the arithmetic is testable. */
function units(opts: { canManageExpenses: boolean; isAdmin: boolean }): number {
  return 1 + 2 + (opts.canManageExpenses ? 1 : 0) + (opts.isAdmin ? 1 : 0);
}

describe("backstage bento — the row is exactly full", () => {
  it("every permission level lands on a whole number of columns with a class to match", () => {
    const levels = [
      { name: "super admin", canManageExpenses: true, isAdmin: true, expected: 5 },
      { name: "admin", canManageExpenses: false, isAdmin: true, expected: 4 },
      { name: "staff", canManageExpenses: false, isAdmin: false, expected: 3 },
    ];
    for (const level of levels) {
      expect(units(level), level.name).toBe(level.expected);
      // ⚠️ Tailwind only emits classes it can find as LITERAL TEXT. A computed
      // `xl:grid-cols-${n}` compiles fine and produces no CSS, so the grid would
      // silently fall back to two columns — invisible to tsc and to lint.
      expect(overview, `${level.name} needs xl:grid-cols-${level.expected}`).toContain(
        `xl:grid-cols-${level.expected}`,
      );
    }
  });

  it("the component computes units the same way this test does", () => {
    expect(overview).toMatch(
      /const units = 1 \+ 2 \+ \(canManageExpenses \? 1 : 0\) \+ \(isAdmin \? 1 : 0\);/,
    );
  });

  it("the column count is driven by the map, not written inline", () => {
    expect(overview).toContain("${XL_COLS[units]}");
  });

  it("Team spans two columns, and only from xl", () => {
    // Below xl the grid is two columns and every card is one unit, so four cards
    // make a clean 2x2. Spanning there pushes Team onto its own row and leaves a
    // hole beside Leave.
    expect(team).toContain("xl:col-span-2");
    expect(team).not.toContain("sm:col-span-2");
    expect(team).not.toContain("lg:col-span-2");
  });

  /**
   * ⚠️ Found by MEASURING, not by reasoning: at 768px an Admin who is not a
   * Super Admin renders three cards into a two-column grid and the last row came
   * up 374px short. The card count is not the unit count — Team is two units and
   * one card — so the odd/even sum is its own.
   */
  it("an odd number of cards fills its row between sm and xl", () => {
    const counts = [
      { name: "super admin", canManageExpenses: true, isAdmin: true, cards: 4 },
      { name: "admin", canManageExpenses: false, isAdmin: true, cards: 3 },
      { name: "staff", canManageExpenses: false, isAdmin: false, cards: 2 },
    ];
    for (const c of counts) {
      const cards = 2 + (c.canManageExpenses ? 1 : 0) + (c.isAdmin ? 1 : 0);
      expect(cards, c.name).toBe(c.cards);
    }
    expect(overview).toMatch(
      /const cardCount = 2 \+ \(canManageExpenses \? 1 : 0\) \+ \(isAdmin \? 1 : 0\);/,
    );
    expect(overview).toContain("sm:max-xl:[&>*:last-child]:col-span-2");
    // `max-xl` is load-bearing: without it the span survives into the five-column
    // row and breaks the exact fit it exists to protect.
    expect(overview).not.toMatch(/(?<!max-xl:)\[&>\*:last-child\]:col-span-2/);
    expect(overview).toContain("${fillOddRow}");
  });

  it("the grid still stacks on a phone and pairs at sm", () => {
    expect(overview).toContain("grid-cols-1");
    expect(overview).toContain("sm:grid-cols-2");
  });
});
