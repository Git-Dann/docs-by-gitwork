"use client";

import { PhotoIcon } from "@heroicons/react/24/outline";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

export function ImagePicker({
  value,
  onChange,
  className,
  previewClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  previewClassName?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onChange(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />

      <div
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-xl border border-[var(--border-1)] bg-[var(--surface-1)]",
          previewClassName ?? "h-40 w-full",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Selected asset" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[var(--text-3)]">
            <PhotoIcon className="h-7 w-7" />
            <p className="text-sm">No image selected</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {value ? "Replace image" : "Choose image"}
        </Button>
        {value ? (
          <Button type="button" variant="danger" size="sm" onClick={() => onChange("")}>
            Remove image
          </Button>
        ) : null}
      </div>
    </div>
  );
}
