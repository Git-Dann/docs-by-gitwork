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
 * A tight grid of square logo-only tiles (no text label — the mark speaks for itself), sized to
 * fit a narrow sidebar/outline panel. Sits above the ImagePicker so a custom logo is still one
 * click away for anyone who needs it.
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
    <div className="mb-2 grid grid-cols-3 gap-2">
      {PRESETS.map((preset) => {
        // Blank counts as the Foundry default (matches the resolution chain's fallback).
        const active = trimmed === preset.value || (!trimmed && preset.value === PRESETS[0].value);
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            aria-pressed={active}
            aria-label={preset.label}
            title={preset.label}
            className={cn(
              "relative flex aspect-square items-center justify-center rounded-[8px] border p-2.5 transition-colors",
              active
                ? "border-[var(--brand-600)] bg-[var(--surface-brand)]"
                : "border-[var(--border-2)] bg-white hover:border-[var(--border-1)]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preset.value} alt={preset.label} className="max-h-full max-w-full object-contain" />
            {active ? (
              <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--brand-600)] text-white">
                <CheckIcon className="h-2.5 w-2.5" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
