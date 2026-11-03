import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AREA_GROUPS } from "@/lib/pulse-capabilities";
import { EXAMPLE_SCANS, SECTION_EXAMPLES, exampleScore, weeksToClear, type PillarKey } from "@/lib/pulse-examples";
import { PILLARS } from "@/server/pulse-checks/pillars";
import PulseFeaturesPage from "@/app/pulse/features/page";

const weights = Object.fromEntries(PILLARS.map((p) => [p.key, p.weight])) as Record<PillarKey, number>;

describe("the example results stay honest", () => {
  it("are labelled as example data on the page", () => {
    const html = renderToStaticMarkup(<PulseFeaturesPage />);
    expect(html).toContain("Example data");
    expect(html).toMatch(/example results, not a client/i);
  });

  it("use exactly the pillars the scan uses", () => {
    for (const s of EXAMPLE_SCANS) expect(Object.keys(s.pillars).sort()).toEqual(PILLARS.map((p) => p.key).sort());
  });

  it("weight the overall score as the scan does, sharing out a pillar that does not apply", () => {
    expect(exampleScore({ security: 100, access: 0, code: 0, reliability: 0, legal: 0, experience: 0 }, weights)).toBe(30);
    expect(exampleScore({ security: 80, access: 80, code: null, reliability: 80, legal: 80, experience: 80 }, weights)).toBe(80);
  });

  it("never show a ready verdict beside a failing finding", () => {
    for (const s of EXAMPLE_SCANS) if (s.findings.some((f) => f.status === "FAIL")) expect(s.verdict, s.id).not.toBe("Ready");
  });

  it("give every section of the explorer an example", () => {
    for (const g of AREA_GROUPS) expect(SECTION_EXAMPLES[g.id], g.id).toBeDefined();
  });

  it("turn days of debt into whole weeks for the team size on the slider", () => {
    expect(weeksToClear(69, 1)).toBe(14);
    expect(weeksToClear(69, 3)).toBe(5);
    expect(weeksToClear(1, 6)).toBe(1);
  });

  it("render the finished values without JavaScript (no blank chart in a screenshot or PDF)", () => {
    const html = renderToStaticMarkup(<PulseFeaturesPage />);
    const first = EXAMPLE_SCANS[0];
    expect(html).toContain(`>${exampleScore(first.pillars, weights)}<`);
  });
});
