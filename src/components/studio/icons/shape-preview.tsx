// Preview-only masked icon — shows how the icon reads once a platform applies its mask
// (squircle / rounded / circle / square). Export is always full-bleed square; this is cosmetic.

import { IconArt } from "./icon-art";
import { shapeRadius, type Fill, type ShapeId } from "./config";

export function ShapePreview({
  size,
  fill,
  image,
  fgScale,
  shape,
  grayscale = false,
  imageFilter,
}: {
  size: number;
  fill: Fill;
  image: string | null;
  fgScale: number;
  shape: ShapeId;
  grayscale?: boolean;
  imageFilter?: string;
}) {
  return (
    <div style={{ width: size, height: size, borderRadius: shapeRadius(shape, size), overflow: "hidden" }}>
      <IconArt size={size} fill={fill} image={image} fgScale={fgScale} layer="composite" grayscale={grayscale} imageFilter={imageFilter} />
    </div>
  );
}
