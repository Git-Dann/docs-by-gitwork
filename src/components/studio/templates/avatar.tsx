// Square avatar / profile mark — a big serif initial (from the chosen wordmark) with an
// accent period, centred on the brand background, with a thin accent ring. If a custom logo
// is uploaded it's centred instead.

import type { Size, StudioContent, StylePreset } from "../config";
import { WORDMARK_LABEL } from "../config";
import { artboardStyle, hexA, px } from "./shared";

export function Avatar({
  size,
  preset,
  content,
}: {
  size: Size;
  preset: StylePreset;
  content: StudioContent;
}) {
  const u = size.w / 1024;
  const label = WORDMARK_LABEL[content.wordmark];
  const initial = label ? label[0] : "G";

  return (
    <div style={{ ...artboardStyle(preset, true), display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* thin accent ring */}
      <div
        style={{
          position: "absolute",
          inset: px(64, u),
          border: `${Math.max(1, 2 * u)}px solid ${hexA(preset.accent.startsWith("#") ? preset.accent : "#3B82F6", 0.35)}`,
          borderRadius: 9999,
        }}
      />
      {content.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.logoDataUrl}
          alt=""
          style={{ width: "52%", height: "52%", objectFit: "contain" }}
        />
      ) : (
        <span
          style={{
            fontFamily: preset.serif,
            fontWeight: 600,
            fontSize: px(560, u),
            lineHeight: 1,
            color: preset.ink,
          }}
        >
          {initial}
          <span style={{ color: preset.accent }}>.</span>
        </span>
      )}
    </div>
  );
}
