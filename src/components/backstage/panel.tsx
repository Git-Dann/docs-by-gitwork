import type { ReactNode } from "react";

// Foundry signature panel (see DESIGN.md): a widget-card with the
// `NN // WIDGET NAME` monospace header strip. Every Backstage surface uses this
// so the module reads like the rest of the platform rather than bare cards.
export function BackstagePanel({
  number,
  title,
  action,
  children,
  bodyClassName = "p-4",
}: {
  number?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          {number ? (
            <>
              <span className="widget-header__label--number">{number}</span>
              {` // ${title}`}
            </>
          ) : (
            title
          )}
        </span>
        {action ? <div className="flex items-center gap-1.5">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// Compact brand action button sized to sit inside a 36px widget header.
export function PanelAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[var(--brand-700)]"
    >
      {children}
    </button>
  );
}
