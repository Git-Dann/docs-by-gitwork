// The master icon artwork, rendered as a true-pixel square. One component powers every layer:
//   composite  — background fill + foreground (iOS / Play / legacy launcher)
//   background — the fill only (Android adaptive background layer)
//   foreground — foreground only on transparent, inset to the adaptive safe zone
//   mono       — white silhouette of the foreground on transparent (themed / iOS-tinted source)
// Rendered once at 1024 and downscaled per target size at export, so previews == exports.

import { resolveFill, type Fill } from "./config";

type Layer = "composite" | "background" | "foreground" | "mono";

// Adaptive foreground lives on a 108dp canvas but only ~72dp is ever visible, so shrink the art to
// keep it inside the safe zone (matches the apparent size of the full-bleed composite).
const ADAPTIVE_VISIBLE = 72 / 108;

export function IconArt({
  size,
  fill,
  image,
  fgScale,
  layer = "composite",
  grayscale = false,
  imageFilter,
}: {
  size: number;
  fill?: Fill;
  image: string | null;
  fgScale: number; // %
  layer?: Layer;
  grayscale?: boolean;
  imageFilter?: string; // CSS filter applied to the foreground (dark-mode recolour)
}) {
  const showBg = (layer === "composite" || layer === "background") && !!fill;
  const showFg = layer === "composite" || layer === "foreground" || layer === "mono";
  const bg = showBg && fill ? resolveFill(fill) : undefined;
  const fgW = size * (fgScale / 100) * (layer === "foreground" ? ADAPTIVE_VISIBLE : 1);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        overflow: "hidden",
        boxSizing: "border-box",
        backgroundColor: bg?.backgroundColor,
        backgroundImage: bg?.backgroundImage,
        filter: grayscale ? "grayscale(1)" : undefined,
      }}
    >
      {showFg && image ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            style={{
              width: fgW,
              height: fgW,
              objectFit: "contain",
              display: "block",
              filter: layer === "mono" ? "brightness(0) saturate(100%) invert(1)" : imageFilter,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
