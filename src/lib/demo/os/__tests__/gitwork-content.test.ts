import { describe, expect, it } from "vitest";
import { CASE_STUDIES, FOUNDRY_PAGES, LAST_20, PLANS } from "../gitwork-content";
import { isDemoHref } from "../window-manager";

// These pin the sales copy to what gitwork.co.uk says (captured 26 Nov 2026). A change
// here should be a deliberate edit from the site, never a rounding or a guess.
describe("Gitwork OS sales copy", () => {
  it("prices match the site", () => {
    expect(Object.fromEntries(PLANS.map((p) => [p.name, p.price]))).toEqual({
      "Launch Pad": "£4,995",
      "MVP Sprint": "£25,000",
      "Greenfield Build": "£5,000",
      "Care Plan": "£1,500",
    });
  });

  it("only the published case-study stats appear", () => {
    const stats = Object.fromEntries(CASE_STUDIES.filter((c) => c.stats.length).map((c) => [c.name, c.stats.map((s) => s.value)]));
    expect(stats).toEqual({
      Wedge: ["80,000+", "4.9★"],
      "Fellas Loaded": ["6", "4.4★"],
      "Kernel Global": ["3", "100s"],
    });
  });

  it("case-study ids are unique", () => {
    const ids = CASE_STUDIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the 'last 20%' card is 4 of 6 done, as on the site", () => {
    expect(LAST_20.filter((i) => i.done)).toHaveLength(4);
    expect(LAST_20).toHaveLength(6);
  });

  it("every Foundry page is a demo page, never the real app", () => {
    for (const p of FOUNDRY_PAGES) expect(isDemoHref(p.href), p.href).toBe(true);
  });
});
