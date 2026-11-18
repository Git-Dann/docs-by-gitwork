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

import { cardBasis, cardsPerRow } from "@/lib/client-portal-layout";

describe("cards per row", () => {
  it("never leaves a hole on the last row for 1–8 cards", () => {
    for (let n = 1; n <= 8; n++) {
      const per = cardsPerRow(n);
      const last = n % per || per;
      // The last row is either full, or at least half full (its cards then stretch to fill it).
      expect(last * 2).toBeGreaterThanOrEqual(per);
    }
    expect(cardsPerRow(5)).toBe(3);
    expect(cardsPerRow(4)).toBe(4);
  });

  it("works out the basis with the gaps taken off", () => {
    expect(cardBasis(3, 8)).toBe("calc((100% - 16px) / 3)");
    expect(cardBasis(1, 8)).toBe("calc((100% - 0px) / 1)");
  });
});
