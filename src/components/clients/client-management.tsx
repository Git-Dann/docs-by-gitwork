"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { useClientList, useCreateClient, useDeleteClient } from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";

export function ClientManagement() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [clientName, setClientName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<{ slug: string; name: string } | null>(null);
  const { data, isPending, error } = useClientList({ search });
  const createClientMutation = useCreateClient();
  const deleteClientMutation = useDeleteClient();

  const clients = data?.clients ?? [];

  async function handleDeleteClient() {
    if (!clientToDelete) return;
    try {
      await deleteClientMutation.mutateAsync(clientToDelete.slug);
      setClientToDelete(null);
    } catch {
      // error is surfaced via mutation state
    }
  }

  async function handleCreateClient() {
    const trimmed = clientName.trim();

    if (!trimmed) {
      setFormError("Client name is required.");
      return;
    }

    setFormError(null);

    try {
      const result = await createClientMutation.mutateAsync({ name: trimmed });
      setClientName("");
      setShowCreate(false);
      router.push(`/app/portal/${result.client.slug}`);
    } catch (mutationError) {
      setFormError((mutationError as Error).message);
    }
  }

  return (
    <>
      <div className="space-y-5">
        <section className="app-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="app-eyebrow">Clients</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Client directory
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                Create client records directly, or let proposal metadata surface suggested clients automatically.
              </p>
            </div>

            <Button type="button" variant="primary" size="md" onClick={() => setShowCreate(true)}>
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
                            href={`/app/portal/${client.slug}`}
                            className={buttonStyles({ variant: "secondary", size: "xs" })}
                          >
                            Open client
                          </Link>
                          <Link
                            href={`/app/docs?new=1&client=${encodeURIComponent(client.name)}`}
                            className={buttonStyles({ variant: "tertiary", size: "xs" })}
                          >
                            New WIP doc
                          </Link>
                          {client.source === "MANUAL" ? (
                            <Button
                              type="button"
                              variant="danger"
                              size="xs"
                              onClick={() => setClientToDelete({ slug: client.slug, name: client.name })}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-sm text-[var(--text-4)]" colSpan={4}>
                      No clients yet. Create one here, or add a client name to any proposal draft and it will appear automatically.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {clientToDelete ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close delete client modal"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => setClientToDelete(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-md p-6">
              <p className="app-eyebrow">Confirm delete</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Delete {clientToDelete.name}?
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                This removes the client record. Any proposals linked to this client by name will remain unchanged.
              </p>
              {deleteClientMutation.error ? (
                <p className="mt-3 text-sm text-rose-700">
                  {(deleteClientMutation.error as Error).message}
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setClientToDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  loading={deleteClientMutation.isPending}
                  onClick={() => void handleDeleteClient()}
                >
                  Delete client
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close create client modal"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => {
              setShowCreate(false);
              setFormError(null);
            }}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-md p-6">
              <p className="app-eyebrow">Client</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Add client
              </h2>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Client name
                  </span>
                  <input
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    className="app-input"
                    placeholder="Acme Health"
                  />
                </label>

                {formError ? (
                  <p className="text-sm text-rose-700">{formError}</p>
                ) : null}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setShowCreate(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  loading={createClientMutation.isPending}
                  onClick={() => void handleCreateClient()}
                >
                  Save client
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
