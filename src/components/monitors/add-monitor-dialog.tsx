"use client";

/**
 * Add monitor, from the Monitors page (/app/monitors).
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
import { useCreateMonitorForClient } from "@/hooks/use-wiki";
import { EMPTY_MONITOR_FORM, formToMonitorInput, type MonitorFormState } from "@/lib/monitor-form";
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
}: {
  open: boolean;
  onClose: () => void;
  clients: AddMonitorClient[];
  /** Opened from a client's "Not monitored" chip: start on that client. */
  initialClientId?: string | null;
}) {
  const ordered = useMemo(() => orderAddMonitorClients(clients), [clients]);
  const [clientId, setClientId] = useState<string>("");
  const [form, setForm] = useState<MonitorFormState>(EMPTY_MONITOR_FORM);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMonitorForClient();
  const toast = useToast();

  // Each opening starts clean, on the client it was opened for.
  useEffect(() => {
    if (!open) return;
    setClientId(initialClientId && ordered.some((c) => c.clientId === initialClientId) ? initialClientId : "");
    setForm(EMPTY_MONITOR_FORM);
    setError(null);
    // `ordered` is deliberately not a dependency: the page refetches every minute, and that
    // must not wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClientId]);

  const client = ordered.find((c) => c.clientId === clientId) ?? null;

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
      await create.mutateAsync({ slug: client.slug, input: built.input });
      toast.success(`Monitor added to ${client.name}`, "It's on their wiki under Monitors too.");
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't add the monitor. Check the values and try again.");
    }
  }

  return (
    <Modal open={open} onClose={create.isPending ? () => {} : onClose} title="Add monitor" panelClassName="app-dialog-fixed w-full max-w-xl">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
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

          <div className="border-t border-[var(--border-1)] pt-4">
            <MonitorFormFields form={form} setForm={setForm} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-1)] px-5 py-3 sm:px-6">
          {error ? (
            <p role="alert" className="mr-auto min-w-0 flex-1 basis-full text-[12px] text-[var(--danger-500)] sm:basis-auto">
              {error}
            </p>
          ) : (
            <p className="mr-auto hidden text-[12px] text-[var(--text-4)] sm:block">It&apos;s checked as soon as it&apos;s added.</p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            className="rounded-[7px] border border-[var(--border-2)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-[7px] bg-[var(--brand-600)] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {create.isPending ? "Adding and checking…" : "Add monitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
