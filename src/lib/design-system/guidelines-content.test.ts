import { describe, expect, it } from "vitest";

import type { DesignTokens } from "@/types/design-tokens";
import { generateGuidelinesContent } from "./guidelines-content";

// ── fixtures ──────────────────────────────────────────────────────────────────
// Two contrasting brands (a dark/serif house and a light/sans one) plus a minimal
// colours-and-typography-only brand. Deterministic — no dates or randomness.

const darkSerif: DesignTokens = {
  clientName: "Obsidian Press",
  version: "2.0",
  generatedAt: "2026-01-15T00:00:00.000Z",
  brandVoice: "Considered words, built to last.",
  colours: {
    primary: [
      { name: "Ink Black", hex: "#0B0F19", role: "primary", usage: "Headers, primary buttons and key emphasis" },
    ],
    secondary: [{ name: "Bronze", hex: "#8A6A3B", role: "accent", usage: "Accents and links" }],
    neutrals: [
      { name: "Slate", hex: "#3A3F4B", role: "neutral", usage: "Body text and borders" },
      { name: "Fog", hex: "#E9EAED", role: "neutral", usage: "Backgrounds and cards" },
    ],
  },
  gradients: [{ name: "Dusk", css: "linear-gradient(135deg, #0B0F19, #3A3F4B)", usage: "Hero band" }],
  typography: {
    displayFont: "Canela",
    bodyFont: "Söhne",
    systemFallback: "Georgia, serif",
    monoFont: "Söhne Mono",
    scale: [
      { role: "display", fontFamily: "Canela", fontWeight: 400, fontSize: "40px", lineHeight: 1.05 },
      { role: "body", fontFamily: "Söhne", fontWeight: 400, fontSize: "16px", lineHeight: 1.5 },
    ],
  },
  spacing: { base: 8, scale: { "1": "8px", "2": "16px" } },
  radius: { none: "0px", sm: "2px", md: "4px", lg: "4px", full: "9999px" },
  shadows: [{ name: "sm", css: "0 1px 2px rgba(0,0,0,0.1)", usage: "Cards" }],
  buttons: [
    { name: "Primary", background: "#0B0F19", textColour: "#FFFFFF", surfaces: ["light"] },
    { name: "Ghost", background: "transparent", textColour: "#0B0F19", surfaces: ["light"] },
  ],
  logoRules: {
    clearSpace: "Half the logomark height.",
    minSizes: { horizontal: "24px", logomark: "16px" },
    colourRules: [
      { surface: "light", logoVersion: "full-colour logo" },
      { surface: "dark", logoVersion: "white logo" },
    ],
    rules: ["Do not rotate the logo", "Do not add a drop shadow"],
  },
  cssVariables: ":root { --colour-primary: #0B0F19; }",
};

const lightSans: DesignTokens = {
  clientName: "Sunlite",
  version: "1.0",
  generatedAt: "2026-02-01T00:00:00.000Z",
  brandVoice: "Bright, friendly, effortless.",
  colours: {
    primary: [{ name: "Sky Blue", hex: "#2F80ED", role: "primary", usage: "Buttons, links and highlights" }],
    secondary: [{ name: "Coral", hex: "#FF6B6B", role: "accent", usage: "Playful accents" }],
    neutrals: [
      { name: "Cloud", hex: "#F5F7FA", role: "neutral", usage: "Page backgrounds" },
      { name: "Graphite", hex: "#4A4A4A", role: "neutral", usage: "Body text" },
    ],
  },
  gradients: [],
  typography: {
    displayFont: "Poppins",
    bodyFont: "Inter",
    systemFallback: "system-ui, sans-serif",
    scale: [{ role: "body", fontFamily: "Inter", fontWeight: 400, fontSize: "16px", lineHeight: 1.5 }],
  },
  spacing: { base: 4, scale: { "1": "4px" } },
  radius: { sm: "8px", md: "8px", lg: "16px" },
  shadows: [],
  buttons: [{ name: "Primary", background: "#2F80ED", textColour: "#FFFFFF", surfaces: ["light"] }],
  cssVariables: ":root {}",
};

