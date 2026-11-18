"use client";

import Link from "next/link";
import { BuildingOffice2Icon } from "@heroicons/react/24/solid";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { useClientList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";
import type { ClientListItem } from "@/types/client";
import { SkeletonRows } from "@/components/ui/motion/skeleton";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { Avatar } from "@/components/ui/avatar";
import { TileHeader } from "@/components/dashboard/tile-header";

/**
 * 03 // CLIENTS — summarised active-client cards. Built per Dan's HQ-pass-2 ask:
 *  - per-client card with logo (or initials fallback) + name + small mono
 *    stat line that matches the Portal cards' aesthetic, but compact
 *  - PENDING_REVIEW status pill (ACTIVE is the default, no pill needed)
 *  - inner scroll inside the bento tile so a long list doesn't blow out the
 *    grid height
 */
export default function ClientsWidget({ index }: { size: WidgetSize; index: number }) {
  const { data, isLoading } = useClientList();

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <TileHeader index={index} label="CLIENTS" href="/app/portal" />
        <SkeletonRows count={6} avatar className="p-4" />
      </div>
    );
  }

  const clients = data?.clients ?? [];
  // Active first, then most-recently-updated within each bucket.
  const sorted = [...clients].sort((a, b) => {
    if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  // Red/amber delivery health is the one thing worth surfacing in the header.
  const attention = sorted.filter((c) => c.health && c.health.level !== "green").length;

  return (
    <div className="flex h-full flex-col">
      <TileHeader
        index={index}
        label="CLIENTS"
        href="/app/portal"
        status={attention > 0 ? `${attention} NEED A LOOK` : sorted.length > 0 ? `${sorted.length} ACTIVE` : null}
        statusTone={attention > 0 ? "warning" : "muted"}
      />
      {sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-4 text-center">
          <BuildingOffice2Icon className="h-6 w-6 text-[var(--text-4)]" />
          <p className="text-xs text-[var(--text-3)]">No clients yet</p>
          <Link href="/app/portal" className="text-xs font-medium text-[var(--brand-700)] hover:underline">
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
    <div className="group flex items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-2 transition-colors hover:bg-[var(--surface-1)]">
      <Link href={`/app/portal/${client.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        {client.logoUrl ? (
          // Logos come from arbitrary client domains — keep raw <img> to avoid
          // configuring next/image remote patterns for every new client.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.logoUrl}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            decoding="async"
            className="h-7 w-7 shrink-0 rounded-[6px] object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-1)] text-[10px] font-semibold text-[var(--text-3)]">
            {initials(client.name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-[var(--text-1)]">{client.name}</p>
            {client.health && client.health.level !== "green" ? (
              <StatusDot
                size="xs"
                tone={client.health.level === "red" ? "danger" : "warning"}
                label={client.health.reasons.join(" · ") || "Needs a look"}
              />
            ) : null}
            {client.status === "PENDING_REVIEW" ? (
              <span className="shrink-0 rounded-[4px] bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                Pending
              </span>
            ) : null}
          </div>
          {stats.length > 0 ? (
            <p
              className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {stats.join(" · ")}
            </p>
          ) : null}
        </div>
      </Link>
      {(client.people ?? []).length > 0 ? (
        <span className="flex shrink-0 -space-x-1.5" aria-hidden>
          {(client.people ?? []).slice(0, 3).map((p) => (
            <Avatar key={p.id} src={p.avatarUrl} name={p.name} size={20} className="ring-2 ring-[var(--surface-0)]" />
          ))}
        </span>
      ) : null}
      <NewTaskButton
        clientId={client.id}
        clientName={client.name}
        className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
