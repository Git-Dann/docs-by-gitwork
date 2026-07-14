// Shared building blocks for Studio artboard templates. Everything renders at TRUE pixel
// size (the parent gives an exact w×h box); sizes are derived from a `u` unit so one
// template scales across platform dimensions. Colours come from the active StylePreset —
// never app CSS tokens — so exports are deterministic regardless of the app's light/dark mode.

import type { CSSProperties } from "react";
import type { StudioContent, StylePreset } from "../config";
import { WORDMARK_LABEL } from "../config";

/** px helper — multiply a design value by the artboard unit scale. */
export function px(n: number, u: number): string {
  return `${n * u}px`;
}

/** The Gitwork/Foundry wordmark as text (serif + accent period), or an uploaded logo. */
export function Wordmark({
  preset,
  content,
  u,
  fontSize,
}: {
  preset: StylePreset;
  content: StudioContent;
  u: number;
  fontSize: number;
}) {
  if (content.logoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={content.logoDataUrl}
        alt=""
        style={{ height: px(fontSize * 1.1, u), width: "auto", objectFit: "contain", display: "block" }}
      />
    );
  }
  const label = WORDMARK_LABEL[content.wordmark];
  if (!label) return null;
  return (
    <span
      style={{
        fontFamily: preset.serif,
        fontSize: px(fontSize, u),
        fontWeight: 600,
        letterSpacing: px(-0.5, u),
        color: preset.ink,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <span style={{ color: preset.accent }}>.</span>
    </span>
  );
}

/** Mono-caps eyebrow, e.g. "CASE STUDY / FELLAS LOADED". Accent-coloured by default. */
export function Eyebrow({
  text,
  preset,
  u,
  fontSize = 20,
  color,
}: {
  text: string;
  preset: StylePreset;
  u: number;
  fontSize?: number;
  color?: string;
}) {
  if (!text) return null;
  return (
    <div
      style={{
        fontFamily: preset.mono,
        fontSize: px(fontSize, u),
        fontWeight: 600,
        letterSpacing: px(fontSize * 0.14, u),
        textTransform: "uppercase",
        color: color ?? preset.accent,
      }}
    >
      {text}
    </div>
  );
}

/** Absolute-fill background for an artboard, plus an optional soft accent glow. */
export function artboardStyle(preset: StylePreset, glow = false): CSSProperties {
  return {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: preset.bg,
    backgroundImage: glow
      ? `radial-gradient(120% 120% at 100% 0%, ${hexA(preset.accent, 0.22)} 0%, ${hexA(preset.accent, 0)} 55%)`
      : undefined,
    boxSizing: "border-box",
  };
}

/** Hex (#RRGGBB) → rgba() string at the given alpha. Falls back to the input as-is. */
export function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Headline: primary ink text, then the accent phrase in the preset accent colour. */
export function Headline({
  headline,
  accent,
  preset,
  u,
  fontSize,
  lineHeight = 1.04,
}: {
  headline: string;
  accent: string;
  preset: StylePreset;
  u: number;
  fontSize: number;
  lineHeight?: number;
}) {
  return (
    <h1
      style={{
        margin: 0,
        fontFamily: preset.serif,
        fontWeight: 400,
        fontSize: px(fontSize, u),
        lineHeight,
        letterSpacing: px(-fontSize * 0.02, u),
        color: preset.ink,
      }}
    >
      {headline}
      {accent ? (
        <>
          {" "}
          <span style={{ color: preset.twoToneHeadline ? preset.accent : preset.ink }}>{accent}</span>
        </>
      ) : null}
    </h1>
  );
}
