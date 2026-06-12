"use client";

import Link from "next/link";
import { BuildingOffice2Icon } from "@heroicons/react/24/solid";
import { useClientList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";
import type { ClientListItem } from "@/types/client";

/**
 * 06 // CLIENTS — summarised active-client cards. Built per Dan's HQ-pass-2 ask:
 *  - per-client card with logo (or initials fallback) + name + small mono
 *    stat line that matches the Portal cards' aesthetic, but compact
 *  - PENDING_REVIEW status pill (ACTIVE is the default, no pill needed)
 *  - inner scroll inside the bento tile so a long list doesn't blow out the
 *    grid height
 */
export default function ClientsWidget(_: { size: WidgetSize }) {
  const { data, isLoading } = useClientList();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const clients = data?.clients ?? [];
  // Active first, then most-recently-updated within each bucket.
  const sorted = [...clients].sort((a, b) => {
    if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span
          className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          06 // CLIENTS
        </span>
        <Link
          href="/app/portal"
          className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]"
        >
          View all
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-4 text-center">
          <BuildingOffice2Icon className="h-6 w-6 text-[#94A3B8]" />
          <p className="text-xs text-[#475569]">No clients yet</p>
          <Link href="/app/portal" className="text-xs font-medium text-[#1D4ED8] hover:underline">
            Add a client →
          </Link>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ul className="space-y-1.5">
            {sorted.map((c) => (
              <li key={c.id}>
                <ClientRow client={c} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ClientRow({ client }: { client: ClientListItem }) {
  const stats: string[] = [];
  if (client.devCount > 0) stats.push(`${client.devCount} dev${client.devCount === 1 ? "" : "s"}`);
  if (client.proposalCount > 0) {
    stats.push(`${client.proposalCount} doc${client.proposalCount === 1 ? "" : "s"}`);
  }
  if (client.retainerDays != null && client.retainerDays > 0) {
    const used = client.retainerDaysUsed ?? 0;
    stats.push(`${used}/${client.retainerDays}d retainer`);
  } else if (client.workingDays != null) {
    stats.push(`${client.workingDays}d`);
  }

  return (
    <Link
      href={`/app/portal/${client.slug}`}
      className="flex items-center gap-3 rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-white px-2.5 py-2 transition-colors hover:bg-[var(--surface-1)]"
    >
      {client.logoUrl ? (
        // Logos come from arbitrary client domains — keep raw <img> to avoid
        // configuring next/image remote patterns for every new client.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={client.logoUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-[6px] object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[10px] font-semibold text-[#475569]">
          {initials(client.name)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-[#0F172A]">{client.name}</p>
          {client.status === "PENDING_REVIEW" ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
              Pending
            </span>
          ) : null}
        </div>
        {stats.length > 0 ? (
          <p
            className="truncate text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {stats.join(" · ")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
