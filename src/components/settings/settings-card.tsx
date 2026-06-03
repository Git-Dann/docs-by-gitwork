import { cn } from "@/lib/format";

/**
 * The canonical Settings section container — the platform's numbered widget signature.
 *
 * Renders a `widget-card` (surface-raised, {rounded.lg}, hairline border, no shadow) with the
 * `NN // SECTION NAME` mono header strip (`widget-header`) and a `widget-body`. This is the same
 * grammar used across HQ, Backstage, Tasks and the client cards — every Settings section uses
 * it so the whole area reads as one instrument, per DESIGN.md.
 *
 * Number sections sequentially WITHIN each Settings view (each section/tab restarts at `01`).
 * The title is uppercased by the header CSS — pass it in normal case.
 */
export function SettingsCard({
  number,
  title,
  right,
  tone = "default",
  className,
  bodyClassName,
  children,
}: {
  /** Two-digit section number, e.g. "01". */
  number: string;
  /** Section name shown after `NN // ` (CSS uppercases it). */
  title: string;
  /** Optional right-aligned header content — a status chip, count, or compact control. */
  right?: React.ReactNode;
  /** `danger` tints the card for destructive zones (delete workspace, etc.). */
  tone?: "default" | "danger";
  className?: string;
  /** Override the default `widget-body` padding/layout when a section needs it. */
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "widget-card",
        tone === "danger" && "border-[var(--danger-200)]",
        className,
      )}
    >
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${title}`}
        </span>
        {right ? <span className="widget-header__status">{right}</span> : null}
      </div>
      <div className={cn("widget-body", tone === "danger" && "bg-[var(--danger-50)]", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
