// Studio — static config for the social-asset creator. Everything here is code-defined
// (no DB): the two brand style presets, the platform/size table, the asset types, and the
// default content. Templates consume `{ preset, size, content }` and render at TRUE pixel
// size so the on-screen preview is exactly what gets exported.

export type AssetTypeId = "carousel" | "banner" | "post" | "avatar";
export type PlatformId = "instagram" | "linkedin" | "facebook" | "twitter";
// "navy" | "cream" are the built-ins; a client design system injects a dynamic "client" preset
// (the `& {}` keeps literal autocomplete while allowing the dynamic id).
export type StylePresetId = "navy" | "cream" | (string & {});
export type WordmarkId = "gitwork" | "foundry" | "none";
export type ExportFormat = "png" | "jpeg";
export type ExportScale = 1 | 2;

export interface Size {
  w: number;
  h: number;
}

// ── Asset types ──────────────────────────────────────────────────────────────
export const ASSET_TYPES: { id: AssetTypeId; label: string; blurb: string }[] = [
  { id: "carousel", label: "Carousel", blurb: "Multi-slide story (swipeable)" },
  { id: "post", label: "Post", blurb: "Single feed image" },
  { id: "banner", label: "Banner", blurb: "Profile / page header" },
  { id: "avatar", label: "Avatar", blurb: "Square profile mark" },
];

// ── Platforms ────────────────────────────────────────────────────────────────
export const PLATFORMS: { id: PlatformId; label: string; short: string }[] = [
  { id: "instagram", label: "Instagram", short: "IG" },
  { id: "linkedin", label: "LinkedIn", short: "LI" },
  { id: "facebook", label: "Facebook", short: "FB" },
  { id: "twitter", label: "X / Twitter", short: "X" },
];

// Canonical export dimensions per asset type × platform. One coherent size each so the
// grid stays legible; custom sizes are handled separately (behind a toggle in the UI).
export const SIZES: Record<AssetTypeId, Record<PlatformId, Size>> = {
  carousel: {
    instagram: { w: 1080, h: 1350 }, // 4:5 portrait
    linkedin: { w: 1080, h: 1350 },
    facebook: { w: 1080, h: 1080 }, // 1:1
    twitter: { w: 1600, h: 900 }, // 16:9
  },
  post: {
    instagram: { w: 1080, h: 1350 },
    linkedin: { w: 1200, h: 1200 },
    facebook: { w: 1080, h: 1080 },
    twitter: { w: 1600, h: 900 },
  },
  banner: {
    instagram: { w: 1080, h: 566 },
    linkedin: { w: 1584, h: 396 }, // profile banner
    facebook: { w: 1200, h: 630 }, // cover
    twitter: { w: 1500, h: 500 }, // header
  },
  avatar: {
    instagram: { w: 1024, h: 1024 },
    linkedin: { w: 1024, h: 1024 },
    facebook: { w: 1024, h: 1024 },
    twitter: { w: 1024, h: 1024 },
  },
};

// ── Style presets ────────────────────────────────────────────────────────────
export interface StylePreset {
  id: StylePresetId;
  label: string;
  bg: string;
  ink: string; // primary headline
  bodyInk: string; // body copy
  muted: string; // eyebrow / mono labels / footnotes
  accent: string; // accent phrase, dots, progress, wordmark period
  onAccent: string; // text/ink placed on an accent fill (pills)
  divider: string;
  serif: string; // headline / wordmark font
  mono: string; // eyebrow / data labels
  body: string; // body copy font
  numeral: string; // decorative step numeral (carousel)
  // Render the headline's trailing "accent phrase" in the accent colour (two-tone). On for the
  // built-in brand presets; OFF for client design systems, where an arbitrary accent often clashes.
  twoToneHeadline: boolean;
}

const F = {
  serifDm: "var(--font-display), 'Times New Roman', Georgia, serif",
  serifFraunces: "var(--font-fraunces), 'Times New Roman', Georgia, serif",
  mono: "var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  playfair: "var(--font-playfair), Georgia, serif",
};

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  // Matches the app + the example carousel/banner: deep navy, Gitwork Blue accent,
  // DM Serif Display headline, JetBrains Mono eyebrow.
  navy: {
    id: "navy",
    label: "Navy / Blue",
    bg: "#0A1533",
    ink: "#FFFFFF",
    bodyInk: "rgba(255,255,255,0.74)",
    muted: "rgba(255,255,255,0.55)",
    accent: "#3B82F6",
    onAccent: "#FFFFFF",
    divider: "rgba(255,255,255,0.14)",
    serif: F.serifDm,
    mono: F.mono,
    body: F.sans,
    numeral: F.serifDm,
    twoToneHeadline: true,
  },
  // The marketing board: warm cream, purple accent, Fraunces headline, Playfair italic numerals.
  cream: {
    id: "cream",
    label: "Cream / Purple",
    bg: "#F2EDE4",
    ink: "#1A1A1E",
    bodyInk: "#3B3A40",
    muted: "#6B6B6B",
    accent: "#6B52FF",
    onAccent: "#FFFFFF",
    divider: "rgba(0,0,0,0.12)",
    serif: F.serifFraunces,
    mono: F.mono,
    body: F.sans,
    numeral: F.playfair,
    twoToneHeadline: true,
  },
};

// ── Content model ────────────────────────────────────────────────────────────
export interface Slide {
  headline: string;
  accent: string; // phrase rendered in the accent colour (appended after headline)
  body: string;
}

export interface StudioContent {
  wordmark: WordmarkId;
  eyebrow: string; // "CASE STUDY / FELLAS LOADED"
  tag: string; // banner pill, e.g. "SUPPORTING THE PROMPTWARE BUILDERS"
  footnote: string; // banner footnote, e.g. "GLOBAL BUILD CAPACITY. UK QUALITY CONTROL."
  showDivider: boolean;
  showTopBar: boolean; // optional accent bar across the top of carousel/post slides
  slides: Slide[]; // carousel uses all; post/banner/avatar use slides[0]
  logoDataUrl: string | null; // optional uploaded custom logo (renders top-right)
}

export const WORDMARK_LABEL: Record<WordmarkId, string> = {
  gitwork: "Gitwork",
  foundry: "Foundry",
  none: "",
};

export const DEFAULT_CONTENT: StudioContent = {
  wordmark: "gitwork",
  eyebrow: "CASE STUDY / FELLAS LOADED",
  tag: "SUPPORTING THE PROMPTWARE BUILDERS",
  footnote: "GLOBAL BUILD CAPACITY. UK QUALITY CONTROL.",
  showDivider: true,
  showTopBar: true,
  logoDataUrl: null,
  slides: [
    {
      headline: "We built creators a business,",
      accent: "not just a channel.",
      body: "Fellas Loaded came to us with an audience they didn't own, and an idea. We turned that idea into a subscription platform with 10,000+ paying members.",
    },
    {
      headline: "From prompt",
      accent: "to production.",
      body: "AI got you to a prototype. We get you to production — fixed scope, fixed price, fixed timeline.",
    },
  ],
};

export const STORAGE_KEY = "gitwork.studio.v1";
