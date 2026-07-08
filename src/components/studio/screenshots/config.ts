// Studio — App Screenshots mode config. Everything is code-defined (no DB): the exact store
// canvas sizes, the CSS device-frame geometry (ratios only, so frames scale to any resolution),
// the layout presets, background presets and fonts. The scene renderer consumes
// { canvas, device, layout, background, scene } and renders at TRUE pixel size so the on-screen
// preview is exactly what gets exported. Companion to ../config.ts (the Social mode).

import type { ExportFormat } from "../config";

export type DeviceId = "iphone-17" | "pixel-10";
export type StoreId = "appstore" | "play";
export type LayoutId = "text-top" | "text-bottom" | "centered" | "device-only" | "full-bleed" | "feature";

// ── Fonts (reuse Studio's stack) ──────────────────────────────────────────────
export const FONT_OPTIONS: { id: string; label: string; stack: string }[] = [
  { id: "sans", label: "Sans", stack: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" },
  { id: "serif-dm", label: "DM Serif", stack: "var(--font-display), 'Times New Roman', Georgia, serif" },
  { id: "serif-fraunces", label: "Fraunces", stack: "var(--font-fraunces), 'Times New Roman', Georgia, serif" },
  { id: "mono", label: "Mono", stack: "var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace" },
];
export const DEFAULT_FONT = "sans";
export function fontStack(id: string): string {
  return FONT_OPTIONS.find((f) => f.id === id)?.stack ?? FONT_OPTIONS[0].stack;
}

// ── Canvas presets (EXACT store pixel sizes) ──────────────────────────────────
export interface CanvasPreset {
  id: string;
  store: StoreId;
  label: string; // e.g. "iPhone 6.9\""
  sub: string; // e.g. "1290 × 2796"
  w: number;
  h: number;
  framed: boolean; // device frame applies (false → feature graphic)
  device?: DeviceId;
  maxShots: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  // Apple App Store — iPhone 17 frames
  { id: "as-69", store: "appstore", label: 'iPhone 6.9"', sub: "1290 × 2796", w: 1290, h: 2796, framed: true, device: "iphone-17", maxShots: 10 },
  { id: "as-69-alt", store: "appstore", label: 'iPhone 6.9" (alt)', sub: "1320 × 2868", w: 1320, h: 2868, framed: true, device: "iphone-17", maxShots: 10 },
  { id: "as-65", store: "appstore", label: 'iPhone 6.5"', sub: "1242 × 2688", w: 1242, h: 2688, framed: true, device: "iphone-17", maxShots: 10 },
  // Google Play — Pixel 10 frame + feature graphic
  { id: "play-phone", store: "play", label: "Pixel phone", sub: "1080 × 2400", w: 1080, h: 2400, framed: true, device: "pixel-10", maxShots: 8 },
  { id: "play-phone-alt", store: "play", label: "Play phone (alt)", sub: "1080 × 1920", w: 1080, h: 1920, framed: true, device: "pixel-10", maxShots: 8 },
  { id: "play-feature", store: "play", label: "Feature graphic", sub: "1024 × 500", w: 1024, h: 500, framed: false, maxShots: 8 },
];

export const STORE_LABEL: Record<StoreId, string> = { appstore: "App Store", play: "Google Play" };

export function canvasById(id: string): CanvasPreset {
  return CANVAS_PRESETS.find((c) => c.id === id) ?? CANVAS_PRESETS[0];
}

// ── Device frame geometry (all internals are ratios of the frame width W) ─────
export interface DeviceGeometry {
  id: DeviceId;
  label: string;
  screenAspect: number; // screen height / screen width
  bezel: number; // uniform bezel as a fraction of W
  radiusOuter: number; // outer body corner radius as a fraction of W
  cutout:
    | { type: "island"; wPct: number; hPct: number; top: number } // Dynamic Island pill
    | { type: "punch"; dPct: number; top: number }; // hole-punch camera
  bodyColors: { id: string; label: string; body: string; rim: string }[];
}

// Screen aspects intentionally match the app-screenshot ratios the stores expect
// (iPhone 6.9" 1290×2796 = 2.167; Pixel 1080×2400 = 2.222).
export const DEVICES: Record<DeviceId, DeviceGeometry> = {
  "iphone-17": {
    id: "iphone-17",
    label: "iPhone 17",
    screenAspect: 2796 / 1290,
    bezel: 0.03,
    radiusOuter: 0.185,
    cutout: { type: "island", wPct: 0.32, hPct: 0.092, top: 0.028 },
    bodyColors: [
      { id: "black", label: "Black", body: "#1C1C1E", rim: "#3A3A3C" },
      { id: "silver", label: "Silver", body: "#E6E7E9", rim: "#C6C8CC" },
      { id: "deep-blue", label: "Deep Blue", body: "#2E4374", rim: "#47598B" },
      { id: "natural", label: "Natural Ti", body: "#C9C2B6", rim: "#AEA79A" },
    ],
  },
  "pixel-10": {
    id: "pixel-10",
    label: "Pixel 10",
    screenAspect: 2400 / 1080,
    bezel: 0.032,
    radiusOuter: 0.09,
    cutout: { type: "punch", dPct: 0.052, top: 0.024 },
    bodyColors: [
      { id: "obsidian", label: "Obsidian", body: "#1B1B1D", rim: "#39393C" },
      { id: "porcelain", label: "Porcelain", body: "#EDE9E3", rim: "#D3CEC5" },
      { id: "iris", label: "Iris", body: "#6B6FB5", rim: "#8488C9" },
      { id: "lemongrass", label: "Lemongrass", body: "#C7D0A0", rim: "#B0BA85" },
    ],
  },
};

export function defaultBodyColor(device: DeviceId): string {
  return DEVICES[device].bodyColors[0].id;
}
export function bodyColor(device: DeviceId, id: string): { body: string; rim: string } {
  const list = DEVICES[device].bodyColors;
  return list.find((c) => c.id === id) ?? list[0];
}

// ── Layout presets ────────────────────────────────────────────────────────────
// Device is placed by its CENTRE at (cx, cy) as fractions of the canvas, sized so the device
// OUTER height = deviceHeight × canvas height (before the per-set scale knob). `textZone`
// gives newly-added text layers a sensible default anchor. `fullBleed` fills the canvas with
// the screen image (no frame). `feature`/no-device layouts skip the device entirely.
export interface LayoutPreset {
  id: LayoutId;
  label: string;
  hasDevice: boolean;
  fullBleed: boolean;
  device?: { cx: number; cy: number; height: number };
  textZone: { xPct: number; yPct: number; align: "left" | "center" | "right" };
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "text-top", label: "Text top", hasDevice: true, fullBleed: false, device: { cx: 0.5, cy: 0.74, height: 0.82 }, textZone: { xPct: 50, yPct: 11, align: "center" } },
  { id: "text-bottom", label: "Text bottom", hasDevice: true, fullBleed: false, device: { cx: 0.5, cy: 0.34, height: 0.82 }, textZone: { xPct: 50, yPct: 84, align: "center" } },
  { id: "centered", label: "Device centred", hasDevice: true, fullBleed: false, device: { cx: 0.5, cy: 0.52, height: 0.78 }, textZone: { xPct: 50, yPct: 9, align: "center" } },
  { id: "device-only", label: "Device only", hasDevice: true, fullBleed: false, device: { cx: 0.5, cy: 0.5, height: 0.92 }, textZone: { xPct: 50, yPct: 8, align: "center" } },
  { id: "full-bleed", label: "Full-bleed", hasDevice: false, fullBleed: true, textZone: { xPct: 50, yPct: 86, align: "center" } },
];

