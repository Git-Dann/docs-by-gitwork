import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { careSectionCount, careSectionNumbers } from "@/lib/care-sections";
import { stripComments } from "@/testing/source";

/**
 * Care's panes are one grammar and one numbering sequence.
 *
 * Until Nov 2026 there were four grammars and three of them produced a visibly wrong sequence:
 * Reports showed a lone `02` whenever its first pane was hidden, with an unnumbered card where
 * `01` should have been; Connectors numbered nothing but a hardcoded `02` in a block that was
 * switched off at its only call site; and the cockpit's Settings panel computed the Portal link's
 * number with arithmetic that assumed ConnectorsView contributed one number when it contributed
 * none, so the screen skipped a number on every client.
 *
 * Read from source rather than rendered: these are client components whose imports drag a React
 * tree into a Node test for no benefit, and what is being asserted is the contract between files.
 */

const dir = join(__dirname, "..");

/*
 * ⚠️ Comments are stripped before every assertion.
 *
 * Three of these tests failed on their first run against code that was already correct, because
 * they matched the ⚠️ comments explaining the bug they guard against — `showMode ? 1 : 0`,
 * `showAgentLogs`, "once a day" are all quoted in the fixes. The same thing happened to the
 * Tickets guard an hour earlier. A source-reading test asserts on CODE.
 */