// Only colours + typography carry real content; everything else is empty.
const minimal: DesignTokens = {
  clientName: "Minimal Co",
  version: "1.0",
  generatedAt: "",
  colours: {
    primary: [{ name: "Indigo", hex: "#3F51B5", role: "primary", usage: "Primary actions" }],
    secondary: [],
    neutrals: [],
  },
  gradients: [],
  typography: {
    displayFont: "Arial",
    bodyFont: "Arial",
    systemFallback: "sans-serif",
    scale: [],
  },
  spacing: { base: 8, scale: {} },
  radius: {},
  shadows: [],
  buttons: [],
  cssVariables: "",
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe("generateGuidelinesContent", () => {
  it("populates every block for a full token set with no absent-group references", () => {
    const content = generateGuidelinesContent(darkSerif);

    expect(content.brandName).toBe("Obsidian Press");
    expect(content.tagline).toBe("Considered words, built to last.");
    expect(content.intro).toContain("Obsidian Press");

    const b = content.sectionBlurbs;
    expect(b.logo).toBeDefined();
    expect(b.colour).toBeDefined();
    expect(b.typography).toBeDefined();
    expect(b.gridSpacing).toBeDefined();
    expect(b.cornerRadius).toBeDefined();
    expect(b.components).toBeDefined();
    expect(b.iconography).toBeUndefined();

    // Colour copy names the dominant colour (lowercased) and, with enough groups,
    // includes the 60/30/10 split.
    expect(b.colour).toContain("ink black");
    expect(b.colour).toContain("60%");
    // Radius picks the most-used value (4px appears twice), never 0px or the pill.
    expect(b.cornerRadius).toContain("4px");
    // Typography names both families and the mono font.
    expect(b.typography).toContain("Canela");
    expect(b.typography).toContain("Söhne");
    expect(b.typography).toContain("Söhne Mono");
    // Components names primary/secondary buttons and the display font.
    expect(b.components).toContain("Canela");
    expect(b.components).toContain("Primary");
    expect(b.components).toContain("Ghost");

    expect(content.logoRulesText.length).toBeGreaterThan(0);
    expect(content.dosAndDonts.dos.length).toBeGreaterThan(0);
    expect(content.dosAndDonts.donts.length).toBeGreaterThan(0);
    expect(content.closingLine).toBe("Considered words, built to last.");
  });

  it("omits blurbs for absent groups on minimal tokens", () => {
    const content = generateGuidelinesContent(minimal);
    const b = content.sectionBlurbs;

    expect(content.intro).toBeTruthy();
    expect(b.colour).toBeDefined();
    expect(b.typography).toBeDefined();
    expect(content.dosAndDonts.dos.length).toBeGreaterThan(0);
    expect(content.dosAndDonts.donts.length).toBeGreaterThan(0);

    // No radius, buttons, logo or icons → those blurbs are omitted cleanly.
    expect(b.cornerRadius).toBeUndefined();
    expect(b.components).toBeUndefined();
    expect(b.iconography).toBeUndefined();
    expect(b.logo).toBeUndefined();
    expect(content.logoRulesText).toEqual([]);

    // With no secondary/neutral groups, colour copy stays simple.
    expect(b.colour).not.toContain("60%");
    expect(b.colour).not.toContain("Supporting colours");

    // Do/don't lists never mention absent groups.
    const all = [...content.dosAndDonts.dos, ...content.dosAndDonts.donts].join(" ").toLowerCase();
    expect(all).not.toContain("logo");
  });

  it("never invents a tagline and falls back the closing line when brandVoice is absent", () => {
    const content = generateGuidelinesContent(minimal);
    expect(content.tagline).toBeUndefined();
    expect(content.closingLine).toBe("Minimal Co — Brand Guidelines");
  });

  it("adapts copy to a dark/serif brand (snapshot)", () => {
    expect(generateGuidelinesContent(darkSerif)).toMatchSnapshot();
  });

  it("adapts copy to a light/sans brand (snapshot)", () => {
    expect(generateGuidelinesContent(lightSans)).toMatchSnapshot();
  });
});