export const FEATURE_LAYOUT: LayoutPreset = {
  id: "feature",
  label: "Feature graphic",
  hasDevice: false,
  fullBleed: false,
  textZone: { xPct: 50, yPct: 50, align: "center" },
};

export function layoutById(id: LayoutId): LayoutPreset {
  return LAYOUT_PRESETS.find((l) => l.id === id) ?? (id === "feature" ? FEATURE_LAYOUT : LAYOUT_PRESETS[0]);
}

// ── Background ──────────────────────────────────────────────────────────────
export type Fill =
  | { kind: "solid"; color: string }
  | { kind: "linear"; angle: number; stops: { color: string; at: number }[] }
  | { kind: "radial"; shape: "circle" | "ellipse"; stops: { color: string; at: number }[] };

export interface BackgroundTheme {
  fill: Fill;
}

export const BACKGROUND_PRESETS: { id: string; label: string; theme: BackgroundTheme }[] = [
  { id: "navy", label: "Navy", theme: { fill: { kind: "linear", angle: 160, stops: [{ color: "#122043", at: 0 }, { color: "#0A1533", at: 100 }] } } },
  { id: "blue", label: "Blue glow", theme: { fill: { kind: "radial", shape: "circle", stops: [{ color: "#3B82F6", at: 0 }, { color: "#0A1533", at: 70 }] } } },
  { id: "cream", label: "Cream", theme: { fill: { kind: "solid", color: "#F2EDE4" } } },
  { id: "purple", label: "Purple", theme: { fill: { kind: "linear", angle: 150, stops: [{ color: "#8B75FF", at: 0 }, { color: "#6B52FF", at: 100 }] } } },
  { id: "graphite", label: "Graphite", theme: { fill: { kind: "linear", angle: 165, stops: [{ color: "#2A2C31", at: 0 }, { color: "#151619", at: 100 }] } } },
  { id: "white", label: "White", theme: { fill: { kind: "solid", color: "#FFFFFF" } } },
];

