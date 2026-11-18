import { describe, expect, it } from "vitest";
import { PORTAL_SECTIONS, portalSectionNumbers } from "../client-portal-layout";

describe("Portal card numbers", () => {
  it("run 02, 03, 04… in page order when everything is shown", () => {
    const n = portalSectionNumbers(() => true);
    expect(PORTAL_SECTIONS.map((k) => n[k])).toEqual(PORTAL_SECTIONS.map((_, i) => String(i + 2).padStart(2, "0")));
  });

  it("a hidden card leaves no gap", () => {
    const hidden = new Set(["statPulse", "billing", "pulse", "proof"]);
    const n = portalSectionNumbers((k) => !hidden.has(k));
    const shown = PORTAL_SECTIONS.filter((k) => !hidden.has(k)).map((k) => Number(n[k]));
    expect(shown).toEqual(shown.map((_, i) => i + 2));
    expect(n.billing).toBe("");
    expect(n.platforms).toBe("08");
  });
});
