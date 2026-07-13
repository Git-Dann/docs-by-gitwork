// Studio — App Icons mode config. Code-defined (no DB): the full iOS + Android icon size sets
// (as real asset-catalog specs), the preview shapes, and the icon state model. The master icon is
// rendered once per appearance (light / dark / tinted) at 1024px and downscaled to every target
// size at export time. Reuses the Fill model + resolveFill from the Screenshots mode.

import type { Fill } from "../screenshots/config";
export type { Fill, BackgroundTheme } from "../screenshots/config";
export { resolveFill, fillBase, BACKGROUND_PRESETS } from "../screenshots/config";

export type ShapeId = "squircle" | "rounded" | "circle" | "square";

// Preview masks (the export is always full-bleed square — the OS applies its own mask). The iOS
// squircle is approximated with a large radius; true superellipse isn't needed for a preview.
export const SHAPES: { id: ShapeId; label: string; radiusPct: number }[] = [
  { id: "squircle", label: "Squircle (iOS)", radiusPct: 22.37 },
  { id: "rounded", label: "Rounded", radiusPct: 16 },
  { id: "circle", label: "Circle", radiusPct: 50 },
  { id: "square", label: "Square", radiusPct: 0 },
];
export function shapeRadius(id: ShapeId, size: number): number {
  return (SHAPES.find((s) => s.id === id)?.radiusPct ?? 0) * 0.01 * size;
}

// ── iOS AppIcon.appiconset — Contents.json image specs (primary/light appearance) ──
export interface IosIconSpec {
  px: number;
  idiom: "iphone" | "ipad" | "ios-marketing";
  size: string; // points, e.g. "20x20"
  scale: "1x" | "2x" | "3x";
}
export const IOS_ICONS: IosIconSpec[] = [
  // iPhone
  { px: 40, idiom: "iphone", size: "20x20", scale: "2x" },
  { px: 60, idiom: "iphone", size: "20x20", scale: "3x" },
  { px: 58, idiom: "iphone", size: "29x29", scale: "2x" },
  { px: 87, idiom: "iphone", size: "29x29", scale: "3x" },
  { px: 80, idiom: "iphone", size: "40x40", scale: "2x" },
  { px: 120, idiom: "iphone", size: "40x40", scale: "3x" },
  { px: 120, idiom: "iphone", size: "60x60", scale: "2x" },
  { px: 180, idiom: "iphone", size: "60x60", scale: "3x" },
  // iPad
  { px: 20, idiom: "ipad", size: "20x20", scale: "1x" },
  { px: 40, idiom: "ipad", size: "20x20", scale: "2x" },
  { px: 29, idiom: "ipad", size: "29x29", scale: "1x" },
  { px: 58, idiom: "ipad", size: "29x29", scale: "2x" },
  { px: 40, idiom: "ipad", size: "40x40", scale: "1x" },
  { px: 80, idiom: "ipad", size: "40x40", scale: "2x" },
  { px: 152, idiom: "ipad", size: "76x76", scale: "2x" },
  { px: 167, idiom: "ipad", size: "83.5x83.5", scale: "2x" },
];
// Distinct pixel sizes to actually rasterize for the light set (dedup of IOS_ICONS + marketing).
export const IOS_LIGHT_PX = [...new Set([...IOS_ICONS.map((i) => i.px), 1024])].sort((a, b) => a - b);

// ── Android density set ──
export interface AndroidDensity {
  dir: string; // mipmap-<dir>
  launcher: number; // legacy square launcher px (dp × density)
  adaptive: number; // adaptive layer px (108dp × density)
}
export const ANDROID_DENSITIES: AndroidDensity[] = [
  { dir: "mdpi", launcher: 48, adaptive: 108 },
  { dir: "hdpi", launcher: 72, adaptive: 162 },
  { dir: "xhdpi", launcher: 96, adaptive: 216 },
  { dir: "xxhdpi", launcher: 144, adaptive: 324 },
  { dir: "xxxhdpi", launcher: 192, adaptive: 432 },
];
export const ANDROID_PLAY_PX = 512;
// Fraction of the adaptive 108dp layer that is guaranteed visible after masking (safe zone ≈ 66dp).
export const ANDROID_SAFE_ZONE = 66 / 108;

// ── State ──
export interface IconState {
  foreground: string | null; // uploaded transparent PNG/SVG, data URL
  fgScale: number; // foreground width as a % of the icon (30–100)
  light: { fill: Fill };
  dark: { fill: Fill };
  tinted: boolean; // include iOS tinted appearance + Android monochrome layer
  platforms: { ios: boolean; android: boolean };
  previewShape: ShapeId;
}

export const STORAGE_KEY_ICONS = "gitwork.studio.icons.v1";

export const DEFAULT_ICON_STATE: IconState = {
  foreground: null,
  fgScale: 62,
  light: { fill: { kind: "linear", angle: 155, stops: [{ color: "#3B82F6", at: 0 }, { color: "#122043", at: 100 }] } },
  dark: { fill: { kind: "linear", angle: 155, stops: [{ color: "#1E2A4A", at: 0 }, { color: "#05080F", at: 100 }] } },
  tinted: false,
  platforms: { ios: true, android: true },
  previewShape: "squircle",
};
