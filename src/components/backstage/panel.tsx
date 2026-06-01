import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

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

// Compact primary action sized to sit inside a 36px widget header. Uses the
// shared platform Button so Backstage matches the rest of the app.
export function PanelAction({
  onClick,
  leadingIcon,
  children,
}: {
  onClick: () => void;
  leadingIcon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Button type="button" variant="primary" size="xs" onClick={onClick} leadingIcon={leadingIcon}>
      {children}
    </Button>
  );
}
