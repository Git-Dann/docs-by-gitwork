// Wide profile/page banner — mirrors the example "From prompt to production." header:
// wordmark top-left, an optional outline pill top-right, a centred serif headline with an
// accent period, and an accent-ruled footnote bottom-right. Height-driven scale so it works
// across LinkedIn (1584×396), X (1500×500), Facebook (1200×630) and Instagram (1080×566).

import type { Size, StudioContent, StylePreset } from "../config";
import { artboardStyle, hexA, px, Wordmark } from "./shared";

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
  const padX = 72 * u;
  const padY = 60 * u;
  const slide = content.slides[0];

  return (
    <div style={artboardStyle(preset, true)}>
      {/* wordmark top-left */}
      <div style={{ position: "absolute", top: padY, left: padX }}>
        <Wordmark preset={preset} content={content} u={u} fontSize={40} />
      </div>

      {/* optional outline pill top-right */}
      {content.tag ? (
        <div
          style={{
            position: "absolute",
            top: padY,
            right: padX,
            border: `${Math.max(1, 1.5 * u)}px solid ${hexA(preset.muted.startsWith("#") ? preset.muted : "#8899bb", 0.5)}`,
            borderRadius: 9999,
            padding: `${px(12, u)} ${px(24, u)}`,
            fontFamily: preset.mono,
            fontSize: px(16, u),
            fontWeight: 600,
            letterSpacing: px(2.4, u),
            textTransform: "uppercase",
            color: preset.muted,
          }}
        >
          {content.tag}
        </div>
      ) : null}

      {/* centred headline */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${px(120, u)}`,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: preset.serif,
            fontWeight: 400,
            fontSize: px(96, u),
            lineHeight: 1.02,
            letterSpacing: px(-2, u),
            color: preset.ink,
          }}
        >
          {slide.headline}
          {slide.accent ? <span style={{ color: preset.accent }}> {slide.accent}</span> : null}
        </h1>
      </div>

      {/* accent-ruled footnote bottom-right */}
      {content.footnote ? (
        <div
          style={{
            position: "absolute",
            bottom: padY,
            right: padX,
            display: "flex",
            alignItems: "center",
            gap: px(20, u),
          }}
        >
          <span style={{ width: px(64, u), height: Math.max(2, 2 * u), backgroundColor: preset.accent, display: "inline-block" }} />
          <span
            style={{
              fontFamily: preset.mono,
              fontSize: px(17, u),
              fontWeight: 500,
              letterSpacing: px(2, u),
              textTransform: "uppercase",
              color: preset.muted,
            }}
          >
            {content.footnote}
          </span>
        </div>
      ) : null}
    </div>
  );
}
