"use client";

import { CheckIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/format";

const PRESETS = [
  { value: "/foundry-logo.svg", label: "Foundry" },
  // Not /gitwork-logo.svg — despite the extension, that file is actually a raster PNG (mislabeled
  // in the repo) and renders broken as an <img src="…svg">. This is the real Gitwork wordmark.
  { value: "/gitwork-logo-home-page.png", label: "Gitwork" },
] as const;

/**
 * One-click swap between the two bundled cover marks — the ask that made a raw ImagePicker
 * (paste a URL) too much friction for something that's really just "which of our two logos".
 * Sits above the ImagePicker so a custom logo is still one click away for anyone who needs it.
 */
export function LogoQuickSwap({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const trimmed = value.trim();
  return (
    <div className="mb-2 flex gap-2">
      {PRESETS.map((preset) => {
        // Blank counts as the Foundry default (matches the resolution chain's fallback).
        const active = trimmed === preset.value || (!trimmed && preset.value === PRESETS[0].value);
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-2 rounded-[8px] border px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--text-1)]"
                : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:border-[var(--border-1)]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preset.value} alt="" className="h-4 w-auto max-w-[64px] object-contain" />
            {preset.label}
            {active ? <CheckIcon className="h-3.5 w-3.5 text-[var(--brand-600)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}
