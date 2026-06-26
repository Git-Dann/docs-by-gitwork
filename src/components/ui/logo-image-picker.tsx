"use client";

import { PhotoIcon } from "@heroicons/react/24/outline";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const OUTPUT_SIZE = 500; // resize to fit within 500×500

function resizeAndCompress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Scale down to fit within OUTPUT_SIZE × OUTPUT_SIZE, preserving aspect ratio
      let { width, height } = img;
      if (width > OUTPUT_SIZE || height > OUTPUT_SIZE) {
        const scale = Math.min(OUTPUT_SIZE / width, OUTPUT_SIZE / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
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
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };

    img.src = objectUrl;
  });
}

export function LogoImagePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
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
      setError("Image must be 2 MB or smaller.");
      return;
    }

    setProcessing(true);
    try {
      const dataUrl = await resizeAndCompress(file);
      onChange(dataUrl);
    } catch {
      setError("Could not process image. Please try a different file.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
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

      {/* Preview */}
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)]">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Logo preview" className="h-full w-full object-cover" />
          ) : (
            <PhotoIcon className="h-8 w-8 text-[var(--text-4)]" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={processing}
              onClick={() => inputRef.current?.click()}
            >
              {value ? "Change logo" : "Upload logo"}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => { onChange(""); setError(null); }}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-[var(--text-4)]">
            JPEG, PNG, SVG · max 2 MB · resized to 500 × 500
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
