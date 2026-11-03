import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadCvAssets, resetCvAssetsCache } from "../cv-assets";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("CV assets", () => {
  it("inlines all four Document System families", async () => {
    resetCvAssetsCache();
    const assets = await loadCvAssets();
    expect(assets.fontFacesLoaded).toBe(5); // Fraunces has two cuts.
    for (const family of ["Fraunces", "Inter", "JetBrains Mono", "Playfair Display"]) {
      expect(assets.fontCss, family).toContain(`font-family:"${family}"`);
    }
    expect(assets.fontCss).toContain("url(data:font/woff2;base64,");
  });

  it("inlines the Gitwork mark", async () => {
    resetCvAssetsCache();
    const assets = await loadCvAssets();
    expect(assets.markDataUri?.startsWith("data:image/png;base64,")).toBe(true);
  });

  /**
   * ⚠️ `output: "standalone"` prunes node_modules to what Next's tracer can see,
   * and a woff2 opened with `readFile` at runtime is invisible to it. Without this
   * entry the route ships without its fonts and every heading renders in Times —
   * silently, in production only. Nothing else can catch that before deploy.
   */
  it("next.config.ts traces the font files into this route", () => {
    const config = read("next.config.ts");
    const key = '"/api/codeclear/candidates/*/cv"';
    expect(config).toContain(key);
    const block = config.slice(config.indexOf(key), config.indexOf("]", config.indexOf(key)) + 1);
    for (const pkg of ["fraunces", "inter", "jetbrains-mono", "playfair-display"]) {
      expect(block, pkg).toContain(`@fontsource-variable/${pkg}/files/`);
    }
    // Chromium's binary pack is loaded by a computed path and needs the same
    // treatment as the other three PDF routes.
    expect(block).toContain("@sparticuz/chromium");
  });

  /**
   * ⚠️ The test above only proves the config SAYS the right thing. A glob with a
   * typo'd path reads perfectly and traces nothing, which is the same silent
   * Times-font failure — the first version of this file asserted only the text and
   * would have passed on a broken pattern. This resolves each font glob against
   * the filesystem, which catches the realistic mistake without needing a build.
   *
   * The remaining gap is honest and unavoidable here: only `npx next build` shows
   * what Next actually traced (`.next/server/**\/route.js.nft.json` lists it).
   */
  it("every font glob in that entry matches at least one real file", () => {
    const config = read("next.config.ts");
    const key = '"/api/codeclear/candidates/*/cv"';
    const block = config.slice(config.indexOf(key), config.indexOf("]", config.indexOf(key)) + 1);
    const globs = [...block.matchAll(/"\.\/(node_modules\/@fontsource-variable\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(globs.length).toBe(4);
    for (const g of globs) {
      const dir = g.slice(0, g.lastIndexOf("/"));
      const pattern = g.slice(g.lastIndexOf("/") + 1);
      const re = new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/\*/g, ".*")}$`);
      const hits = readdirSync(join(process.cwd(), dir)).filter((f) => re.test(f));
      expect(hits.length, g).toBeGreaterThan(0);
    }
  });

  it("the faces it reads are the ones globals.css already self-hosts", () => {
    // If a font were added here but not imported by the app, the in-app preview
    // and the PDF could drift apart.
    const css = read("src/app/globals.css");
    for (const pkg of ["fraunces", "inter", "jetbrains-mono", "playfair-display"]) {
      expect(css, pkg).toContain(`@fontsource-variable/${pkg}/`);
    }
  });
});
