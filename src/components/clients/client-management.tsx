"use client";

import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { useClientList, useCreateClient } from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";

export function ClientManagement() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [clientName, setClientName] = useState("");
  const { data, isPending, error } = useClientList({ search });
  const createMutation = useCreateClient();

  const clients = data?.clients ?? [];

  async function handleCreate() {
    await createMutation.mutateAsync({ name: clientName });
    setClientName("");
    setShowCreate(false);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--border-1)] bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients"
              className="proposal-field-compact w-full pl-9"
            />
          </label>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setShowCreate(true)}
            leadingIcon={<PlusIcon className="h-4 w-4" />}
          >
            Add client
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border-1)] bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[rgba(16,24,40,0.08)] text-sm">
            <thead className="bg-white">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-[var(--text-3)]">Client</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--text-3)]">Proposals</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--text-3)]">Added</th>
                <th className="px-5 py-3 text-left font-medium text-[var(--text-3)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(16,24,40,0.08)]">
              {isPending ? (
                <tr>
                  <td className="px-5 py-6 text-[var(--text-3)]" colSpan={4}>
                    Loading clients...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-5 py-6 text-rose-700" colSpan={4}>
                    {(error as Error).message}
                  </td>
                </tr>
              ) : clients.length ? (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-5 py-4 font-medium text-[var(--text-1)]">{client.name}</td>
                    <td className="px-5 py-4 text-[var(--text-2)]">{client.proposalCount}</td>
                    <td className="px-5 py-4 text-[var(--text-2)]">{formatDate(client.createdAt)}</td>
                    <td className="px-5 py-4">
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
                  <td className="px-5 py-8 text-[var(--text-3)]" colSpan={4}>
                    No clients yet. Add one here or enter a client name while creating a proposal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close create client modal"
            className="absolute inset-0 bg-zinc-900/40"
            onClick={() => setShowCreate(false)}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border-1)] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-1)]">Add client</h2>
              <p className="mt-1 text-sm text-[var(--text-3)]">
                Create a client once, then link proposals to it from the cover section or create flow.
              </p>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Client name</span>
                <input
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Dan's Garden"
                  className="proposal-field-compact w-full"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" size="md" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleCreate}
                  loading={createMutation.isPending}
                >
                  Add client
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
