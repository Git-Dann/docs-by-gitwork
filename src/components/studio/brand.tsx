"use client";

// Studio brand context. A client picker at the Studio root selects a WorkspaceClient; if that
// client has a design system (ClientDesignSystem.tokens), its palette + fonts become the active
// baseline across ALL Studio modes (Social / Screenshots / Icons) — fully replacing the built-in
// Gitwork/Foundry presets. With no client selected, `source` is "gitwork" and every mode keeps its
// original built-in behaviour untouched.
//
// Fonts are matched to the fonts already bundled via next/font (see src/app/layout.tsx); a client
// font that isn't bundled falls back to the nearest generic — proprietary fonts don't embed.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useClientList } from "@/hooks/use-proposals";
import { useClientDesignSystem } from "@/hooks/use-design-system";
import type { ClientListItem } from "@/types/client";
import type { DesignTokens } from "@/types/design-tokens";
import type { Fill } from "./screenshots/config";
import { fontStack } from "./screenshots/config";
import type { StylePreset, StylePresetId } from "./config";

export interface StudioBrand {
  source: "gitwork" | "client";
  name: string;
  slug: string | null;
  colors: {
    primary: string;
    accent: string;
    ink: string; // readable text on a light surface
    onDark: string; // readable text on the primary/dark surface
    neutralLight: string;
    neutralDark: string;
    palette: string[]; // all distinct brand colours
  };
  fontIds: { display: string; body: string; mono: string }; // existing FONT_OPTIONS ids
}

const GITWORK_BRAND: StudioBrand = {
  source: "gitwork",
  name: "Gitwork",
  slug: null,
  colors: { primary: "#0A1533", accent: "#3B82F6", ink: "#1A1A1E", onDark: "#FFFFFF", neutralLight: "#F2EDE4", neutralDark: "#0A1533", palette: ["#0A1533", "#3B82F6", "#6B52FF", "#F2EDE4"] },
  fontIds: { display: "serif-dm", body: "sans", mono: "mono" },
};

// ── colour helpers ──
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function onColor(hex: string): string {
  return luminance(hex) > 0.6 ? "#111114" : "#FFFFFF";
}
export function rgba(hex: string, a: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : hex;
}

// ── font matching to bundled next/font families ──
const FONT_MATCHERS: { test: RegExp; id: string }[] = [
  { test: /poppins/i, id: "poppins" },
  { test: /montserrat/i, id: "montserrat" },
  { test: /manrope/i, id: "manrope" },
  { test: /sora/i, id: "sora" },
  { test: /space\s*grotesk/i, id: "space-grotesk" },
  { test: /archivo/i, id: "archivo" },
  { test: /fraunces/i, id: "serif-fraunces" },
  { test: /playfair/i, id: "playfair" },
  { test: /dm\s*serif/i, id: "serif-dm" },
  { test: /(jetbrains|mono|consolas|courier)/i, id: "mono" },
  { test: /(inter|helvetica|arial|system|sans)/i, id: "sans" },
];
function matchFontId(family: string | undefined, fallback: string): string {
  if (!family) return fallback;
  return FONT_MATCHERS.find((m) => m.test.test(family))?.id ?? fallback;
}

function buildBrand(tokens: DesignTokens, name: string, slug: string): StudioBrand {
  const primary = tokens.colours?.primary?.[0]?.hex ?? "#0A1533";
  const secondary = tokens.colours?.secondary ?? [];
  const accent = secondary.find((c) => /accent/i.test(c.role))?.hex ?? secondary[0]?.hex ?? primary;
  const neutrals = (tokens.colours?.neutrals ?? []).map((c) => c.hex).filter(Boolean);
  const sortedNeutrals = [...neutrals].sort((a, b) => luminance(a) - luminance(b));
  const neutralDark = sortedNeutrals[0] ?? primary;
  const neutralLight = sortedNeutrals[sortedNeutrals.length - 1] ?? "#FFFFFF";
  const palette = [...new Set([primary, accent, ...secondary.map((c) => c.hex), ...neutrals].filter(Boolean))].slice(0, 12);
  return {
    source: "client",
    name,
    slug,
    colors: {
      primary,
      accent,
      ink: luminance(neutralDark) < 0.4 ? neutralDark : "#1A1A1E",
      onDark: onColor(primary),
      neutralLight,
      neutralDark,
      palette,
    },
    fontIds: {
      display: matchFontId(tokens.typography?.displayFont, "serif-dm"),
      body: matchFontId(tokens.typography?.bodyFont, "sans"),
      mono: matchFontId(tokens.typography?.monoFont, "mono"),
    },
  };
}

