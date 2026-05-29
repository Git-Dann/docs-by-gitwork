"use client";

import type { ComponentType, SVGProps } from "react";
import {
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  LightBulbIcon,
  NoSymbolIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const objectiveIconOptions = [
  { value: "bolt", label: "Bolt", icon: BoltIcon },
  { value: "shield", label: "Shield", icon: ShieldCheckIcon },
  { value: "rocket", label: "Rocket", icon: RocketLaunchIcon },
  { value: "sparkles", label: "Sparkles", icon: SparklesIcon },
  { value: "chart", label: "Chart", icon: ChartBarIcon },
  { value: "check", label: "Check", icon: CheckCircleIcon },
  { value: "lightbulb", label: "Lightbulb", icon: LightBulbIcon },
  { value: "puzzle", label: "Puzzle", icon: PuzzlePieceIcon },
  { value: "cog", label: "Cog", icon: Cog6ToothIcon },
] as const;

const iconMap = new Map<string, { value: string; label: string; icon: IconComponent }>(
  objectiveIconOptions.map((entry) => [entry.value, entry]),
);

/**
 * Lookup helper for objective icon by stored value. Returns `null` when the value is empty
 * or "none" so the section preview can skip the icon container entirely (the icon is
 * optional — users opt out by picking "None" in the picker).
 */
export function getObjectiveIcon(icon?: string): IconComponent | null {
  if (!icon || icon === "none") return null;
  return iconMap.get(icon)?.icon ?? null;
}

export function IconSelect({
  value,
  onChange,
}: {
  /** Selected icon key. `undefined` / `""` / `"none"` all render as "No icon". */
  value?: string;
  onChange: (value: string) => void;
}) {
  const selected = iconMap.get(value ?? "");
  const SelectedIcon = selected?.icon ?? NoSymbolIcon;
  const selectedLabel = selected?.label ?? "No icon";
  const isNone = !selected;

  return (
    <details className="group relative">
      <summary className="app-input-compact flex list-none items-center justify-between gap-3 cursor-pointer">
        <span className="flex items-center gap-2 text-sm text-[var(--text-1)]">
          <SelectedIcon className={cn("h-4 w-4", isNone ? "text-[var(--text-4)]" : "text-[var(--brand-600)]")} />
          {selectedLabel}
        </span>
        <span className="text-xs text-[var(--text-3)]">Select</span>
      </summary>

      {/* Anchored to the trigger's LEFT edge so the panel grows rightward into the description
          column rather than clipping against the editor's left rail. */}
      <div className="absolute left-0 z-20 mt-2 grid w-[280px] grid-cols-3 gap-2 rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-[var(--shadow-lg)]">
        <button
          type="button"
          onClick={(event) => {
            onChange("none");
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            isNone ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "",
          )}
        >
          <NoSymbolIcon className="h-5 w-5" />
          None
        </button>
        {objectiveIconOptions.map((option) => {
          const OptionIcon = option.icon;
          const isSelected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={(event) => {
                onChange(option.value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl px-3 py-3 text-center text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
                isSelected ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "",
              )}
            >
              <OptionIcon className="h-5 w-5" />
              {option.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}
