// Wide profile/page banner — three stacked zones (never overlapping): a top bar (wordmark
// left, optional outline pill right), a vertically-centred serif headline that auto-fits its
// length, and a bottom bar (accent-ruled footnote, right). Height-driven scale so it works
// across LinkedIn (1584×396), X (1500×500), Facebook (1200×630) and Instagram (1080×566).

import type { Size, StudioContent, StylePreset } from "../config";
import { artboardStyle, hexA, px, Wordmark } from "./shared";

// Shrink the headline as it gets longer so it always fits one/two lines in the band.
function headlineSize(len: number): number {
  if (len <= 22) return 92;
  if (len <= 34) return 78;
  if (len <= 48) return 64;
  if (len <= 70) return 52;
  return 42;
}

export function Banner({
  size,
  preset,
  content,
}: {
  size: Size;
  preset: StylePreset;
  content: StudioContent;
}) {
  const u = size.h / 400;
  const padX = 64 * u;
  const padY = 46 * u;
  const slide = content.slides[0];
  const fullLen = `${slide.headline} ${slide.accent}`.trim().length;
  const fs = headlineSize(fullLen);

  return (
    <div style={{ ...artboardStyle(preset, true), display: "flex", flexDirection: "column", padding: `${px(padY, u)} ${px(padX, u)}` }}>
      {/* top zone: wordmark + optional tag pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: px(24, u) }}>
        <Wordmark preset={preset} content={content} u={u} fontSize={34} />
        {content.tag ? (
          <div
            style={{
              border: `${Math.max(1, 1.5 * u)}px solid ${hexA(preset.accent.startsWith("#") ? preset.accent : "#3B82F6", 0.5)}`,
              borderRadius: 9999,
              padding: `${px(11, u)} ${px(22, u)}`,
              fontFamily: preset.mono,
              fontSize: px(15, u),
              fontWeight: 600,
              letterSpacing: px(2.2, u),
              textTransform: "uppercase",
              color: preset.muted,
              whiteSpace: "nowrap",
            }}
          >
            {content.tag}
          </div>
        ) : null}
      </div>

      {/* middle zone: centred headline (fills remaining height) */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: `${px(16, u)} 0` }}>
        <h1
          style={{
            margin: 0,
            maxWidth: "92%",
            textAlign: "center",
            fontFamily: preset.serif,
            fontWeight: 400,
            fontSize: px(fs, u),
            lineHeight: 1.04,
            letterSpacing: px(-fs * 0.02, u),
            color: preset.ink,
          }}
        >
          {slide.headline}
          {slide.accent ? <span style={{ color: preset.accent }}> {slide.accent}</span> : null}
        </h1>
      </div>

      {/* bottom zone: accent-ruled footnote, right-aligned */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minHeight: px(20, u) }}>
        {content.footnote ? (
          <div style={{ display: "flex", alignItems: "center", gap: px(18, u) }}>
            <span style={{ width: px(56, u), height: Math.max(2, 2 * u), backgroundColor: preset.accent, display: "inline-block" }} />
            <span
              style={{
                fontFamily: preset.mono,
                fontSize: px(16, u),
                fontWeight: 500,
                letterSpacing: px(1.8, u),
                textTransform: "uppercase",
                color: preset.muted,
              }}
            >
              {content.footnote}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
