"use client";

import Link from "next/link";
import { useSupportClients, useSupportTickets, useSupportConversations } from "@/hooks/use-support";
import type { WidgetSize } from "@/components/app-overview";

function ClientRow({ clientId, name }: { clientId: string; name: string }) {
  const { data: ticketData } = useSupportTickets(clientId);
  const { data: convoData } = useSupportConversations(clientId);

  const openTickets = (ticketData?.tickets ?? []).filter(
    (t) => t.status !== "resolved",
  ).length;
  const unread = (convoData?.conversations ?? []).filter((c) => c.unread).length;

  return (
    <div className="flex items-center justify-between rounded-[6px] px-2 py-1.5">
      <span className="truncate text-xs text-[var(--text-1)]">{name}</span>
      <div className="flex items-center gap-2">
        {openTickets > 0 && (
          <span className="text-[10px] font-medium text-[var(--text-2)]">
            {openTickets} ticket{openTickets !== 1 ? "s" : ""}
          </span>
        )}
        {unread > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CareWidget({ size }: { size: WidgetSize }) {
  const { data: clientsData, isLoading } = useSupportClients();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const clients = clientsData?.clients ?? [];

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <span className="text-xs font-medium text-[var(--text-2)]">Care</span>
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
        <span className="text-xs font-semibold text-[var(--text-2)]">Care</span>
        <Link href="/app/support" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--text-3)]">
          No support clients yet
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {clients.slice(0, displayCount).map((c) => (
            <ClientRow key={c.id} clientId={c.id} name={c.name} />
          ))}
        </div>
      )}
    </div>
  );
}
