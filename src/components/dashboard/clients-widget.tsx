"use client";

import Link from "next/link";
import { useClientList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";

export default function ClientsWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useClientList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const clients = data?.clients ?? [];
  const sorted = [...clients].sort((a, b) => b.proposalCount - a.proposalCount);

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <span className="text-xs font-medium text-[var(--text-2)]">Portal</span>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{clients.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">clients</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {clients.length === 0 ? "No clients yet" : ""}
        </p>
      </div>
    );
  }

  const displayCount = size.rows >= 2 ? 6 : 3;

  return (
    <div className="flex h-full flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-2)]">Portal — Clients</span>
        <Link href="/app/clients" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--text-3)]">
          No clients yet
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto">
          {sorted.slice(0, displayCount).map((c) => (
            <Link
              key={c.id}
              href={`/app/clients/${c.id}`}
              className="flex items-center justify-between rounded-[6px] px-2 py-1.5 hover:bg-[var(--surface-1)]"
            >
              <span className="truncate text-xs text-[var(--text-1)]">{c.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-[var(--text-3)]">
                {c.proposalCount} proposal{c.proposalCount !== 1 ? "s" : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
