/** Section type: `image` — standalone image with caption + alignment. */

import { PhotoIcon } from "@heroicons/react/24/outline";
import { ImagePicker } from "@/components/ui/image-picker";
import { defineSection } from "@/lib/sections/types";
import { FormInput, SimpleForm } from "@/lib/sections/_shared";
import type { ImageSectionData } from "@/types/proposal";

const SIZE_LABEL: Record<ImageSectionData["size"], string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  full: "Full width",
};

const SIZE_WIDTHS: Record<ImageSectionData["size"], string> = {
  small: "240px",
  medium: "480px",
  large: "720px",
  full: "100%",
};

export const imageSection = defineSection<ImageSectionData>({
  key: "image",
  displayName: "Image",
  description: "A standalone image. Provide a URL, caption, size, and alignment.",
  category: "media",
  icon: PhotoIcon,
  defaultData: { url: "", altText: "", caption: "", size: "large", alignment: "center" },
  defaultTitle: "Image",
  defaultDescription: "Standalone image with caption.",
  aiExpandable: false,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Image</span>
        <ImagePicker
          value={data.url}
          onChange={(url) => onChange({ ...data, url })}
          previewClassName="h-36 w-full"
        />
      </label>
      <FormInput
        label="Alt text"
        value={data.altText}
        onChange={(altText) => onChange({ ...data, altText })}
        placeholder="Describe the image for screen readers"
      />
      <FormInput
        label="Caption (optional)"
        value={data.caption ?? ""}
        onChange={(caption) => onChange({ ...data, caption })}
      />
      <div className="@container">
        <div className="grid gap-3 @[26rem]:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Size</span>
          <select
            value={data.size}
            onChange={(e) => onChange({ ...data, size: e.target.value as ImageSectionData["size"] })}
            className="app-select"
          >
            {(Object.keys(SIZE_LABEL) as ImageSectionData["size"][]).map((size) => (
              <option key={size} value={size}>
                {SIZE_LABEL[size]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Alignment</span>
          <select
            value={data.alignment}
            onChange={(e) => onChange({ ...data, alignment: e.target.value as ImageSectionData["alignment"] })}
            className="app-select"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        </div>
      </div>
    </SimpleForm>
  ),
  Preview: ({ data }) => {
    if (!data.url) {
      return (
        <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
          No image set — pick one in the editor.
        </p>
      );
    }
    const alignClass =
      data.alignment === "center" ? "mx-auto" : data.alignment === "right" ? "ml-auto" : "";
    return (
      <figure className={`proposal-block-avoid ${alignClass}`} style={{ maxWidth: SIZE_WIDTHS[data.size] }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.url}
          alt={data.altText}
          className="block w-full rounded-[10px] border border-[var(--border-2)]"
        />
        {data.caption ? (
          <figcaption className="mt-2 text-center text-sm leading-6 text-[var(--text-3)]">
            {data.caption}
          </figcaption>
        ) : null}
      </figure>
    );
  },
});
