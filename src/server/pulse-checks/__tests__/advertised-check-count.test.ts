import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADVERTISED_CHECK_COUNT, ADVERTISED_CHECK_COUNT_LABEL, CHECKS_REGISTRY } from "@/server/checks-registry";

// ─────────────────────────────────────────────────────────────────────────────
// The same product was simultaneously advertised as "150+", "450+", "500+",
// "900" and "100+ checks" across /context, /pulse-overview, the OG image, the
// embed widget and the results email a visitor actually receives — against a real
// registry of 1,646. The email was the worst: it understated by 16x.
//
// I also mis-reported the registry size myself, because `grep -c 'key: "'` finds
// 1,099 of 1,646 entries — different formatting in the rest. Hence: derive it,
// never count it by hand.
// ─────────────────────────────────────────────────────────────────────────────

describe("the advertised count is derived and can only understate", () => {
  it("rounds down to the nearest hundred", () => {
    expect(ADVERTISED_CHECK_COUNT % 100).toBe(0);
    expect(ADVERTISED_CHECK_COUNT).toBeLessThanOrEqual(CHECKS_REGISTRY.length);
  });

  it("is never a wild understatement either", () => {
    expect(CHECKS_REGISTRY.length - ADVERTISED_CHECK_COUNT).toBeLessThan(100);
  });

  it("formats with a thousands separator", () => {
    expect(ADVERTISED_CHECK_COUNT_LABEL).toMatch(/^over [\d,]+$/);
  });

  it("has no duplicate check keys in the registry", () => {
    const keys = CHECKS_REGISTRY.map((c) => c.key);
    expect(keys.length - new Set(keys).size).toBe(0);
  });
});

describe("no surface hardcodes a stale count", () => {
  const FILES = [
    "src/app/pulse-overview/page.tsx",
    "src/app/pulse-overview/opengraph-image.tsx",
    "src/app/context/page.tsx",
    "src/server/pulse-lite/leads.ts",
  ];

  for (const f of FILES) {
    it(`${f} derives its figure`, () => {
      const src = readFileSync(f, "utf8");
      // Any "<number>+ checks" or "<number> automated checks" literal is drift.
      const literals = [...src.matchAll(/\b(\d{2,4})\+?\s+(?:automated\s+)?checks\b/gi)]
        .map((m) => m[0])
        // A per-scan figure is a different, legitimate quantity — see llms.txt note.
        .filter((t) => !/per scan/i.test(t));
      expect(literals, `hardcoded count in ${f}`).toEqual([]);
      expect(src).toContain("ADVERTISED_CHECK_COUNT_LABEL");
    });
  }

  it("llms.txt states the catalogue size, not a stale one", () => {
    const txt = readFileSync("public/llms.txt", "utf8");
    const m = txt.match(/over ([\d,]+)\s*\n?\s*automated checks/);
    expect(m, "llms.txt should advertise the catalogue size").not.toBeNull();
    const claimed = Number(m![1].replace(/,/g, ""));
    // Static file, so it cannot import the constant — but it must not overstate,
    // and must not fall more than a hundred behind.
    expect(claimed).toBeLessThanOrEqual(CHECKS_REGISTRY.length);
    expect(CHECKS_REGISTRY.length - claimed).toBeLessThan(200);
  });
});
