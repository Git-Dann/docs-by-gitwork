"use client";

import { useMemo, useState } from "react";
import { MegaphoneIcon, PaperAirplaneIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useClientList } from "@/hooks/use-proposals";
import { useBroadcastUpdate, useRecentSlackUpdates } from "@/hooks/use-tasks";

/**
 * DevOps broadcast — a free-form update posted to one or many client Slack
 * channels, no tasks required. Gated to the `tasks.publish` lead (rendered only
 * when `enabled`). Compact dashboard card → "New broadcast" opens the composer.
 */
export function BroadcastComposer({ index = 0, enabled = true }: { index?: number; enabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { data: recent } = useRecentSlackUpdates(enabled);

  const lastBroadcast = recent?.find((r) => r.kind === "BROADCAST" && r.clientId === null) ?? null;
  const lastLabel = lastBroadcast
    ? `Last broadcast · ${new Date(lastBroadcast.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : "No broadcasts yet today.";

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{String(index).padStart(2, "0")}</span>
          {" // DEVOPS BROADCAST"}
        </span>
      </div>
      <div className="widget-body space-y-3">
        <p className="text-xs text-[var(--text-3)]">
          Post a free-form update to one or more client channels — no tasks needed.
        </p>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-2)] pt-3">
          <span className="widget-timestamp">{lastLabel}</span>
          <Button
            type="button"
            variant="primary"
            leadingIcon={<MegaphoneIcon className="h-4 w-4" />}
            onClick={() => setOpen(true)}
          >
            New broadcast
          </Button>
        </div>
      </div>
      {open ? <BroadcastModal onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function BroadcastModal({ onClose }: { onClose: () => void }) {
  const { data } = useClientList({ status: "ACTIVE" });
  const clients = useMemo(() => data?.clients ?? [], [data]);
  const broadcast = useBroadcastUpdate();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [perClient, setPerClient] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [toRollup, setToRollup] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSend = selected.size > 0 && message.trim().length > 0 && !broadcast.isPending;

  async function handleSend() {
    setError(null);
    setResult(null);
    const clientIds = [...selected];
    const perClientMessages = perClient
      ? Object.fromEntries(
          clientIds
            .map((id) => [id, overrides[id]?.trim()] as const)
            .filter(([, v]) => Boolean(v)),
        )
      : undefined;
    try {
      const r = await broadcast.mutateAsync({
        clientIds,
        message: message.trim(),
        perClientMessages,
        toRollup,
      });
      setResult(
        r.postedCount > 0
          ? `Posted to ${r.postedCount} channel${r.postedCount === 1 ? "" : "s"}.`
          : "Saved, but no Slack channels are configured for those clients.",
      );
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Broadcast failed");
    }
  }

  return (
    <Modal open onClose={onClose} panelClassName="w-full max-w-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
        <div>
          <p className="widget-data-label">DEVOPS BROADCAST</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Post an update
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            Sends to each selected client&apos;s internal Slack channel.
          </p>
        </div>
      </div>

      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        {/* Clients */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="widget-data-label text-[var(--text-3)]">CLIENTS</p>
            <button
              type="button"
              className="text-[11px] font-medium text-[var(--brand-700)] hover:underline"
              onClick={() =>
                setSelected((prev) =>
                  prev.size === clients.length ? new Set() : new Set(clients.map((c) => c.id)),
                )
              }
            >
              {selected.size === clients.length && clients.length > 0 ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="grid max-h-44 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {clients.map((c) => (
              <label
                key={c.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-1)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]"
                />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <p className="widget-data-label mb-2 text-[var(--text-3)]">MESSAGE</p>
          <textarea
            className="app-textarea w-full"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's the update?"
          />
        </div>

        {/* Per-client override */}
        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={perClient}
              onChange={() => setPerClient((v) => !v)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]"
            />
            Customise the message per client
          </label>
          {perClient && selected.size > 0 ? (
            <div className="mt-3 space-y-2.5">
              {clients
                .filter((c) => selected.has(c.id))
                .map((c) => (
                  <div key={c.id}>
                    <p className="mb-1 text-[11px] font-medium text-[var(--text-3)]">{c.name}</p>
                    <textarea
                      className="app-textarea w-full"
                      rows={2}
                      value={overrides[c.id] ?? ""}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Leave blank to use the shared message"
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-2)] px-6 py-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={toRollup}
            onChange={() => setToRollup((v) => !v)}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]"
          />
          Also post to roll-up
        </label>
        <div className="flex items-center gap-3">
          {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
          {result ? (
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", "text-emerald-600")}>
              <CheckCircleIcon className="h-4 w-4" /> {result}
            </span>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={broadcast.isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
                onClick={handleSend}
                loading={broadcast.isPending}
                disabled={!canSend}
              >
                Send broadcast
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
