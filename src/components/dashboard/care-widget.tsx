"use client";

import Link from "next/link";
import { HeartIcon } from "@heroicons/react/24/solid";
import { useSupportClients, useSupportTickets, useSupportConversations } from "@/hooks/use-support";
import type { WidgetSize } from "@/components/app-overview";

function ClientRow({ clientId, name }: { clientId: string; name: string }) {
  const { data: ticketData } = useSupportTickets(clientId);
  const { data: convoData } = useSupportConversations(clientId);

  const openTickets = (ticketData?.tickets ?? []).filter((t) => t.status !== "resolved").length;
  const unread = (convoData?.conversations ?? []).filter((c) => c.unread).length;

  return (
    <Link
      href={`/app/care`}
      className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
    >
      <span className="truncate text-sm text-[#0F172A]">{name}</span>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        {openTickets > 0 && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
            title={`${openTickets} open ticket${openTickets === 1 ? "" : "s"}`}
          >
            {openTickets} open
          </span>
        )}
        {unread > 0 && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--brand-700)]"
            title={`${unread} unread message${unread === 1 ? "" : "s"}`}
          >
            {unread} new
          </span>
        )}
      </div>
    </Link>
  );
}

export default function CareWidget({ index }: { size: WidgetSize; index: number }) {
  const num = String(index).padStart(2, "0");
  const { data: clientsData, isLoading } = useSupportClients();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const clients = clientsData?.clients ?? [];

  const displayCount = 7;

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          {`${num} // CARE`}
        </span>
        <Link href="/app/care" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
          View all
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex-1 overflow-y-auto">
          {clients.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <HeartIcon className="h-6 w-6 text-[#94A3B8]" />
              <p className="text-xs text-[#475569]">No support clients yet</p>
              <Link href="/app/care" className="text-xs font-medium text-[#1D4ED8] hover:underline">
                Add a client →
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5">
              {clients.slice(0, displayCount).map((c) => (
                <ClientRow key={c.id} clientId={c.id} name={c.name} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
