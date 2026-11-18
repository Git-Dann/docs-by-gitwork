import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { siFigma, siGithub, siMiro } from "simple-icons";
import { PlatformMark, brandFill, contrastRatio, detectPlatformMark } from "@/lib/platform-icons";

describe("platform marks", () => {
  it("uses the official mark for a known host, matched exactly or as a subdomain", () => {
    const figma = detectPlatformMark("https://www.figma.com/design/abc");
    expect(figma.kind === "brand" && figma.icon.path).toBe(siFigma.path);
    const miro = detectPlatformMark("miro.com/app/board/x");
    expect(miro.kind === "brand" && miro.icon.path).toBe(siMiro.path);
    expect(detectPlatformMark("https://apps.apple.com/gb/app/x/id1").label).toBe("App Store");
    expect(detectPlatformMark("https://play.google.com/store/apps/details?id=x").label).toBe("Google Play");
  });

  it("never matches a host by substring", () => {
    expect(detectPlatformMark("https://figma.com.evil.test/x").label).toBe("Website");
    expect(detectPlatformMark("https://notgithub.com/x").label).toBe("Website");
  });

  it("falls back to a generic icon where there is no official mark, and never invents one", () => {
    const slack = detectPlatformMark("https://app.slack.com/client/T1");
    expect(slack.kind).toBe("generic");
    expect(detectPlatformMark("https://www.amazon.co.uk/dp/x").kind).toBe("generic");
    expect(detectPlatformMark(null, "API").label).toBe("API");
    expect(detectPlatformMark(null, "WORDPRESS").kind).toBe("brand");
  });

  it("draws the brand colour only where it reads on both themes, otherwise the mono mark", () => {
    // GitHub's near-black disappears on the dark ground, so it goes mono.
    expect(brandFill(siGithub.hex)).toBeNull();
    const figma = brandFill(siFigma.hex);
    expect(figma).toBe(`#${siFigma.hex}`);
    // Whatever it picks clears 3:1 against both grounds.
    const hex = siFigma.hex;
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(contrastRatio(rgb, [0xf5, 0xf5, 0xf4])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(rgb, [0x1e, 0x1e, 0x20])).toBeGreaterThanOrEqual(3);
  });

  it("renders the official path at its own proportions, labelled", () => {
    const html = renderToStaticMarkup(<PlatformMark url="https://github.com/acme/app" />);
    expect(html).toContain(siGithub.path);
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain('fill="currentColor"');
  });

  it("carries no hand-drawn logo paths of its own", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/platform-icons.tsx"), "utf8");
    expect(src).not.toMatch(/<path\s+d="/);
    const page = readFileSync(path.join(process.cwd(), "src/components/clients/client-detail.tsx"), "utf8");
    expect(page).not.toMatch(/fill="#(E01E5A|36C5F0|2EB67D|ECB22E)"/);
  });
});
