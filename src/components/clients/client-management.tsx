"use client";

import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ImagePicker } from "@/components/ui/image-picker";
import { useClientList, useCreateClient } from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";

export function ClientManagement() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientLogoUrl, setClientLogoUrl] = useState("");
  const { data, isPending, error } = useClientList({ search });
  const createMutation = useCreateClient();

  const clients = data?.clients ?? [];

  async function handleCreate() {
    await createMutation.mutateAsync({ name: clientName, logoUrl: clientLogoUrl });
    setClientName("");
    setClientLogoUrl("");
    setShowCreate(false);
  }

  return (
    <div className="space-y-5">
      <section className="app-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="app-eyebrow">Clients</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Account records
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              Keep logos, naming, and proposal relationships tidy before documents move to delivery.
            </p>
          </div>

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
                <th className="text-left">Proposals</th>
                <th className="text-left">Added</th>
                <th className="text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                    Loading clients...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="text-sm text-rose-700" colSpan={4}>
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
                  <td className="text-sm text-[var(--text-4)]" colSpan={4}>
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
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => setShowCreate(false)}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-md p-6">
              <p className="app-eyebrow">Create</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Add client
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                Create a client once, then link proposals to it from the cover section or create flow.
              </p>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Client name</span>
                <input
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Dan's Garden"
                  className="app-input"
                />
              </label>

              <div className="mt-5 space-y-1.5">
                <span className="text-sm font-medium text-[var(--text-2)]">Client logo</span>
                <ImagePicker
                  value={clientLogoUrl}
                  onChange={setClientLogoUrl}
                  previewClassName="h-36 w-full"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
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
