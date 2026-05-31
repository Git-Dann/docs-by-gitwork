"use client";

import { cn } from "@/lib/format";

/**
 * Small circular client avatar. Renders the client logo if present,
 * otherwise the client's initials on a quiet brand-tinted background.
 * Used on the Pipeline column header and the candidates registry table.
 */
export function ClientAvatar({
  name,
  logoUrl,
  size = "sm",
  className,
  title,
}: {
  name: string;
  logoUrl?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
  /** Tooltip override; defaults to the client name. */
  title?: string;
}) {
  const dimensions =
    size === "xs"
      ? "h-4 w-4 text-[8px]"
      : size === "md"
        ? "h-7 w-7 text-xs"
        : "h-5 w-5 text-[9px]";

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        title={title ?? name}
        className={cn(
          "shrink-0 rounded-full border border-[var(--border-2)] bg-white object-cover",
          dimensions,
          className,
        )}
      />
    );
  }

  return (
    <span
      title={title ?? name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--border-2)] bg-[var(--surface-brand)] font-semibold text-[var(--brand-700)]",
        dimensions,
        className,
      )}
      aria-label={name}
    >
      {initials || "·"}
    </span>
  );
}
