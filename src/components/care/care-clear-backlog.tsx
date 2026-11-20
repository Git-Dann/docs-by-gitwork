"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Spinner } from "@/components/ui/motion/spinner";
import { useToast } from "@/components/ui/toast";
import { useCloseConversationsOlderThan } from "@/hooks/use-support";
import { RESET_PRESET_DAYS, describeResetPlan, resolveResetCutoff } from "@/lib/care-reset";
import { cn } from "@/lib/format";

/**
 * Clear a backlog.
 *
 * Care read 573 awaiting across two clients, every row still `status: new`, stretching back six
 * months. A one-off `UPDATE` on the box would have cleared it — and the same thing happens the
 * next time a mailbox with history is connected, which is every time. So it is a control.
 *
 * The dialog counts first and says the number in prose before anything is written, because the
 * control reads destructive and is not: the commonest reason someone does not clear a backlog
 * they should clear is not knowing whether it throws anything away.
 *
 * ⚠️ `.app-dialog-fixed`: the body changes height as the count arrives and as a date is picked,
 * and a dialog that resizes under the cursor is the thing that contract exists to stop (§46).
 */
export function ClearBacklogModal({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const close = useCloseConversationsOlderThan(clientId);
  const [presetDays, setPresetDays] = useState<number | null>(7);
  const [iso, setIso] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * ⚠️ "Now" is frozen when the dialog opens, and the cutoff is memoised on the inputs.
   *
   * `resolveResetCutoff` calls `new Date()` by default, so computing it inline produced a new
   * millisecond on every render — the effect below depends on the cutoff, so it set state, which
   * re-rendered, which moved the cutoff again: "Maximum update depth exceeded", a spinner that
   * never resolved, and a dialog that could not say its own number. tsc, lint and the unit tests
   * were all clean through it; only rendering the thing found it.
   *
   * Freezing it is also the correct behaviour: the cutoff should be decided when you choose it,
   * not drift by a second every time React re-renders while you read the sentence.
   */
  const openedAt = useRef(new Date());
  const resolved = useMemo(
    () => resolveResetCutoff(presetDays !== null ? { presetDays } : { iso }, openedAt.current),
    [presetDays, iso],
  );

  // Count on every change of the cutoff, so the sentence is always about what is on screen.
  useEffect(() => {
    if (!resolved.ok) {
      setCount(null);
      return;
    }
    let cancelled = false;
    setCounting(true);
    close
      .mutateAsync({ before: resolved.cutoff.toISOString(), dryRun: true })
      .then((r) => {
        if (!cancelled) setCount(r.count ?? 0);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't count those conversations.");
      })
      .finally(() => {
        if (!cancelled) setCounting(false);
      });
    return () => {
      cancelled = true;
    };
    // `resolved` is memoised on the inputs; `close` is a stable mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  async function run() {
    if (!resolved.ok) return;
    setError(null);
    try {
      const res = await close.mutateAsync({ before: resolved.cutoff.toISOString() });
      const closed = res.closed ?? 0;
      const batchId = res.batchId;
      onClose();
      if (closed === 0) {
        toast.info("Nothing to close", "No conversation here is older than that date.");
        return;
      }
      toast.undo(
        `Closed ${closed} conversation${closed === 1 ? "" : "s"}`,
        async () => {
          await close.mutateAsync({ undoBatchId: batchId });
        },
        { description: `${clientName} · they stay in Care and come back if a customer writes again.` },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't close those conversations.");
    }
  }

  const presetClass = (active: boolean) =>
    cn(
      "rounded-[6px] border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition",
      active
        ? "border-[var(--brand-600)] bg-[var(--brand-50)] text-[var(--brand-700)]"
        : "border-[var(--border-2)] text-[var(--text-3)] hover:text-[var(--text-1)]",
    );

  return (
    <Modal open onClose={onClose} title="Clear the backlog" panelClassName="app-dialog-fixed w-full max-w-lg">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
          Close everything on <span className="font-semibold text-[var(--text-1)]">{clientName}</span> that
          has been sitting since before a date. For a mailbox that was connected with years of history
          behind it, this is how the desk starts from today.
        </p>

        <div className="mt-5 space-y-1.5">
          <span className="app-field-label">Older than</span>
          <div className="flex flex-wrap items-center gap-2">
            {RESET_PRESET_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setPresetDays(d);
                  setIso("");
                }}
                className={presetClass(presetDays === d)}
              >
                {d} days
              </button>
            ))}
            <span aria-hidden className="text-[var(--text-4)]">or</span>
            <DatePicker
              value={iso}
              onChange={(v) => {
                setIso(v);
                setPresetDays(v ? null : 7);
              }}
              className="min-w-[160px]"
            />
          </div>
        </div>

        <div className="mt-5 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          {!resolved.ok ? (
            <p className="text-[13px] text-[var(--warning-500)]">{resolved.reason}</p>
          ) : counting ? (
            <p className="flex items-center gap-2 text-[13px] text-[var(--text-3)]">
              <Spinner size="xs" /> Counting…
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
              {describeResetPlan(count ?? 0, resolved.cutoff)}
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-[var(--danger-500)]">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!resolved.ok || counting || !count || close.isPending}
          loading={close.isPending && !counting}
          onClick={run}
        >
          {count ? `Close ${count}` : "Close"}
        </Button>
      </div>
    </Modal>
  );
}
