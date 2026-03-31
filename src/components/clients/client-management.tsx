"use client";

import { MagnifyingGlassIcon, SparklesIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { useClientList } from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";

export function ClientManagement() {
  const [search, setSearch] = useState("");
  const { data, isPending, error } = useClientList({ search });

  const clients = data?.clients ?? [];

  return (
    <div className="space-y-5">
      <section className="app-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="app-eyebrow">Clients</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Suggested client directory
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              Client entries are inferred from proposal metadata, including drafts, so Docs and iOS stay aligned without a separate save step.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-sm font-medium text-[var(--text-2)]">
            <SparklesIcon className="h-4 w-4 text-[var(--brand-700)]" />
            Suggested from proposals
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients"
              className="app-input pl-9"
            />
          </label>

          <span className="app-chip ml-auto">
            {clients.length} client{clients.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <section className="app-table-shell">
        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr>
                <th className="text-left">Client</th>
                <th className="text-left">Source</th>
                <th className="text-left">Proposals</th>
                <th className="text-left">Added</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={5}>
                    Loading clients...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="text-sm text-rose-700" colSpan={5}>
                    {(error as Error).message}
                  </td>
                </tr>
              ) : clients.length ? (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {client.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={client.logoUrl}
                            alt={`${client.name} logo`}
                            className="h-10 w-10 rounded-lg border border-[var(--border-1)] object-contain p-1"
                          />
                        ) : (
                          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--surface-1)] text-sm font-semibold text-[var(--text-2)]">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-[var(--text-1)]">{client.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="inline-flex rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                        {client.source === "SUGGESTED" ? "Suggested" : client.source}
                      </span>
                    </td>
                    <td>{client.proposalCount}</td>
                    <td className="text-[var(--text-3)]">{formatDate(client.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/app/clients/${client.slug}`}
                          className={buttonStyles({ variant: "secondary", size: "xs" })}
                        >
                          Open client
                        </Link>
                        <Link
                          href={`/app/proposals?new=1&client=${encodeURIComponent(client.name)}`}
                          className={buttonStyles({ variant: "tertiary", size: "xs" })}
                        >
                          New proposal
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={5}>
                    No suggested clients yet. Add a client name to any proposal draft and it will appear here automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
