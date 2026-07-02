// Single feed Post — the editorial artboard without carousel pagination/swipe. Uses the
// first slide's copy.

import type { Size, StudioContent, StylePreset } from "../config";
import { EditorialArtboard } from "./carousel-slide";

export function Post({
  size,
  preset,
  content,
}: {
  size: Size;
  preset: StylePreset;
  content: StudioContent;
}) {
  return (
    <EditorialArtboard
      size={size}
      preset={preset}
      content={content}
      slideIndex={0}
      slideCount={1}
      showPagination={false}
    />
  );
}
