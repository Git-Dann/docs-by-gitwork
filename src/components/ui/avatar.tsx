"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { initialsFrom } from "@/lib/avatar";

/**
 * Person avatar with a guaranteed graceful fallback.
 *
 * Renders the image when `src` is set AND it loads; if the URL is missing,
 * dead, or blocked, it falls back to an initials tile via `onError` — never the
 * browser's broken-image glyph. This is the single primitive every person
 * avatar should use so a bad stored URL (a stale GitHub photo, a 404) degrades
 * cleanly for any dev or client, everywhere.
 */
export function Avatar({
  src,
  name,
  size = 40,
  className,
  title,
}: {
  /** Image URL (or null/empty to show initials directly). */
  src?: string | null;
  /** Display name — drives the initials + alt/title. */
  name: string;
  /** Square px size; also scales the initials font. */
  size?: number;
  /** Extra classes on the rendered element (e.g. ring, margin). */
  className?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = title ?? name;

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        title={label}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] font-semibold text-[var(--brand-700)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initialsFrom(name)}
    </span>
  );
}
