import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CATEGORIES, ORDERED_CATEGORIES } from "../categories";
import { PLATFORM_VALIDATION_PROFILES, PULSE_VERIFICATION_CONTROLS } from "../standards-verification";
import {
  PLATFORM_CATEGORY_APPLICABILITY,
  PLATFORM_STANDARDS_APPLICABILITY,
  SUPPORTED_STANDARDS_AREAS,
  SUPPORTED_PULSE_PLATFORMS,
  detectUrlSurfaceKind,
  getInapplicableCategories,
  standardsAreaForControl,
} from "../platform-applicability";

describe("platform applicability contract", () => {
  it("covers every platform offered by Pulse", () => {
    expect([...SUPPORTED_PULSE_PLATFORMS].sort()).toEqual(
      PLATFORM_VALIDATION_PROFILES.map(([id]) => id).sort(),
    );

    const formSource = readFileSync("src/components/pulse/pulse-new-scan-form.tsx", "utf8");
    const formPlatforms = [...formSource.matchAll(/\{ value: "([A-Z_]+)", label:/g)]
      .map((match) => match[1])
      .filter((value) => value !== "URL" && value !== "GITHUB_REPO" && value !== "FREE_TEXT");
    expect([...new Set(formPlatforms)].sort()).toEqual([...SUPPORTED_PULSE_PLATFORMS].sort());
  });

  it("makes an explicit applicability decision for every category on every platform", () => {
    for (const platform of SUPPORTED_PULSE_PLATFORMS) {
      expect(Object.keys(PLATFORM_CATEGORY_APPLICABILITY[platform]).sort()).toEqual(
        [...ORDERED_CATEGORIES].sort(),
      );
    }
  });

  it("makes an explicit decision for every evidence-control area on every platform", () => {
    const catalogAreas = [...new Set(PULSE_VERIFICATION_CONTROLS.map((control) =>
      standardsAreaForControl(`standards_${control.id}`),
    ))].filter(Boolean).sort();
    expect(catalogAreas).toEqual([...SUPPORTED_STANDARDS_AREAS].sort());

    for (const platform of SUPPORTED_PULSE_PLATFORMS) {
      expect(Object.keys(PLATFORM_STANDARDS_APPLICABILITY[platform]).sort()).toEqual(
        [...SUPPORTED_STANDARDS_AREAS].sort(),
      );
    }
  });

  it("recognises self-contained bundled prototypes without hostname special-casing", () => {
    const html = `<!doctype html><title>Bundled Page</title>
      <script type="__bundler/manifest">{}</script>
      <script type="__bundler/template">"<main>Prototype</main>"</script>`;

    expect(detectUrlSurfaceKind(html)).toBe("BUNDLED_PROTOTYPE");
    expect(detectUrlSurfaceKind("<!doctype html><main>Production app</main>")).toBe("DEPLOYED_PRODUCT");
  });

  it("recognises access interstitials instead of analysing them as the product", () => {
    const html = `<!doctype html><html><head><title>Vercel Security Checkpoint</title></head>
      <body><p>We're verifying your browser</p><p>Enable JavaScript to continue</p></body></html>`;

    expect(detectUrlSurfaceKind(html)).toBe("ACCESS_INTERSTITIAL");
  });

  it("does not run operational product families against a bundled prototype", () => {
    const skipped = getInapplicableCategories("WEB_APP", "BUNDLED_PROTOTYPE");

    expect(skipped).toEqual(expect.arrayContaining([
      CATEGORIES.AUTHENTICATION,
      CATEGORIES.PAYMENTS,
      CATEGORIES.SAAS,
      CATEGORIES.ROLES,
      CATEGORIES.EMAIL,
      CATEGORIES.BUSINESS_OPS,
      CATEGORIES.API_QUALITY,
      CATEGORIES.AI_READINESS,
      CATEGORIES.AI_SAFETY,
    ]));
    expect(skipped).not.toContain(CATEGORIES.INFRASTRUCTURE);
    expect(skipped).not.toContain(CATEGORIES.SECURITY);
    expect(skipped).not.toContain(CATEGORIES.PERFORMANCE);
    expect(skipped).not.toContain(CATEGORIES.ACCESSIBILITY);
  });

  it("falls unknown platform values back to the conservative OTHER profile", () => {
    expect(getInapplicableCategories("future_platform", "DEPLOYED_PRODUCT")).toEqual(
      getInapplicableCategories("OTHER", "DEPLOYED_PRODUCT"),
    );
  });
});
