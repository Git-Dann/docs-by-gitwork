"use client";

/**
 * Portal → Deleted. Deleting a client hides it (the row and everything on it is kept), which is
 * the safe default — but with nowhere to see hidden clients, a deleted client was invisible AND
 * still held its name, so it could neither be brought back nor re-added. This lists them with two
 * ways out: Restore (exactly as it was) and, for Super Admins, Delete permanently.
 */

import { useState } from "react";
import { ArrowUturnLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useDeletedClients, usePurgeClient, useRestoreClient } from "@/hooks/use-proposals";
import { formatDate } from "@/lib/format";
import type { DeletedClient } from "@/lib/api";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export function DeletedClientsList({ search, canPurge }: { search: string; canPurge: boolean }) {
  const { data, isPending, error } = useDeletedClients();
  const restore = useRestoreClient();
  const { success, error: toastError } = useToast();
  const [purging, setPurging] = useState<DeletedClient | null>(null);

  const q = search.trim().toLowerCase();
  const clients = (data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));

  if (isPending) {
    return (
      <div className="widget-card">
        <div className="widget-body py-16 text-center">
          <p className="widget-data-label animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="widget-card">
        <div className="widget-body py-16 text-center">
          <p className="text-sm text-[var(--danger-500)]">{errorText(error)}</p>
        </div>
      </div>
    );
  }
  if (clients.length === 0) {
    return (
      <div className="widget-card">
        <div className="widget-body py-20 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">{q ? "No deleted clients match" : "Nothing deleted"}</p>
          <p className="mt-1 text-sm text-[var(--text-4)]">
            Deleted clients land here, kept as they were, until they&apos;re restored or deleted permanently.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="widget-data-label">Deleted</span>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--surface-2)] px-1.5 text-[11px] font-semibold text-[var(--text-3)]">
          {clients.length}
        </span>
      </div>
      <ul className="widget-card divide-y divide-[var(--border-2)]">
        {clients.map((c) => (
          <li key={c.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text-1)]" title={c.name}>
                {c.name}
              </p>
              <p className="text-[12px] text-[var(--text-4)]">Deleted {formatDate(c.deletedAt)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(c.slug, {
                    onSuccess: () => success(`${c.name} restored.`),
                    onError: (e) => toastError(errorText(e)),
                  })
                }
              >
                <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                Restore
              </Button>
              {canPurge ? (
                <Button type="button" variant="secondary" size="xs" onClick={() => setPurging(c)}>
                  <TrashIcon className="h-3.5 w-3.5 text-[var(--danger-500)]" />
                  Delete permanently
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!canPurge ? (
        <p className="text-[12px] text-[var(--text-4)]">Only a Super Admin can delete a client permanently.</p>
      ) : null}
      <PurgeClientModal client={purging} onClose={() => setPurging(null)} />
    </section>
  );
}

function PurgeClientModal({ client, onClose }: { client: DeletedClient | null; onClose: () => void }) {
  const purge = usePurgeClient();
  const { success, error: toastError } = useToast();
  const [typed, setTyped] = useState("");
  const matches = !!client && typed.trim().toLowerCase() === client.name.trim().toLowerCase();

  function close() {
    setTyped("");
    onClose();
  }

  async function confirm() {
    if (!client || !matches) return;
    try {
      await purge.mutateAsync({ slug: client.slug, confirmName: typed });
      success(`${client.name} was deleted permanently.`);
      close();
    } catch (e) {
      toastError(errorText(e));
    }
  }

  return (
    <Modal open={client !== null} onClose={close} title="Delete permanently" panelClassName="w-full max-w-md">
      {client ? (
        <div className="space-y-4 p-5">
          <p className="text-sm text-[var(--text-1)]">
            This permanently deletes <span className="font-semibold">{client.name}</span>. It can&apos;t be undone.
          </p>
          <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-3)]">
            <p>
              <span className="font-medium text-[var(--text-2)]">Deleted with it:</span> tasks, timeline, wiki and its pages,
              platforms, designs, activity, bank details and team assignments.
            </p>
            <p className="mt-1.5">
              <span className="font-medium text-[var(--text-2)]">Kept, unlinked:</span> documents and proposals, meeting notes,
              Pulse scans and Care records.
            </p>
          </div>
          <label className="block">
            <span className="widget-data-label mb-1.5 block">Type “{client.name}” to confirm</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirm();
              }}
              className="app-input w-full"
              autoComplete="off"
              aria-label={`Type ${client.name} to confirm`}
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-[var(--border-2)] pt-3">
            <Button type="button" variant="tertiary" onClick={close}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={() => void confirm()} disabled={!matches} loading={purge.isPending}>
              Delete permanently
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
