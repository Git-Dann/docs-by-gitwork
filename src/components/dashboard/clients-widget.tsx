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

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          08 // CLIENTS
        </span>
        <Link href="/app/portal" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
          View all
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <BuildingOffice2Icon className="h-6 w-6 text-[#94A3B8]" />
            <p className="text-xs text-[#475569]">No clients yet</p>
            <Link href="/app/portal" className="text-xs font-medium text-[#1D4ED8] hover:underline">
              Add a client →
            </Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-0.5">
              {sorted.slice(0, 10).map((c) => (
                <Link
                  key={c.id}
                  href={`/app/portal/${c.slug}`}
                  className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[#EFF6FF]"
                >
                  <span className="truncate text-sm text-[#0F172A]">{c.name}</span>
                  {c.proposalCount > 0 && (
                    <span className="ml-2 shrink-0 text-xs text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
                      {c.proposalCount} doc{c.proposalCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
