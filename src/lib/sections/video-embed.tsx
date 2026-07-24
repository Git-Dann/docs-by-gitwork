/**
 * Section type: `video_embed` — YouTube / Loom / Vimeo URL renders as an embedded player.
 * Falls back to a captioned link for unrecognised hosts (and in PDF, since players don't print).
 */

import { VideoCameraIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput, FormTextArea } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { renderInline } from "@/lib/markdown";
import type { VideoEmbedSectionData } from "@/types/proposal";

/** Resolve a paste-friendly URL to an embeddable src. Returns null for unrecognised hosts. */
function toEmbedSrc(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    // YouTube — watch / youtu.be / shorts
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    // Loom — /share/{id}
    if (u.hostname.includes("loom.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://www.loom.com/embed/${id}` : null;
    }
    // Vimeo — vimeo.com/{id}
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

const ASPECT_PADDING: Record<NonNullable<VideoEmbedSectionData["aspectRatio"]>, string> = {
  "16:9": "56.25%",
  "4:3":  "75%",
  "1:1":  "100%",
};

export const videoEmbedSection = defineSection<VideoEmbedSectionData>({
  key: "video_embed",
  displayName: "Video Embed",
  description: "YouTube, Loom, or Vimeo — embeds as a player online; links in PDF.",
  category: "media",
  icon: VideoCameraIcon,
  defaultData: { url: "", caption: "", aspectRatio: "16:9" },
  defaultTitle: "Walkthrough video",
  defaultDescription: "Embedded video from YouTube, Loom, or Vimeo.",
  aiExpandable: false,
  Editor: ({ data, onChange }) => (
    <SimpleForm>
      <FormInput
        label="Video URL"
        value={data.url}
        onChange={(url) => onChange({ ...data, url })}
        placeholder="https://loom.com/share/…"
      />
      <FormTextArea
        label="Caption (optional)"
        value={data.caption ?? ""}
        onChange={(caption) => onChange({ ...data, caption })}
        rows={2}
      />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Aspect ratio</span>
        <select
          value={data.aspectRatio ?? "16:9"}
          onChange={(e) =>
            onChange({ ...data, aspectRatio: e.target.value as VideoEmbedSectionData["aspectRatio"] })
          }
          className="app-select-compact"
        >
          <option value="16:9">16:9 (standard widescreen)</option>
          <option value="4:3">4:3</option>
          <option value="1:1">1:1 (square)</option>
        </select>
      </label>
    </SimpleForm>
  ),
  Preview: ({ data }) => {
    const src = toEmbedSrc(data.url);
    const aspect = ASPECT_PADDING[data.aspectRatio ?? "16:9"];

    if (!data.url) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          No video URL yet — paste a Loom, YouTube, or Vimeo link in the editor.
        </p>
      );
    }

    return (
      <figure className="proposal-block-avoid space-y-2">
        {src ? (
          <div
            className="relative w-full overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-black"
            style={{ paddingTop: aspect }}
          >
            <iframe
              src={src}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              title={data.caption || "Embedded video"}
            />
          </div>
        ) : (
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm text-[var(--brand-700)] hover:border-[var(--brand-600)]"
          >
            <VideoCameraIcon className="h-4 w-4" />
            Open video at {new URL(data.url).hostname.replace("www.", "")}
          </a>
        )}
        {data.caption ? (
          <figcaption className="text-[12px] italic text-[var(--text-3)]">
            {renderInline(data.caption, "vid-cap")}
          </figcaption>
        ) : null}
      </figure>
    );
  },
});
