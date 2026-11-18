/**
 * The `NN // NAME` strip every HQ tile wears (DESIGN.md widget grammar).
 *
 * Until November 2026 half the tiles drew their own header by hand: grey numbers, literal
 * `#94A3B8` and `rgba(0,0,0,0.08)`, which don't flip in dark mode. The other half used
 * `.widget-header` with a brand-coloured number. On one screen that read as two products.
 * Every tile now uses this, so the numbering and the chrome can't drift again.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function tileNumber(index: number): string {
  return String(index).padStart(2, "0");
}

export function TileHeader({
  index,
  label,
  status,
  statusTone = "muted",
  href,
  hrefLabel = "View all",
  children,
}: {
  index: number;
  label: string;
  /** The one figure worth a glance, e.g. "16 NEW". */
  status?: ReactNode;
  /** Colour the status only when it is a call to action; a tile that is always amber says nothing. */
  statusTone?: "muted" | "brand" | "warning" | "danger" | "success";
  /** "View all" link to the tile's source. */
  href?: string;
  hrefLabel?: string;
  /** Extra controls on the right (a refresh button, a toggle). */
  children?: ReactNode;
}) {
  return (
    <div className="widget-header shrink-0">
      <span className="widget-header__label">
        <span className="widget-header__label--number">{tileNumber(index)}</span>
        {` // ${label}`}
      </span>
      <div className="flex min-w-0 items-center gap-2.5">
        {status != null && status !== false ? (
          <span
            className={cn(
              "widget-header__status truncate",
              statusTone === "brand" && "text-[var(--brand-700)]",
              statusTone === "warning" && "text-[var(--warning-500)]",
              statusTone === "danger" && "text-[var(--danger-500)]",
              statusTone === "success" && "text-[var(--success-500)]",
            )}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {status}
          </span>
        ) : null}
        {children}
        {href ? (
          <Link
            href={href}
            className="shrink-0 text-xs text-[var(--text-3)] transition-colors hover:text-[var(--brand-700)]"
          >
            {hrefLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