const read = (f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

/*
 * care-home.tsx is deliberately absent: its `01 // THE DESK` is the page's masthead — a hero with
 * a figure and a call to action, not a pane — so it draws the header strip directly. Every other
 * numbered thing in Care is a `CarePanel`.
 */
const VIEWS = ["care-connectors.tsx", "care-reports.tsx", "care-automation.tsx"] as const;

describe("one grammar", () => {
  it.each(VIEWS)("%s hand-rolls no widget header", (file) => {
    // `<div className="widget-header">` or a local `widgetHeader()` helper is the old grammar:
    // three different paddings, none of them the 36px strip DESIGN.md specifies.
    const src = read(file);
    expect(src, `${file} still hand-rolls a widget header`).not.toMatch(/className="widget-header"/);
    expect(src, `${file} still has a local widgetHeader helper`).not.toMatch(/const widgetHeader = /);
  });

  it("a view with a pane that can be hidden numbers from the helper, not a literal", () => {
    /*
     * This is the rule, stated exactly: a literal number is honest when every pane around it is
     * unconditional, and wrong the moment one can be hidden — which is how Reports came to show a
     * lone `02`. So it is asserted on the views that HAVE a conditional pane, not on every file.
     *
     * `ReportBuilder` (seven unconditional panes in its own full-screen sub-view) and
     * `care-home.tsx`'s three keep their literals, and are correct.
     */
    const reportsView = read("care-reports.tsx").split("export function ReportsView")[1];
    expect(reportsView, "ReportsView hardcodes a pane number").not.toMatch(/number="\d\d"/);
    expect(reportsView).toContain("careSectionNumbers([hasAllocation, true, true])");

    const connectors = read("care-connectors.tsx");
    expect(connectors, "ConnectorsView hardcodes a pane number").not.toMatch(/number="\d\d"/);
    expect(connectors).toContain("careSectionNumbers([true, true], firstNumber)");

    const agents = read("care-automation.tsx");
    expect(agents).toContain("careSectionNumbers([true, connections.length > 0, agentLogs.length > 0], firstNumber)");
  });
});

describe("the Settings panel is one sequence", () => {
  const cockpit = read("client-cockpit.tsx");

  it("does not compute the Portal link's number by hand", () => {
    /*
     * The exact expression that was wrong:
     *   number={(showMode ? 1 : 0) + (showCourseMode ? 1 : 0) + 2}
     * It assumed ConnectorsView contributed exactly one number. It contributed none, because its
     * only numbered block was switched off right there by `showAgentLogs={false}`.
     */
    expect(cockpit).not.toMatch(/showMode \? 1 : 0/);
    expect(cockpit).toContain("careSectionNumbers([showMode, showCourseMode])");
    expect(cockpit).toContain("connectorsFirst + CONNECTOR_SECTION_COUNT");
  });

  it("ConnectorsView is told where the sequence has got to", () => {
    expect(cockpit).toMatch(/firstNumber=\{connectorsFirst\}/);
    // The prop that hid the one numbered block is gone, with the block.
    expect(cockpit).not.toContain("showAgentLogs");
  });

  it("CONNECTOR_SECTION_COUNT matches what the view actually renders", () => {
    /*
     * The constant is what the Settings panel carries on from, so a pane added to or removed from
     * ConnectorsView without updating it would silently skip or repeat a number — which is the
     * original bug. Both of its panes render unconditionally (a client with no connectors gets an
     * empty state, not a hidden pane), so counting them is exact.
     */
    const src = read("care-connectors.tsx");
    const declared = Number(src.match(/CONNECTOR_SECTION_COUNT = (\d+)/)?.[1]);
    const rendered = (src.match(/<CarePanel\b/g) ?? []).length;
    expect(declared).toBe(rendered);
    expect(declared).toBeGreaterThan(0);
  });
});

describe("the sequence the Settings panel actually produces", () => {
  /*
   * The regression, stated as the numbers a reader sees. Before this, both switches on gave
   * 01, 02, (nothing), 04 — the screen skipped 03.
   */
  const sequence = (showMode: boolean, showCourse: boolean) => {
    const num = careSectionNumbers([showMode, showCourse]);
    const connectorsFirst = careSectionCount([showMode, showCourse]) + 1;
    const connectors = careSectionNumbers([true, true], connectorsFirst);
    const portal = String(connectorsFirst + 2).padStart(2, "0");
    return [...num.filter(Boolean), ...connectors, portal];
  };

  it.each([
    [true, true, ["01", "02", "03", "04", "05"]],
    [true, false, ["01", "02", "03", "04"]],
    [false, false, ["01", "02", "03"]],
  ])("mode=%s course=%s → %j", (showMode, showCourse, expected) => {
    expect(sequence(showMode as boolean, showCourse as boolean)).toEqual(expected);
  });

  it("never skips or repeats, whatever is hidden", () => {
    for (const showMode of [true, false]) {
      for (const showCourse of [true, false]) {
        const seq = sequence(showMode, showCourse).map(Number);
        expect(seq).toEqual(seq.map((_, i) => i + 1));
      }
    }
  });
});

describe("the three section views load when their section is opened", () => {
  it("none of them is statically imported by the cockpit", () => {
    // All three are behind the section nav and mutually exclusive at runtime; Connectors alone is
    // ~2,200 lines with two ~795-line modals, and every one of them shipped on every load.
    const cockpit = read("client-cockpit.tsx");
    for (const name of ["ConnectorsView", "ReportsView", "CareAutomationView", "PortalLinkCard"]) {
      expect(cockpit, `${name} should be dynamic`).toMatch(
        new RegExp(`const ${name} = dynamic\\(`),
      );
    }
    expect(cockpit).not.toMatch(/^import \{[^}]*\bReportsView\b/m);
    expect(cockpit).not.toMatch(/^import \{[^}]*\bCareAutomationView\b/m);
  });
});

describe("the screen does not lie about the sync schedule", () => {
  it("names both runs the crontab actually has", () => {
    // It said "once a day, at 08:00 UTC". deploy/crontab has run support-sync at 08:00 AND 13:00
    // since §132 put the schedule in the repo.
    const crontab = readFileSync(join(process.cwd(), "deploy/crontab"), "utf8");
    const line = crontab.split("\n").find((l) => l.includes("support-sync"));
    expect(line, "support-sync is not in deploy/crontab").toBeTruthy();
    const hours = line!.split(" ")[1];
    const src = read("care-connectors.tsx");
    for (const hour of hours.split(",")) {
      expect(src, `the screen does not mention ${hour}:00`).toContain(`${hour.padStart(2, "0")}:00`);
    }
    expect(src).not.toContain("once a day");
  });
});
