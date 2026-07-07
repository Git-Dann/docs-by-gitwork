"use client";

/**
 * Retention purge-review — the "needs attention" surface for admins/super-admins on On Your Desk.
 *
 * Aged data tiers to cold storage automatically and reversibly; the ONLY destructive step is
 * deleting a cold copy, and it never happens on its own. This banner shows when cold archives are
 * past their retention window and awaiting a decision; the modal lets an admin select and approve
 * permanent deletion (two-step confirm). Nothing here deletes without an explicit click.
 */

import { useState } from "react";
import { ArchiveBoxXMarkIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useApprovePurge, useDeskAttention, usePurgeCandidates } from "@/hooks/use-desk";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function PurgeReviewBanner({ enabled }: { enabled: boolean }) {
  const attention = useDeskAttention({ enabled });
  const [open, setOpen] = useState(false);

  const count = attention.data?.purgeReview.count ?? 0;
  if (!enabled || count === 0) return null;

  const bytes = attention.data?.purgeReview.reclaimableBytes ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-[10px] border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/10"
      >
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {count} {count === 1 ? "item is" : "items are"} ready to purge
          </p>
          <p
            className="text-[11px] uppercase tracking-[0.8px] text-amber-700/80 dark:text-amber-300/70"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Past retention · {formatBytes(bytes)} reclaimable · review to approve
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-300">Review →</span>
      </button>
      <PurgeReviewModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PurgeReviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const candidates = usePurgeCandidates({ enabled: open });
  const purge = useApprovePurge();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const rows = candidates.data?.candidates ?? [];
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doPurge = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await purge.mutateAsync([...selected]);
    setSelected(new Set());
    setConfirming(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Purge review" panelClassName="w-full max-w-2xl">
      <div className="p-5">
        <p className="mb-4 text-sm text-[var(--text-3)]">
          These cold archives are past their retention window. Purging permanently deletes the cold copy —
          it cannot be recovered. Aging itself is reversible; this is the only destructive step.
        </p>

        {candidates.isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-4)]">Nothing awaiting a purge decision.</p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
                }}
                className="text-xs font-medium text-[var(--brand-700)] hover:underline"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                {selected.size} selected
              </span>
            </div>

            <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 hover:border-[var(--brand-300)]">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-1)]">{r.policyKey}</p>
                      <p
                        className="text-[11px] text-[var(--text-4)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {r.entity} · {r.rowCount} rows{r.byteSize ? ` · ${formatBytes(r.byteSize)}` : ""}
                        {r.periodEnd ? ` · to ${r.periodEnd.slice(0, 10)}` : ""}
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={selected.size === 0 || purge.isPending}
                onClick={doPurge}
              >
                <ArchiveBoxXMarkIcon className="h-4 w-4" />
                {purge.isPending
                  ? "Purging…"
                  : confirming
                    ? `Confirm — permanently delete ${selected.size}`
                    : `Purge ${selected.size} selected`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