/** Background swatches derived from a client's palette (for Screenshots + Icons editors). */
export function brandBackgroundSwatches(brand: StudioBrand): { label: string; fill: Fill }[] {
  const { primary, accent, neutralDark, neutralLight, palette } = brand.colors;
  const out: { label: string; fill: Fill }[] = [
    { label: "Primary", fill: { kind: "solid", color: primary } },
    { label: "Primary → dark", fill: { kind: "linear", angle: 155, stops: [{ color: primary, at: 0 }, { color: neutralDark, at: 100 }] } },
    { label: "Accent glow", fill: { kind: "radial", shape: "circle", stops: [{ color: accent, at: 0 }, { color: primary, at: 72 }] } },
    { label: "Light", fill: { kind: "solid", color: neutralLight } },
  ];
  for (const hex of palette) out.push({ label: hex, fill: { kind: "solid", color: hex } });
  return out;
}

/** A Social-mode StylePreset built from the client brand (replaces navy/cream when a client is on). */
export function buildSocialPreset(brand: StudioBrand): StylePreset {
  const { primary, accent } = brand.colors;
  const onPrimary = onColor(primary);
  const light = onPrimary === "#FFFFFF";
  return {
    id: "client" as StylePresetId,
    label: brand.name,
    bg: primary,
    ink: onPrimary,
    bodyInk: light ? "rgba(255,255,255,0.74)" : "rgba(17,17,20,0.74)",
    muted: light ? "rgba(255,255,255,0.55)" : "rgba(17,17,20,0.55)",
    accent,
    onAccent: onColor(accent),
    divider: onPrimary === "#FFFFFF" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)",
    serif: fontStack(brand.fontIds.display),
    mono: fontStack(brand.fontIds.mono),
    body: fontStack(brand.fontIds.body),
    numeral: fontStack(brand.fontIds.display),
  };
}

// ── context ──
interface BrandCtx {
  brand: StudioBrand;
  clients: ClientListItem[];
  selectedSlug: string | null;
  setSelectedSlug: (slug: string | null) => void;
  loadingDs: boolean;
  hasDesignSystem: boolean;
}
const StudioBrandContext = createContext<BrandCtx | null>(null);
const CLIENT_KEY = "gitwork.studio.client.v1";

export function StudioBrandProvider({ children }: { children: ReactNode }) {
  const [selectedSlug, setSelectedSlugState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CLIENT_KEY) : null;
    if (raw) setSelectedSlugState(raw);
    setHydrated(true);
  }, []);
  const setSelectedSlug = useCallback((slug: string | null) => {
    setSelectedSlugState(slug);
    try {
      if (slug) window.localStorage.setItem(CLIENT_KEY, slug);
      else window.localStorage.removeItem(CLIENT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const { data } = useClientList();
  const clients = useMemo(() => data?.clients ?? [], [data]);
  const ds = useClientDesignSystem(hydrated ? selectedSlug : null);
  const tokens = ds.data?.tokens ?? null;

  const brand = useMemo<StudioBrand>(() => {
    if (!selectedSlug || !tokens) return GITWORK_BRAND;
    const client = clients.find((c) => c.slug === selectedSlug);
    return buildBrand(tokens, tokens.clientName || client?.name || "Client", selectedSlug);
  }, [selectedSlug, tokens, clients]);

  const value: BrandCtx = {
    brand,
    clients,
    selectedSlug,
    setSelectedSlug,
    loadingDs: ds.isFetching,
    hasDesignSystem: Boolean(tokens),
  };
  return <StudioBrandContext.Provider value={value}>{children}</StudioBrandContext.Provider>;
}

export function useStudioBrand(): BrandCtx {
  const ctx = useContext(StudioBrandContext);
  if (!ctx) throw new Error("useStudioBrand must be used within StudioBrandProvider");
  return ctx;
}
