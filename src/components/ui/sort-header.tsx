"use client";

import { cn } from "@/lib/format";

export type SortDir = "asc" | "desc";

/**
 * A table column header that sorts. One column at a time; clicking it again reverses it.
 * Shared by Pulse Projects, All scans, Staff and the Platform console.
 */
export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  align = "left",
  title,
  className,
}: {
  label: string;
  k: K;
  sort: { key: K; dir: SortDir };
  onSort: (k: K) => void;
  align?: "left" | "right";
  title?: string;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      className={cn(align === "right" ? "text-right" : "text-left", className)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-[var(--text-1)]",
          align === "right" && "flex-row-reverse",
          active ? "text-[var(--text-1)]" : "",
        )}
      >
        {label}
        <span aria-hidden className={cn("text-[9px]", active ? "opacity-100" : "opacity-0")}>
          {sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
