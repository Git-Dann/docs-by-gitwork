"use client";

import Link from "next/link";
import { useHrOverview } from "@/hooks/use-hr";
import { COMING_UP_LABEL } from "@/lib/hr";
import { formatDate } from "@/components/staff/profile-parts";
import type { WidgetSize } from "@/components/app-overview";
import { SkeletonWidget } from "@/components/ui/motion/skeleton";

/**
 * `NN // HR` on Foundry HQ, for people granted `hr.manage`: the dates coming up in the next
 * 60 days and how many records are missing details. The same data as Staff → People's
 * For HR card (`/api/staff/hr-overview`), which the server scopes to Gitwork staff for HR
 * who isn't an Admin.
 */
export default function HrWidget({ index }: { size: WidgetSize; index: number }) {
  const num = String(index).padStart(2, "0");
  const overview = useHrOverview(true);
  if (overview.isPending) return <SkeletonWidget />;

  const comingUp = overview.data?.comingUp ?? [];
  const missing = overview.data?.missing ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-1)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {`${num} // HR`}
        </span>
        <Link href="/app/staff" className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          Staff
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {overview.isError ? (
          <p className="text-xs text-[var(--text-3)]">Couldn&apos;t load HR reminders.</p>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[34px] leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
                {comingUp.length}
              </span>
              <span className="text-xs text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
                coming up · {missing.length} {missing.length === 1 ? "record" : "records"} missing details
              </span>
            </p>
            <div className="min-h-0 flex-1 overflow-hidden">
              {comingUp.length === 0 ? (
                <p className="text-xs text-[var(--text-3)]">Nothing due in the next 60 days.</p>
              ) : (
                <ul className="space-y-1">
                  {comingUp.slice(0, 3).map((i) => (
                    <li key={`${i.kind}:${i.name}:${i.date}`} className="flex items-baseline justify-between gap-3 text-xs">
                      <Link href={i.href} className="min-w-0 truncate text-[var(--text-1)] hover:underline" title={`${COMING_UP_LABEL[i.kind]}: ${i.name}`}>
                        {i.name} <span className="text-[var(--text-3)]">· {COMING_UP_LABEL[i.kind].toLowerCase()}</span>
                      </Link>
                      <span className="shrink-0 font-mono text-[11px] text-[var(--text-3)]">{formatDate(i.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
