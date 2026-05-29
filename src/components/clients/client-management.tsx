"use client";

import { MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useClientList, useCreateClient, useDeleteClient } from "@/hooks/use-proposals";
import { cn, formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// DeleteButton — floating popover, matches Pulse scan list pattern
// ---------------------------------------------------------------------------

function DeleteButton({ clientSlug }: { clientSlug: string }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync, isPending } = useDeleteClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const close = useCallback(() => setOpen(false), []);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.top, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await mutateAsync(clientSlug);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          "rounded-[6px] p-1.5 transition",
          open
            ? "bg-red-100 text-red-600"
            : "text-[var(--text-4)] hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100",
        )}
        title="Delete client"
      >
        <TrashIcon className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.top,
            right: coords.right,
            transform: "translateY(calc(-100% - 8px))",
          }}
          className="z-[9999] w-44 rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-xl"
        >
          <div className="absolute -bottom-1.5 right-3 h-3 w-3 rotate-45 border-b border-r border-[var(--border-2)] bg-white" />
          <p className="mb-2.5 text-xs font-medium text-[var(--text-1)]">Delete this client?</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex-1 rounded-[6px] bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition"
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); close(); }}
              className="flex-1 rounded-[6px] border border-[var(--border-2)] py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)] transition"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ClientManagement — main component
// ---------------------------------------------------------------------------

export function ClientManagement() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [clientName, setClientName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { data, isPending, error } = useClientList({ search });
  const createClientMutation = useCreateClient();

  const clients = data?.clients ?? [];

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
                    <tr
                      key={client.id}
                      className="group cursor-pointer"
                      onClick={() => router.push(`/app/portal/${client.slug}`)}
                    >
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
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <DeleteButton clientSlug={client.slug} />
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
