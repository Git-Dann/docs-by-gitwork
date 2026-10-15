import { describe, it, expect } from "vitest";
import { selectFilesToRead } from "../native-repo";

describe("config cap prioritises platform config (immich monorepo)", () => {
  it("reads mobile/analysis_options.yaml and pubspec.yaml even when i18n fills the cap", () => {
    const locales = Array.from({ length: 100 }, (_, i) => ({ path: `i18n/l${String(i).padStart(3, "0")}.json`, size: 2000 }));
    const entries = [
      { path: ".github/workflows/build-mobile.yml", size: 500 },
      ...locales,
      { path: "mobile/analysis_options.yaml", size: 300 },
      { path: "mobile/android/app/build.gradle", size: 3000 },
      { path: "mobile/pubspec.yaml", size: 4000 },
      { path: "mobile/lib/main.dart", size: 4000 },
    ];
    const { config } = selectFilesToRead(entries, "flutter");
    expect(config.length).toBeLessThanOrEqual(60);
    expect(config).toContain("mobile/analysis_options.yaml");
    expect(config).toContain("mobile/pubspec.yaml");
    expect(config).toContain("mobile/android/app/build.gradle");
    expect(config).toContain(".github/workflows/build-mobile.yml");
  });

  it("does not starve CI workflows in a monorepo with more platform config files than the cap", () => {
    const packages = Array.from({ length: 25 }, (_, i) => [
      { path: `packages/p${i}/pubspec.yaml`, size: 400 },
      { path: `packages/p${i}/pubspec.lock`, size: 4000 },
      { path: `packages/p${i}/analysis_options.yaml`, size: 200 },
    ]).flat();
    const entries = [...packages, { path: ".github/workflows/ci.yml", size: 500 }];
    const { config } = selectFilesToRead(entries, "flutter");
    expect(config.length).toBeLessThanOrEqual(60);
    expect(config).toContain(".github/workflows/ci.yml");
  });

  it("leaves a small non-mobile repo's config list unchanged", () => {
    const entries = [
      { path: ".github/workflows/ci.yml", size: 400 },
      { path: "README.md", size: 900 },
      { path: "package.json", size: 700 },
    ];
    expect(selectFilesToRead(entries, "none").config).toEqual([".github/workflows/ci.yml", "README.md", "package.json"]);
  });
});

describe("renderer index.html is read for desktop shapes only", () => {
  it("reads the renderer index.html for electron, but not arbitrary HTML", () => {
    const { config } = selectFilesToRead(
      [
        { path: "static/index.html", size: 1200 },
        { path: "docs/guide/page.html", size: 1200 },
        { path: "package.json", size: 800 },
      ],
      "electron",
    );
    expect(config).toContain("static/index.html");
    expect(config).not.toContain("docs/guide/page.html");
  });

  it("reads src/index.html for tauri", () => {
    const { config } = selectFilesToRead([{ path: "src/index.html", size: 900 }], "tauri");
    expect(config).toContain("src/index.html");
  });

  it("does not leak HTML into a non-desktop shape's input", () => {
    for (const shape of ["none", "flutter", "cli"] as const) {
      const { config } = selectFilesToRead(
        [
          { path: "index.html", size: 500 },
          { path: "src/index.html", size: 500 },
        ],
        shape,
      );
      expect(config).not.toContain("index.html");
      expect(config).not.toContain("src/index.html");
    }
  });

  it("caps renderer HTML entries at 5 in a monorepo", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ path: `pkg${i}/src/index.html`, size: 500 }));
    const { config } = selectFilesToRead(entries, "electron");
    expect(config.filter((p) => p.endsWith("index.html")).length).toBeLessThanOrEqual(5);
    expect(config.filter((p) => p.endsWith("index.html")).length).toBeGreaterThan(0);
  });
});