/** The first colour of a fill — used as the JPEG raster fallback background. */
export function fillBase(fill: Fill): string {
  return fill.kind === "solid" ? fill.color : fill.stops[0]?.color ?? "#000000";
}

/** Resolve a Fill to CSS { backgroundColor, backgroundImage }. */
export function resolveFill(fill: Fill): { backgroundColor: string; backgroundImage?: string } {
  if (fill.kind === "solid") return { backgroundColor: fill.color };
  const stops = fill.stops.map((s) => `${s.color} ${s.at}%`).join(", ");
  if (fill.kind === "linear") return { backgroundColor: fillBase(fill), backgroundImage: `linear-gradient(${fill.angle}deg, ${stops})` };
  return { backgroundColor: fillBase(fill), backgroundImage: `radial-gradient(${fill.shape} at 50% 40%, ${stops})` };
}

// ── Content model ─────────────────────────────────────────────────────────────
export interface TextLayer {
  id: string;
  text: string;
  font: string; // FONT_OPTIONS id
  sizePx: number; // design px at 1080-wide canvas (scaled by u)
  weight: number;
  color: string;
  align: "left" | "center" | "right";
  xPct: number; // anchor position on canvas (0–100)
  yPct: number;
  widthPct: number; // text block width as a % of canvas width
  rotation: number; // degrees
  shadow: { on: boolean; x: number; y: number; blur: number; color: string };
}

export interface DeviceConfig {
  scale: number; // multiplies the layout's device height (0.6–1.4)
  offsetX: number; // nudge, fraction of canvas width (−0.5–0.5)
  offsetY: number; // nudge, fraction of canvas height
  rotation: number; // degrees
  bodyColor: Record<DeviceId, string>; // chosen body colour per device
}

export interface Scene {
  id: string;
  screenImage: string | null; // uploaded app screenshot (data URL)
  texts: TextLayer[];
  bgOverride: BackgroundTheme | null; // per-scene background override
}

export interface ScreenshotState {
  targets: string[]; // CanvasPreset ids
  device: DeviceId;
  layout: LayoutId;
  background: BackgroundTheme;
  deviceConfig: DeviceConfig;
  statusBar: { on: boolean; style: "ios" | "android"; tint: "light" | "dark" };
  scenes: Scene[];
  format: ExportFormat;
}

export const STORAGE_KEY_SHOTS = "gitwork.studio.shots.v1";

// ── Factories / defaults ──────────────────────────────────────────────────────
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${seq * 2654435761 % 100000}`;
}

export function newTextLayer(layout: LayoutId, over?: Partial<TextLayer>): TextLayer {
  const zone = layoutById(layout).textZone;
  return {
    id: newId("t"),
    text: "Your headline here",
    font: "serif-dm",
    sizePx: 72,
    weight: 600,
    color: "#FFFFFF",
    align: zone.align,
    xPct: zone.xPct,
    yPct: zone.yPct,
    widthPct: 82,
    rotation: 0,
    shadow: { on: true, x: 0, y: 6, blur: 24, color: "rgba(0,0,0,0.35)" },
    ...over,
  };
}

export function newScene(layout: LayoutId): Scene {
  return { id: newId("s"), screenImage: null, texts: [newTextLayer(layout)], bgOverride: null };
}

export const DEFAULT_SCREENSHOT_STATE: ScreenshotState = {
  targets: ["as-69"],
  device: "iphone-17",
  layout: "text-top",
  background: BACKGROUND_PRESETS[0].theme,
  deviceConfig: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, bodyColor: { "iphone-17": "black", "pixel-10": "obsidian" } },
  statusBar: { on: true, style: "ios", tint: "dark" },
  scenes: [
    {
      id: "s-seed-1",
      screenImage: null,
      texts: [newTextLayer("text-top", { text: "Everything your team\nneeds, in one place." })],
      bgOverride: null,
    },
  ],
  format: "png",
};
