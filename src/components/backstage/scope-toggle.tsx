"use client";

import { cn } from "@/lib/format";

// Compact segmented control (Mine / Everyone). A recessed track with a single
// raised "pill" on the active option — reads as one intentional control rather
// than two loose buttons.
export function ScopeToggle({
  value,
  onChange,
}: {
  value: "me" | "all";
  onChange: (v: "me" | "all") => void;
}) {
  const options: Array<{ key: "me" | "all"; label: string }> = [
    { key: "me", label: "Mine" },
    { key: "all", label: "Everyone" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--surface-1)] p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-[6px] px-3 py-1 text-xs font-medium transition",
            value === o.key
              ? "bg-white text-[var(--text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-[var(--text-3)] hover:text-[var(--text-1)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
