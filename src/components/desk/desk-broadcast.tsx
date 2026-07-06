"use client";

import { useState } from "react";
import { MegaphoneIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useActiveBroadcast, usePostBroadcast, useDismissBroadcast } from "@/hooks/use-desk";
import { BROADCAST_DURATIONS, type BroadcastDuration } from "@/types/desk";

const DURATION_LABELS: Record<BroadcastDuration, string> = {
  1: "1 day",
  3: "3 days",
  5: "5 days",
  14: "2 weeks",
  30: "30 days",
};

function expiryLabel(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** Workspace-wide announcement banner + admin composer. Renders nothing when
 *  there's no active broadcast and the viewer can't post one. */
export function DeskBroadcast() {
  const { isAdminOrAbove } = usePermissions();
  const active = useActiveBroadcast();
  const post = usePostBroadcast();
  const dismiss = useDismissBroadcast();
  const { success, error } = useToast();

  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [duration, setDuration] = useState<BroadcastDuration>(1);

  const broadcast = active.data?.broadcast ?? null;

  // Nothing to show and nothing to post → render nothing at all.
  if (!broadcast && !isAdminOrAbove) return null;

  function openComposer() {
    setMessage("");
    setDuration(1);
    setComposing(true);
  }

  function submit() {
    const text = message.trim();
    if (!text) return;
    post.mutate(
      { message: text, durationDays: duration },
      {
        onSuccess: () => {
          setComposing(false);
          success("Broadcast posted");
        },
        onError: () => error("Couldn't post broadcast", "Please try again."),
      },
    );
  }

  return (
    <div className="mb-4">
      {broadcast ? (
        <div className="flex items-start gap-3 rounded-[10px] border border-[var(--brand-200)] bg-[var(--surface-brand)] px-3.5 py-3">
          <MegaphoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-700)]" />
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-1)]">
              {broadcast.message}
            </p>
            <p
              className="mt-1 text-[10px] uppercase tracking-[0.8px] text-[var(--brand-700)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Broadcast · {expiryLabel(broadcast.expiresAt)}
            </p>
            {isAdminOrAbove ? (
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={openComposer}
                  className="text-xs font-medium text-[var(--brand-700)] hover:underline"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dismiss.mutate(undefined, { onSuccess: () => success("Broadcast taken down") })
                  }
                  className="text-xs font-medium text-[var(--text-4)] hover:text-[var(--text-2)]"
                >
                  Take down
                </button>
              </div>
            ) : null}
          </div>
          {isAdminOrAbove ? (
            <button
              type="button"
              onClick={() =>
                dismiss.mutate(undefined, { onSuccess: () => success("Broadcast taken down") })
              }
              aria-label="Take down broadcast"
              className="shrink-0 text-[var(--brand-700)] transition hover:text-[var(--text-1)]"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : isAdminOrAbove ? (
        <button
          type="button"
          onClick={openComposer}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
        >
          <MegaphoneIcon className="h-4 w-4" />
          Post a broadcast
        </button>
      ) : null}

      <Modal open={composing} onClose={() => setComposing(false)} title="Post a broadcast">
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--text-3)]">
            Shown to everyone on their Desk until it expires.
            {broadcast ? " This replaces the current broadcast — there's only ever one." : ""}
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Message</label>
            <textarea
              className="app-textarea w-full"
              rows={3}
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Something everyone needs to know today…"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Show for</label>
            <select
              className="app-select"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) as BroadcastDuration)}
            >
              {BROADCAST_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {DURATION_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="tertiary" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={submit}
              loading={post.isPending}
              disabled={!message.trim()}
            >
              {broadcast ? "Replace broadcast" : "Post broadcast"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
