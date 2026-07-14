"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";
import { usePermissions } from "@/hooks/use-permissions";

const baseItems = [
  { href: "/app/codeclear/devsignal", label: "Assessments" },
  { href: "/app/codeclear/devsignal/challenges", label: "Challenge bank" },
] as const;

/** Sub-nav within DevSignal: assessments · challenge bank · (super-admin) model. */
export function DevSignalSubNav() {
  const pathname = usePathname();
  const { canCalibrateDevSignal } = usePermissions();
  const items = canCalibrateDevSignal
    ? [...baseItems, { href: "/app/codeclear/devsignal/model", label: "Model" }]
    : [...baseItems];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const active =
          item.href === "/app/codeclear/devsignal"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center rounded-[6px] border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition",
              active
                ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:border-[var(--border-1)] hover:text-[var(--text-1)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
