import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

describe("production font build reliability", () => {
  it("self-hosts every font instead of fetching from Google during next build", () => {
    const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(layout).not.toContain("next/font/google");

    const requiredPackages = [
      "@fontsource-variable/archivo",
      "@fontsource-variable/caveat",
      "@fontsource-variable/dancing-script",
      "@fontsource-variable/fraunces",
      "@fontsource-variable/inter",
      "@fontsource-variable/jetbrains-mono",
      "@fontsource-variable/manrope",
      "@fontsource-variable/montserrat",
      "@fontsource-variable/playfair-display",
      "@fontsource-variable/sora",
      "@fontsource-variable/space-grotesk",
      "@fontsource/dm-serif-display",
      "@fontsource/great-vibes",
      "@fontsource/poppins",
    ];

    for (const packageName of requiredPackages) {
      expect(packageJson.dependencies?.[packageName], packageName).toBeTruthy();
      expect(globals, packageName).toContain(`@import "${packageName}/`);
    }

    for (const variable of [
      "--font-sans",
      "--font-display",
      "--font-mono",
      "--font-caveat",
      "--font-dancing-script",
      "--font-great-vibes",
      "--font-fraunces",
      "--font-playfair",
      "--font-poppins",
      "--font-montserrat",
      "--font-space-grotesk",
      "--font-manrope",
      "--font-archivo",
      "--font-sora",
    ]) {
      expect(globals, variable).toMatch(new RegExp(`${variable}:\\s*"`));
    }
  });
});
