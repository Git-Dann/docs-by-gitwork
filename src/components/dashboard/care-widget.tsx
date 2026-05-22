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
      href={`/app/support`}
      className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
    >
      <span className="truncate text-xs text-[var(--text-1)]">{name}</span>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        {openTickets > 0 && (
          <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-2)]">
            {openTickets}t
          </span>
        )}
        {unread > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function CareWidget({ size }: { size: WidgetSize }) {
  const { data: clientsData, isLoading } = useSupportClients();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const clients = clientsData?.clients ?? [];

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          <HeartIcon className="h-2.5 w-2.5" />
          Care
        </span>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{clients.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">clients</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {clients.length === 0 ? "No clients yet" : "Support active"}
        </p>
      </div>
    );
  }

  const displayCount = 7;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          <HeartIcon className="h-2.5 w-2.5" />
          Care
        </span>
        <Link href="/app/support" className="text-[11px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* List */}
      <div className="mt-2 flex-1 overflow-y-auto">
        {clients.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <HeartIcon className="h-6 w-6 text-[var(--text-4)]" />
            <p className="text-[11px] text-[var(--text-3)]">No support clients yet</p>
            <Link href="/app/support" className="text-[11px] font-medium text-[var(--accent)] hover:underline">
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
  );
}
