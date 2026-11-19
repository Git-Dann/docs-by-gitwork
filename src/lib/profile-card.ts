/**
 * The business card at the top of a public profile (CLAUDE.md §139): the person picks a layout,
 * a font, a colour and a pattern, the way LinkedIn's business card does. Pure: the lists, the
 * defaults and the one reader that turns whatever is stored into a card that can be drawn.
 *
 * Colours here are fixed hex on purpose: a card is the person's own artwork, so it looks the same
 * in light and dark mode, like a printed card would.
 */

export const CARD_LAYOUTS = [
  { id: "photo-top", label: "Photo above" },
  { id: "photo-side", label: "Photo beside" },
  { id: "name-only", label: "Name centred" },
  { id: "corner", label: "Name in the corner" },
] as const;

export const CARD_FONTS = [
  { id: "clean", label: "Clean" },
  { id: "strong", label: "Strong" },
  { id: "classic", label: "Classic" },
  { id: "striking", label: "Striking" },
  { id: "precise", label: "Precise" },
] as const;

/** bg: the card. fg: its text. Pairs are checked for contrast by the tests (≥ 4.5:1). */
export const CARD_COLOURS = [
  { id: "paper", label: "Paper", bg: "#FAFAF7", fg: "#18181B" },
  { id: "ink", label: "Ink", bg: "#18181B", fg: "#FAFAF7" },
  { id: "foundry", label: "Foundry blue", bg: "#1D4ED8", fg: "#FFFFFF" },
  { id: "navy", label: "Navy", bg: "#172554", fg: "#DBEAFE" },
  { id: "forest", label: "Forest", bg: "#14532D", fg: "#ECFDF5" },
  { id: "ember", label: "Ember", bg: "#9A3412", fg: "#FFF7ED" },
  { id: "wine", label: "Wine", bg: "#881337", fg: "#FFF1F2" },
  { id: "plum", label: "Plum", bg: "#581C87", fg: "#FAF5FF" },
  { id: "sky", label: "Sky", bg: "#DBEAFE", fg: "#1E3A8A" },
  { id: "mint", label: "Mint", bg: "#DCFCE7", fg: "#14532D" },
  { id: "peach", label: "Peach", bg: "#FFEDD5", fg: "#7C2D12" },
  { id: "blush", label: "Blush", bg: "#FCE7F3", fg: "#831843" },
  { id: "lilac", label: "Lilac", bg: "#EDE9FE", fg: "#4C1D95" },
] as const;

export const CARD_PATTERNS = [
  { id: "none", label: "None" },
  { id: "topo", label: "Contours" },
  { id: "rays", label: "Rays" },
  { id: "grid", label: "Grid" },
  { id: "dots", label: "Dots" },
  { id: "waves", label: "Waves" },
  { id: "rings", label: "Rings" },
] as const;

export type CardLayout = (typeof CARD_LAYOUTS)[number]["id"];
export type CardFont = (typeof CARD_FONTS)[number]["id"];
export type CardColour = (typeof CARD_COLOURS)[number]["id"];
export type CardPattern = (typeof CARD_PATTERNS)[number]["id"];

export interface ProfileCard {
  layout: CardLayout;
  font: CardFont;
  colour: CardColour;
  pattern: CardPattern;
}

export const DEFAULT_CARD: ProfileCard = { layout: "photo-top", font: "clean", colour: "paper", pattern: "none" };

function pick<T extends string>(list: readonly { id: T }[], v: unknown, fallback: T): T {
  return list.some((o) => o.id === v) ? (v as T) : fallback;
}

/** Whatever is stored (or sent) becomes a card that can be drawn: unknown values fall back. */
export function readCard(v: unknown): ProfileCard {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    layout: pick(CARD_LAYOUTS, o.layout, DEFAULT_CARD.layout),
    font: pick(CARD_FONTS, o.font, DEFAULT_CARD.font),
    colour: pick(CARD_COLOURS, o.colour, DEFAULT_CARD.colour),
    pattern: pick(CARD_PATTERNS, o.pattern, DEFAULT_CARD.pattern),
  };
}

export function cardColour(id: CardColour): { bg: string; fg: string } {
  return CARD_COLOURS.find((c) => c.id === id) ?? CARD_COLOURS[0];
}

/** How each font draws the name. Only faces the app already loads, so a card never fetches one. */
export function cardFontStyle(id: CardFont): {
  family: string;
  weight: number;
  transform?: "uppercase";
  tracking: string;
  /** Name size relative to the layout's default. */
  scale: number;
} {
  switch (id) {
    case "strong":
      return { family: "var(--font-sans)", weight: 800, tracking: "-0.03em", scale: 1 };
    case "classic":
      return { family: "var(--font-display)", weight: 400, tracking: "-0.01em", scale: 1.08 };
    case "striking":
      return { family: "var(--font-sans)", weight: 900, transform: "uppercase", tracking: "-0.04em", scale: 0.95 };
    case "precise":
      return { family: "var(--font-mono)", weight: 500, tracking: "-0.04em", scale: 0.86 };
    default:
      return { family: "var(--font-sans)", weight: 500, tracking: "-0.03em", scale: 1 };
  }
}

/** WCAG relative luminance contrast, for the colour test. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
