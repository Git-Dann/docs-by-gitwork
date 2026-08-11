import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

describe("production font build reliability", () => {
  it("self-hosts Fraunces instead of fetching it during next build", () => {
    const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(layout).not.toMatch(/\bFraunces\b[^;]*from\s+["']next\/font\/google["']/);
    expect(packageJson.dependencies?.["@fontsource-variable/fraunces"]).toBeTruthy();
    expect(globals).toContain('@import "@fontsource-variable/fraunces/wght.css"');
    expect(globals).toContain('@import "@fontsource-variable/fraunces/wght-italic.css"');
    expect(globals).toMatch(/--font-fraunces:\s*"Fraunces Variable"/);
  });
});
