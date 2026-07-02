// Editorial portrait/square artboard — powers both the carousel (with pagination +
// "Swipe →") and the single Post. Mirrors the example case-study slide: top accent bar,
// wordmark + mono eyebrow, big serif headline with an accent phrase, body copy, hairline
// divider, footer.

import type { Size, StudioContent, StylePreset } from "../config";
import { artboardStyle, Eyebrow, Headline, px, Wordmark } from "./shared";

export function EditorialArtboard({
  size,
  preset,
  content,
  slideIndex,
  slideCount,
  showPagination,
}: {
  size: Size;
  preset: StylePreset;
  content: StudioContent;
  slideIndex: number;
  slideCount: number;
  showPagination: boolean;
}) {
  const u = size.w / 1080;
  const slide = content.slides[slideIndex] ?? content.slides[0];
  const pad = 76 * u;
  const isLast = slideIndex >= slideCount - 1;

  return (
    <div style={artboardStyle(preset)}>
      {/* top accent progress bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: px(8, u),
          backgroundColor: preset.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: pad,
          paddingTop: 96 * u,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Wordmark preset={preset} content={content} u={u} fontSize={30} />
        </div>

        <div style={{ marginTop: px(34, u) }}>
          <Eyebrow text={content.eyebrow} preset={preset} u={u} fontSize={19} />
        </div>

        <div style={{ marginTop: px(56, u) }}>
          <Headline headline={slide.headline} accent={slide.accent} preset={preset} u={u} fontSize={86} />
        </div>

        <div style={{ flex: 1 }} />

        <p
          style={{
            margin: 0,
            fontFamily: preset.body,
            fontSize: px(29, u),
            lineHeight: 1.5,
            color: preset.bodyInk,
            maxWidth: "76%",
          }}
        >
          {slide.body}
        </p>

        {content.showDivider ? (
          <div style={{ height: Math.max(1, u), backgroundColor: preset.divider, margin: `${px(30, u)} 0` }} />
        ) : (
          <div style={{ height: px(30, u) }} />
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {showPagination ? (
            <div style={{ display: "flex", gap: px(12, u) }}>
              {Array.from({ length: slideCount }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: px(10, u),
                    height: px(10, u),
                    borderRadius: 9999,
                    backgroundColor: i === slideIndex ? preset.accent : preset.divider,
                    display: "inline-block",
                  }}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          {showPagination && !isLast ? (
            <span
              style={{
                fontFamily: preset.mono,
                fontSize: px(22, u),
                fontWeight: 500,
                letterSpacing: px(2, u),
                color: preset.accent,
                textTransform: "uppercase",
              }}
            >
              Swipe →
            </span>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}

export function CarouselSlide(props: {
  size: Size;
  preset: StylePreset;
  content: StudioContent;
  slideIndex: number;
  slideCount: number;
}) {
  return <EditorialArtboard {...props} showPagination />;
}
