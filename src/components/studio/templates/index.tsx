// Dispatcher — renders the right template body for an asset type. The SAME component is
// used for the live preview and as the export source, so there's no preview/export drift.

import type { AssetTypeId, Size, StudioContent, StylePreset } from "../config";
import { Avatar } from "./avatar";
import { Banner } from "./banner";
import { CarouselSlide } from "./carousel-slide";
import { Post } from "./post";

export function ArtboardBody({
  assetType,
  size,
  preset,
  content,
  slideIndex,
  slideCount,
}: {
  assetType: AssetTypeId;
  size: Size;
  preset: StylePreset;
  content: StudioContent;
  slideIndex: number;
  slideCount: number;
}) {
  switch (assetType) {
    case "carousel":
      return <CarouselSlide size={size} preset={preset} content={content} slideIndex={slideIndex} slideCount={slideCount} />;
    case "post":
      return <Post size={size} preset={preset} content={content} />;
    case "banner":
      return <Banner size={size} preset={preset} content={content} />;
    case "avatar":
      return <Avatar size={size} preset={preset} content={content} />;
    default:
      return null;
  }
}
