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
  /** Null = no column chosen yet (the table's own default order). */
  sort: { key: K; dir: SortDir } | null;
  onSort: (k: K) => void;
  align?: "left" | "right";
  title?: string;
  className?: string;
}) {
  const active = sort?.key === k;
  return (
    <th
      className={cn(align === "right" ? "text-right" : "text-left", className)}
      aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
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
          {sort?.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

/**
 * The same sorting control for a header that isn't a `<th>` (a CSS-grid list): a button with the
 * arrow, pressed while it's the active column. Matches SortHeader's look.
 */
export function SortButton<K extends string>({
  label,
  k,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  k: K;
  sort: { key: K; dir: SortDir } | null;
  onSort: (k: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort?.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-pressed={active}
      title={active ? `Sorted by ${label.toLowerCase()}, ${sort?.dir === "asc" ? "ascending" : "descending"}. Click to reverse.` : `Sort by ${label.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-[var(--text-1)]",
        align === "right" && "flex-row-reverse justify-self-end",
        align === "center" && "justify-self-center",
        active ? "text-[var(--text-1)]" : "",
        className,
      )}
      data-sort-key={k}
    >
      {label}
      <span aria-hidden className={cn("text-[9px]", active ? "opacity-100" : "opacity-0")}>
        {sort?.dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}
