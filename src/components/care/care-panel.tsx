import { cn } from "@/lib/format";

/**
 * The container every Care surface is built from — the platform's numbered widget signature.
 *
 * Care hand-rolled its panel headers in four places with three different paddings (`px-4 py-2.5`,
 * `px-3 py-2`, `px-2`), none of them the 36px strip DESIGN.md specifies, and never used
 * `widget-card` at all. That is most of why Care looked like a different product from the rest of
 * Foundry: same information, different chrome on every pane.
 *
 * This is deliberately the same shape as `SettingsCard` rather than a new invention — one grammar,
 * learned once. Number panes sequentially WITHIN a view (each view restarts at `01`); the header
 * CSS uppercases the title, so pass it in normal case.
 */
export function CarePanel({
  number,
  title,
  right,
  className,
  bodyClassName,
  /** Drop the body padding — for flush content like a conversation list or a table. */
  flush = false,
  children,
}: {
  /** Two-digit pane number, e.g. "01". */
  number: string;
  /** Pane name shown after `NN // `. */
  title: string;
  /** Right-aligned header content — a count, a status chip, a compact control. */
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("widget-card", className)}>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${title}`}
        </span>
        {right ? <span className="widget-header__status">{right}</span> : null}
      </div>
      <div className={cn(flush ? "min-w-0" : "widget-body", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A figure and its unit label — DM Serif Display over a mono caps label, per DESIGN.md's stat
 * grammar.
 *
 * Exists because Care got this wrong in a way nothing could catch: it wrote
 * `font-[var(--font-display)]`, which in Tailwind v4 compiles to `font-weight: <the font family>`
 * — not a family at all. Every "editorial" figure in Care has been rendering in Inter while the
 * code and its comments claimed otherwise. `font-[family-name:…]` is the correct form; putting it
 * behind a component means it can only be got right once.
 */
export function CareStat({
  value,
  label,
  tone = "default",
  size = "sm",
}: {
  value: React.ReactNode;
  label: string;
  /** `attention` for work that is waiting, `critical` for urgent, `muted` for a zero. */
  tone?: "default" | "attention" | "critical" | "muted";
  size?: "sm" | "lg";
}) {
  return (
    <div>
      <div
        className={cn(
          "font-[family-name:var(--font-display)] leading-none",
          size === "lg" ? "text-[32px]" : "text-[28px]",
          tone === "attention" && "text-[var(--warning-500)]",
          tone === "critical" && "text-[var(--danger-500)]",
          tone === "muted" && "text-[var(--text-4)]",
          tone === "default" && "text-[var(--text-1)]",
        )}
      >
        {value}
      </div>
      <div className="widget-data-label mt-1">{label}</div>
    </div>
  );
}

/**
 * The sanctioned empty state: a numbered pane of its own, a serif line saying what is true, and
 * exactly one action. Care used bare grey sentences — including one that told the user to go and
 * use the legacy dashboard instead.
 */
export function CareEmpty({
  headline,
  body,
  action,
}: {
  headline: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-[family-name:var(--font-display)] text-[22px] leading-snug text-[var(--text-1)]">
        {headline}
      </p>
      {body ? <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--text-3)]">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
