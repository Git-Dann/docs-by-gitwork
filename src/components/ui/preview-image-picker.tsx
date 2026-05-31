"use client";

/**
 * PreviewImagePicker — landscape card preview image picker.
 *
 * Used on Platform and Design cards. Accepts a file upload or an external
 * URL (e.g. the auto-detected OG image). Compresses uploads to JPEG @82%
 * quality, capped at 1200 px wide.
 */

import { PhotoIcon } from "@heroicons/react/24/outline";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB source limit
const MAX_WIDTH = 1200; // OG standard max width

function resizeAndCompress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas not available"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };

    img.src = objectUrl;
  });
}

export function PreviewImagePicker({
  value,
  onChange,
  suggestedUrl,
}: {
  /** Current value — either a data URL or an external https URL, or empty. */
  value: string;
  onChange: (value: string) => void;
  /** Auto-detected OG image URL (shown as a secondary option). */
  suggestedUrl?: string | null;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Source image must be 3 MB or smaller.");
      return;
    }

    setProcessing(true);
    try {
      const dataUrl = await resizeAndCompress(file);
      onChange(dataUrl);
    } catch {
      setError("Could not process image. Try a different file.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />

      {/* Landscape preview */}
      <div
        className="relative w-full overflow-hidden rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)]"
        style={{ aspectRatio: "1200 / 630" }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PhotoIcon className="h-8 w-8 text-[var(--text-4)]" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={processing}
          onClick={() => inputRef.current?.click()}
        >
          {value ? "Change image" : "Upload image"}
        </Button>

        {suggestedUrl && suggestedUrl !== value && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange(suggestedUrl)}
          >
            Use auto-detected
          </Button>
        )}

        {value && (
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => { onChange(""); setError(null); }}
          >
            Remove
          </Button>
        )}
      </div>

      {/* Guidance */}
      <p className="text-xs leading-5 text-[var(--text-4)]">
        <span className="font-medium text-[var(--text-3)]">Recommended:</span>{" "}
        1200 × 630 px (16:9) · JPEG or PNG · max 3 MB source.{" "}
        Uploaded images are automatically resized to 1200 px wide and
        compressed to JPEG at 82% quality before saving.
      </p>

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
