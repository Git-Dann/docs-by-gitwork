"use client";

import {
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useClientList, useCreateClient, useDeleteClient } from "@/hooks/use-proposals";
import { cn, formatDate } from "@/lib/format";
import type { ClientListItem } from "@/types/client";

// ---------------------------------------------------------------------------
// DeleteButton — floating popover, matches platform-wide pattern
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
          "rounded-[6px] p-1.5 transition-all",
          open
            ? "bg-red-100 text-red-600"
            : "text-[var(--text-4)] hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100",
        )}
        title="Delete client"
      >
        <TrashIcon className="h-3.5 w-3.5" />
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
          className="z-[9999] w-44 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-3 shadow-xl"
        >
          <div className="absolute -bottom-1.5 right-3 h-3 w-3 rotate-45 border-b border-r border-[rgba(0,0,0,0.08)] bg-white" />
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
              className="flex-1 rounded-[6px] border border-[rgba(0,0,0,0.14)] py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)] transition"
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
// ClientCard — card-based representation of a single client
// ---------------------------------------------------------------------------
function ClientCard({ client }: { client: ClientListItem }) {
  const router = useRouter();

  return (
    <article
      className="widget-card group cursor-pointer transition-shadow hover:shadow-[rgba(0,0,0,0.04)_0px_2px_8px]"
      onClick={() => router.push(`/app/portal/${client.slug}`)}
    >
      {/* Widget header */}
      <div className="widget-header">
        <span className="widget-header__label">
          {client.source === "SUGGESTED" ? (
            <span className="flex items-center gap-1">
              <SparklesIcon className="h-3 w-3 text-[var(--brand-700)]" />
              SUGGESTED
            </span>
          ) : (
            "CLIENT"
          )}
        </span>
        {/* Drive + ClickUp quick-links — right-aligned, no trash here */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {client.googleDriveFolderUrl && (
            <a
              href={client.googleDriveFolderUrl}
              target="_blank"
              rel="noreferrer"
              title="Google Drive"
              className="opacity-40 hover:opacity-70 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.google.com/s2/favicons?domain=drive.google.com&sz=16"
                alt="Google Drive"
                className="h-3.5 w-3.5 grayscale"
              />
            </a>
          )}
          {client.clickupUrl && (
            <a
              href={client.clickupUrl}
              target="_blank"
              rel="noreferrer"
              title="ClickUp"
              className="opacity-40 hover:opacity-70 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.google.com/s2/favicons?domain=app.clickup.com&sz=16"
                alt="ClickUp"
                className="h-3.5 w-3.5 grayscale"
              />
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Avatar + name + trash (appears on hover) */}
        <div className="flex items-center gap-3">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt={`${client.name} logo`}
              className="h-10 w-10 shrink-0 rounded-[6px] border border-[rgba(0,0,0,0.08)] object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]">
              <span className="text-sm font-semibold text-[var(--text-2)]">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <p className="flex-1 truncate font-semibold leading-snug text-[var(--text-1)]">
            {client.name}
          </p>
          <div onClick={(e) => e.stopPropagation()}>
            <DeleteButton clientSlug={client.slug} />
          </div>
        </div>

        {/* Stat + timestamp */}
        <div className="flex items-end justify-between border-t border-[rgba(0,0,0,0.06)] pt-3">
          {client.proposalCount > 0 ? (
            <div>
              <p
                className="text-3xl leading-none tracking-tight text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {client.proposalCount}
              </p>
              <p className="widget-data-label mt-1">
                {client.proposalCount === 1 ? "doc" : "docs"}
              </p>
            </div>
          ) : (
            <div>
              <p
                className="text-3xl leading-none tracking-tight text-[var(--text-4)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                —
              </p>
              <p className="widget-data-label mt-1 opacity-50">no docs yet</p>
            </div>
          )}
          <p className="widget-timestamp text-right">
            {formatDate(client.createdAt)}
          </p>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ClientManagement — Portal overview
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
  const suggestedCount = clients.filter((c) => c.source === "SUGGESTED").length;

  async function handleCreateClient() {
    const trimmed = clientName.trim();
    if (!trimmed) { setFormError("Client name is required."); return; }
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

        {/* ── 01 // PORTAL — search + stats ── */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {" // PORTAL"}
            </span>
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add client
            </Button>
          </div>

          <div className="widget-body--compact">
            <div className="flex flex-wrap items-center gap-4">
              {/* Search */}
              <label className="relative min-w-[200px] flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients"
                  className="app-input pl-9"
                />
              </label>

              {/* Stats */}
              {!isPending && !error && (
                <div className="flex items-center gap-5 ml-auto">
                  <div className="text-center">
                    <p
                      className="text-2xl leading-none tracking-tight text-[var(--text-1)]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {clients.length}
                    </p>
                    <p className="widget-data-label mt-1">total</p>
                  </div>
                  <div className="h-8 w-px bg-[rgba(0,0,0,0.08)]" />
                  <div className="text-center">
                    <p
                      className="text-2xl leading-none tracking-tight text-[var(--text-1)]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {suggestedCount}
                    </p>
                    <p className="widget-data-label mt-1">suggested</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Client grid ── */}
        {isPending ? (
          <div className="widget-card">
            <div className="widget-body py-16 text-center">
              <p className="widget-data-label animate-pulse">Loading clients…</p>
            </div>
          </div>
        ) : error ? (
          <div className="widget-card">
            <div className="widget-body py-16 text-center">
              <p className="text-sm text-rose-700">{(error as Error).message}</p>
            </div>
          </div>
        ) : clients.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        ) : (
          <div className="widget-card">
            <div className="widget-body py-20 text-center">
              <p className="text-sm font-medium text-[var(--text-2)]">No clients yet</p>
              <p className="mt-1 text-sm text-[var(--text-4)]">
                Click &ldquo;Add client&rdquo; above, or add a client name to any document draft and it
                will appear here automatically.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Create client modal ── */}
      {showCreate ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close"
            className="app-dialog-backdrop absolute inset-0"
            onClick={() => { setShowCreate(false); setFormError(null); }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="app-dialog-panel w-full max-w-md overflow-hidden">
              {/* Modal widget header */}
              <div className="widget-header">
                <span className="widget-header__label">NEW CLIENT</span>
              </div>
              <div className="p-6">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  Add client
                </h2>
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                      Client name
                    </span>
                    <input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleCreateClient(); }}
                      className="app-input"
                      placeholder="Acme Health"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
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
                    onClick={() => { setShowCreate(false); setFormError(null); }}
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
        </div>
      ) : null}
    </>
  );
}
