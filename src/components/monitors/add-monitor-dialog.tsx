"use client";

/**
 * Add or edit a monitor, from the Monitors page (/app/monitors).
 *
 * Edit (Shahab, Nov 2026: "a quick edit option when you open monitoring from the sidebar")
 * opens the same popup on one monitor, read in full from that client's wiki route, and saves
 * through the same PATCH the wiki's own edit uses.
 *
 * Pick the client, then the same fields the client's wiki offers (`MonitorFormFields`). It
 * saves through the client's own wiki route, so the monitor IS that client's wiki monitor:
 * there's no second copy to keep in step. The wiki, the Gitwork all-clients board and this
 * page all read the same rows, and `invalidateMonitorViews` refreshes the three together.
 *
 * Only clients this person can already open are offered. The route checks the same.
 */

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useClientWikiMonitors, useCreateMonitorForClient, useUpdateMonitorForClient } from "@/hooks/use-wiki";
import { EMPTY_MONITOR_FORM, formToMonitorInput, monitorToForm, type MonitorFormState } from "@/lib/monitor-form";
import { AGENCY_CLIENT_SLUG } from "@/lib/agency-client";
import { MonitorFormFields } from "@/components/clients/wiki/monitor-form-fields";

export interface AddMonitorClient {
  clientId: string;
  slug: string;
  name: string;
  monitorCount: number;
}

/** Gitwork first (it's us, and the one most often added to), then by name. */
export function orderAddMonitorClients(clients: AddMonitorClient[]): AddMonitorClient[] {
  return [...clients].sort((a, b) => {
    if (a.slug === AGENCY_CLIENT_SLUG) return -1;
    if (b.slug === AGENCY_CLIENT_SLUG) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function AddMonitorDialog({
  open,
  onClose,
  clients,
  initialClientId = null,
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  clients: AddMonitorClient[];
  /** Opened from a client's "Not monitored" chip: start on that client. */
  initialClientId?: string | null;
  /** Edit this monitor instead of adding one. Its client is fixed. */
  editing?: { clientId: string; monitorId: string } | null;
}) {
  const ordered = useMemo(() => orderAddMonitorClients(clients), [clients]);
  const [clientId, setClientId] = useState<string>("");
  const [form, setForm] = useState<MonitorFormState>(EMPTY_MONITOR_FORM);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMonitorForClient();
  const update = useUpdateMonitorForClient();
  const toast = useToast();
  const isEdit = editing !== null;
  const saving = create.isPending || update.isPending;

  // Each opening starts clean, on the client it was opened for.
  useEffect(() => {
    if (!open) return;
    const start = editing?.clientId ?? initialClientId;
    setClientId(start && ordered.some((c) => c.clientId === start) ? start : "");
    setForm(EMPTY_MONITOR_FORM);
    setLoadedFor(null);
    setError(null);
    // `ordered` is deliberately not a dependency: the page refetches every minute, and that
    // must not wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClientId, editing?.clientId, editing?.monitorId]);

  const client = ordered.find((c) => c.clientId === clientId) ?? null;

  // Edit: read the monitor in full (the board only carries what it shows), then fill the form
  // once. Later refetches leave what's being typed alone.
  const full = useClientWikiMonitors(open && isEdit && client ? client.slug : null);
  const monitor = isEdit ? (full.data?.monitors.find((m) => m.id === editing.monitorId) ?? null) : null;
  useEffect(() => {
    if (monitor && loadedFor !== monitor.id) {
      setForm(monitorToForm(monitor));
      setLoadedFor(monitor.id);
    }
  }, [monitor, loadedFor]);
  const loading = isEdit && loadedFor === null;
  const missing = isEdit && !full.isLoading && !!full.data && !monitor;

  async function save() {
    if (!client) {
      setError("Choose the client this monitor is for.");
      return;
    }
    const built = formToMonitorInput(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    try {
      if (isEdit) {
        await update.mutateAsync({ slug: client.slug, id: editing.monitorId, input: built.input });
        toast.success(`Saved ${built.input.name}`, `Changed on ${client.name}'s wiki too.`);
      } else {
        await create.mutateAsync({ slug: client.slug, input: built.input });
        toast.success(`Monitor added to ${client.name}`, "It's on their wiki under Monitors too.");
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : `Couldn't ${isEdit ? "save" : "add"} the monitor. Check the values and try again.`,
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={isEdit ? "Edit monitor" : "Add monitor"}
      panelClassName="app-dialog-fixed w-full max-w-xl"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {isEdit ? (
            <div className="text-[12px] font-medium text-[var(--text-2)]">
              Client
              <p className="mt-1 text-[14px] font-normal text-[var(--text-1)]">{client?.name ?? "—"}</p>
              <span className="mt-1.5 block text-[12px] font-normal text-[var(--text-4)]">
                Saved to {client?.name ?? "the client"}&apos;s wiki, under Monitors.
              </span>
            </div>
          ) : (
          <label className="block text-[12px] font-medium text-[var(--text-2)]">
            Client
            <select
              className="app-select mt-1 w-full"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setError(null);
              }}
            >
              <option value="" disabled>
                Choose a client…
              </option>
              {ordered.map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.name}
                  {c.monitorCount ? ` · ${c.monitorCount} monitor${c.monitorCount === 1 ? "" : "s"}` : ""}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-[12px] font-normal text-[var(--text-4)]">
              {client
                ? `Saved to ${client.name}'s wiki, under Monitors. Edit or remove it there, or here.`
                : "The monitor is saved to that client's wiki, under Monitors, and shows on this page too."}
            </span>
          </label>
          )}

          <div className="border-t border-[var(--border-1)] pt-4">
            {missing ? (
              <p className="text-[13px] text-[var(--text-3)]">This monitor has been removed. Close this and refresh the page.</p>
            ) : full.isError ? (
              <p role="alert" className="text-[13px] text-[var(--danger-500)]">Couldn&apos;t load this monitor. Close this and try again.</p>
            ) : loading ? (
              <div role="status" aria-label="Loading the monitor" className="space-y-3" aria-busy>
                <div className="h-14 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
                <div className="h-14 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
                <div className="h-14 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
              </div>
            ) : (
              <MonitorFormFields form={form} setForm={setForm} lockType={isEdit && form.type === "HEARTBEAT"} />
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-1)] px-5 py-3 sm:px-6">
          {error ? (
            <p role="alert" className="mr-auto min-w-0 flex-1 basis-full text-[12px] text-[var(--danger-500)] sm:basis-auto">
              {error}
            </p>
          ) : (
            <p className="mr-auto hidden text-[12px] text-[var(--text-4)] sm:block">
              {isEdit ? "Changes apply from the next check." : "It's checked as soon as it's added."}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[7px] border border-[var(--border-2)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || loading || missing}
            className="rounded-[7px] bg-[var(--brand-600)] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {isEdit ? (update.isPending ? "Saving…" : "Save") : create.isPending ? "Adding and checking…" : "Add monitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
