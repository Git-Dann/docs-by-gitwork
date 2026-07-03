// Editorial portrait/square artboard — powers both the carousel (with pagination + "Swipe →")
// and the single Post. Every element is ABSOLUTELY positioned to a fixed zone so that flicking
// between slides never shifts anything: the wordmark/eyebrow, the headline top, the body top, the
// divider and the dots all hold identical positions across slides — only the text changes. The
// "Swipe →" affordance reserves its own corner, so its presence/absence moves nothing.

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
  const isLast = slideIndex >= slideCount - 1;
  const padX = 76 * u;

  // Fixed vertical anchors (consistent within a platform → consistent across its slides).
  const bodyTop = Math.round(size.h * 0.6); // body top-aligned across slides
  const footerBottom = 54 * u; // dots + swipe baseline
  const dividerBottom = 108 * u; // hairline, fixed above footer
  const bodyBottom = 140 * u; // body clamps just above the divider

  return (
    <div style={artboardStyle(preset)}>
      {content.showTopBar ? (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: px(8, u), backgroundColor: preset.accent }} />
      ) : null}

      {/* Top block — wordmark, eyebrow, headline (top-anchored) */}
      <div style={{ position: "absolute", top: px(94, u), left: padX }}>
        <Wordmark preset={preset} content={content} u={u} fontSize={30} />
      </div>
      <div style={{ position: "absolute", top: px(152, u), left: padX, right: padX }}>
        <Eyebrow text={content.eyebrow} preset={preset} u={u} fontSize={19} />
      </div>
      <div style={{ position: "absolute", top: px(214, u), left: padX, right: padX }}>
        <Headline headline={slide.headline} accent={slide.accent} preset={preset} u={u} fontSize={86} />
      </div>

      {/* Body — fixed top, clamped above the divider */}
      <p
        style={{
          position: "absolute",
          top: bodyTop,
          bottom: bodyBottom,
          left: padX,
          margin: 0,
          overflow: "hidden",
          fontFamily: preset.body,
          fontSize: px(29, u),
          lineHeight: 1.5,
          color: preset.bodyInk,
          maxWidth: "76%",
        }}
      >
        {slide.body}
      </p>

      {/* Divider — fixed */}
      {content.showDivider ? (
        <div style={{ position: "absolute", left: padX, right: padX, bottom: dividerBottom, height: Math.max(1, u), backgroundColor: preset.divider }} />
      ) : null}

      {/* Dots — fixed bottom-left */}
      {showPagination ? (
        <div style={{ position: "absolute", left: padX, bottom: footerBottom, display: "flex", gap: px(12, u) }}>
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
      ) : null}

      {/* Swipe — fixed bottom-right, reserves its corner (only shown when not the last slide) */}
      {showPagination && !isLast ? (
        <span
          style={{
            position: "absolute",
            right: padX,
            bottom: footerBottom,
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
      ) : null}
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
