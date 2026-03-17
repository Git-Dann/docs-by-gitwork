import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-40 whitespace-nowrap rounded-lg bg-[#101828] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-[0_6px_18px_rgba(16,24,40,0.2)] transition group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top"
            ? "bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2"
            : "top-[calc(100%+8px)] left-1/2 -translate-x-1/2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
