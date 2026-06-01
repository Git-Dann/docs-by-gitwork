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

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        {/* Widget header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
            07 // CLIENTS
          </span>
        </div>
        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-3xl tabular-nums text-[#0F172A]" style={{ fontFamily: "var(--font-display)" }}>{clients.length}</p>
            <p className="text-xs text-[#475569]">clients</p>
          </div>
          <p className="text-center text-xs text-[#475569]">
            {clients.length === 0 ? "No clients yet" : ""}
          </p>
        </div>
      </div>
    );
  }

  const displayCount = 7;

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          07 // CLIENTS
        </span>
        <Link href="/app/clients" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
          View all
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <BuildingOffice2Icon className="h-6 w-6 text-[#94A3B8]" />
              <p className="text-xs text-[#475569]">No clients yet</p>
              <Link href="/app/clients" className="text-xs font-medium text-[#1D4ED8] hover:underline">
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
                  <span className="truncate text-sm text-[#0F172A]">{c.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-[#475569]" style={{ fontFamily: "var(--font-mono)" }}>
                    {c.proposalCount} {c.proposalCount === 1 ? "proposal" : "proposals"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
