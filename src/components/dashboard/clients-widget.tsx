"use client";

import Link from "next/link";
import { BuildingOffice2Icon } from "@heroicons/react/24/solid";
import { useClientList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";

export default function ClientsWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useClientList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const clients = data?.clients ?? [];
  const sorted = [...clients].sort((a, b) => b.proposalCount - a.proposalCount);

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col">
        <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
          <BuildingOffice2Icon className="h-2.5 w-2.5" />
          Portal
        </span>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{clients.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">clients</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {clients.length === 0 ? "No clients yet" : ""}
        </p>
      </div>
    );
  }

  const displayCount = size.rows >= 2 ? 7 : 3;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
          <BuildingOffice2Icon className="h-2.5 w-2.5" />
          Portal
        </span>
        <Link href="/app/clients" className="text-[11px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* List */}
      <div className="mt-2 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <BuildingOffice2Icon className="h-6 w-6 text-[var(--text-4)]" />
            <p className="text-[11px] text-[var(--text-3)]">No clients yet</p>
            <Link href="/app/clients" className="text-[11px] font-medium text-[var(--accent)] hover:underline">
              Add a client →
            </Link>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sorted.slice(0, displayCount).map((c) => (
              <Link
                key={c.id}
                href={`/app/clients/${c.id}`}
                className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
              >
                <span className="truncate text-xs text-[var(--text-1)]">{c.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-[var(--text-3)]">
                  {c.proposalCount} {c.proposalCount === 1 ? "proposal" : "proposals"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
