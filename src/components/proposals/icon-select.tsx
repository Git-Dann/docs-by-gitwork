"use client";

import type { ComponentType, SVGProps } from "react";
import {
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  LightBulbIcon,
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

const iconMap = new Map(objectiveIconOptions.map((entry) => [entry.value, entry]));

export function getObjectiveIcon(icon?: string): IconComponent {
  return iconMap.get(icon ?? "")?.icon ?? SparklesIcon;
}

export function IconSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: string) => void;
}) {
  const selected = iconMap.get(value ?? "") ?? objectiveIconOptions[0];
  const SelectedIcon = selected.icon;

  return (
    <details className="group relative">
      <summary className="app-input-compact flex list-none items-center justify-between gap-3 cursor-pointer">
        <span className="flex items-center gap-2 text-sm text-[var(--text-1)]">
          <SelectedIcon className="h-4 w-4 text-[var(--brand-600)]" />
          {selected.label}
        </span>
        <span className="text-xs text-[var(--text-3)]">Select</span>
      </summary>

      <div className="absolute right-0 z-20 mt-2 grid w-[280px] grid-cols-3 gap-2 rounded-[20px] border border-[var(--border-2)] bg-white p-3 shadow-[var(--shadow-lg)]">
        {objectiveIconOptions.map((option) => {
          const OptionIcon = option.icon;

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
                option.value === selected.value ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "",
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
