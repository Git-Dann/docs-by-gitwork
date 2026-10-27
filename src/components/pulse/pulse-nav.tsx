"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { usePermissions } from "@/hooks/use-permissions";
import { isExternalRole } from "@/types/auth";
import {
  PULSE_APP_BASE,
  activePulseNavId,
  pulseNavHref,
  visiblePulseNavItems,
} from "@/lib/pulse-nav";

/**
 * Pulse's own navigation, rendered at the top of every Pulse page except a scan's report.
 *
 * The shape is the platform's pick-one segmented control (DESIGN.md, the Care views and the
 * wiki's doc tabs): mono caps in a hairline well, the current page a raised chip in brand.
 * On a phone it scrolls sideways rather than wrapping, so the row keeps one height; it is
 * never inside a `.widget-card`, whose `overflow: hidden` would clip it (§45.2).
 *
 * `base` is "/app/pulse" in the app and "/demo/pulse" in the demo, so one component serves
 * both. Internal-only items (Monitors, Growth) are hidden while the account is loading and
 * from external roles, the same rule as `InternalOnly`; their routes are also internal-only
 * in the module gate, because a hidden link is not access control.
 */
export function PulseNav({
  base = PULSE_APP_BASE,
  newScanHref = `${PULSE_APP_BASE}/new`,
}: {
  base?: string;
  /** Where "New scan" goes; null hides it (the demo has no scan form). */
  newScanHref?: string | null;
}) {
  const pathname = usePathname();
  const account = useAccount();
  const { canGenerateAi } = usePermissions();
  const internal = !account.isPending && !isExternalRole(account.data?.role);
  const items = visiblePulseNavItems({ internal });
  const active = activePulseNavId(pathname, base);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Pulse" className="min-w-0 max-w-full overflow-x-auto">
        <ul className="inline-flex min-w-max gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
          {items.map((item) => {
            const on = item.id === active;
            return (
              <li key={item.id}>
                <Link
                  href={pulseNavHref(base, item)}
                  aria-current={on ? "page" : undefined}
                  className={[
                    "block whitespace-nowrap rounded-[6px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.05em] transition-colors sm:px-3 sm:text-[11px]",
                    on
                      ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Running a scan spends AI tokens, so it is offered to whoever may generate; the
          API enforces the same rule. */}
      {newScanHref && canGenerateAi && (
        <Link href={newScanHref} className="shrink-0">
          <Button variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />} className="whitespace-nowrap">
            New scan
          </Button>
        </Link>
      )}
    </div>
  );
}
