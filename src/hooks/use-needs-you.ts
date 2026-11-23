"use client";

/**
 * Acting on items in the "Needs you" inbox (§151). Each source action calls the same route the
 * source's own page calls, so every permission rule there still applies; this only adds the
 * optimistic update, the toast and, where a real inverse exists, Undo.
 *
 * The person's own snooze and dismissal go to /api/hq/needs-you/state.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import {
  actOnForemanFindings,
  actOnMonitorIncident,
  promoteWikiIntakeItemApi,
  setNeedsYouHold,
  updateCommitment,
  updateWikiIntakeItemApi,
} from "@/lib/api";
import type { IncidentStatus } from "@/lib/monitor-incidents";
import type { NeedsYouAction, NeedsYouDTO, NeedsYouHold, NeedsYouItem } from "@/lib/needs-you";

export const NEEDS_YOU_KEY = ["hq", "needs-you"] as const;

type Patch = (item: NeedsYouItem) => NeedsYouItem | null;

export function useNeedsYouActions() {
  const qc = useQueryClient();
  const toast = useToast();

  /** Changes one item in the cache (null removes it). Returns a function that puts it back. */
  const patchItem = useCallback(
    (id: string, patch: Patch): (() => void) => {
      const before = qc.getQueryData<NeedsYouDTO>(NEEDS_YOU_KEY);
      if (!before) return () => undefined;
      void qc.cancelQueries({ queryKey: NEEDS_YOU_KEY });
      qc.setQueryData<NeedsYouDTO>(NEEDS_YOU_KEY, {
        ...before,
        items: before.items.flatMap((i) => {
          if (i.id !== id) return [i];
          const next = patch(i);
          return next ? [next] : [];
        }),
      });
      return () => qc.setQueryData(NEEDS_YOU_KEY, before);
    },
    [qc],
  );

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: NEEDS_YOU_KEY }), [qc]);

  const setHold = useCallback(
    async (item: NeedsYouItem, hold: NeedsYouHold | null) => {
      const restore = patchItem(item.id, (i) => ({ ...i, hold }));
      try {
        if (!hold) await setNeedsYouHold({ action: "clear", itemKey: item.id });
        else if (hold.state === "dismissed") await setNeedsYouHold({ action: "dismiss", itemKey: item.id, fingerprint: item.fingerprint });
        else await setNeedsYouHold({ action: "snooze", itemKey: item.id, fingerprint: item.fingerprint, until: hold.until! });
      } catch (err) {
        restore();
        throw err;
      }
    },
    [patchItem],
  );

  /** Snooze until a time. Undo brings it straight back. */
  const snooze = useCallback(
    async (item: NeedsYouItem, until: Date, label: string) => {
      try {
        await setHold(item, { state: "snoozed", until: until.toISOString() });
        toast.undo(`Snoozed: ${label.toLowerCase()}`, () => setHold(item, null), {
          description: "It comes back sooner if it gets worse.",
          variant: "info",
        });
      } catch (err) {
        toast.error("Couldn't snooze that", (err as Error).message);
      }
    },
    [setHold, toast],
  );

  /** Dismiss for yourself until it changes. Undo brings it back. */
  const dismiss = useCallback(
    async (item: NeedsYouItem) => {
      try {
        await setHold(item, { state: "dismissed", until: null });
        toast.undo("Dismissed", () => setHold(item, null), { description: "It comes back if it gets worse." });
      } catch (err) {
        toast.error("Couldn't dismiss that", (err as Error).message);
      }
    },
    [setHold, toast],
  );

  /** Brings a snoozed or dismissed item back to the open list. */
  const restore = useCallback(
    async (item: NeedsYouItem) => {
      const previous = item.hold;
      try {
        await setHold(item, null);
        toast.undo("Back in your inbox", () => setHold(item, previous));
      } catch (err) {
        toast.error("Couldn't bring that back", (err as Error).message);
      }
    },
    [setHold, toast],
  );

  /** Runs a source's own action. Resolving actions take the row off at once; Undo where safe. */
  const run = useCallback(
    async (
      item: NeedsYouItem,
      action: NeedsYouAction,
      extra?: { update?: { status: IncidentStatus; message: string; isPublic: boolean } },
    ) => {
      const removes = action.kind !== "acknowledge" && action.kind !== "post-update";
      const putBack = removes ? patchItem(item.id, () => null) : () => undefined;
      try {
        switch (action.kind) {
          case "acknowledge":
            await actOnMonitorIncident(action.clientSlug, action.incidentId, { action: "acknowledge" });
            toast.success("Acknowledged", "The incident shows someone at Gitwork is on it.");
            break;
          case "post-update": {
            if (!extra?.update) throw new Error("Write what's happening first.");
            await actOnMonitorIncident(action.clientSlug, action.incidentId, { action: "update", ...extra.update });
            toast.success("Update posted");
            break;
          }
          case "foreman-dismiss":
          case "foreman-mute": {
            const verb = action.kind === "foreman-dismiss" ? "dismiss" : "mute";
            await actOnForemanFindings({ findingKeys: [action.findingKey], action: verb });
            toast.undo(verb === "dismiss" ? "Dismissed for the workspace" : "Muted for the workspace", async () => {
              await actOnForemanFindings({ findingKeys: [action.findingKey], action: "clear" });
              await refresh();
            }, {
              description: verb === "dismiss" ? "It comes back if it gets worse." : "It stays hidden until someone un-mutes it.",
            });
            break;
          }
          case "accept-commitment":
            await updateCommitment(action.commitmentId, { state: "open" });
            toast.success("Added to your list");
            break;
          case "dismiss-commitment":
            await updateCommitment(action.commitmentId, { state: "dismissed" });
            // A suggestion can't become a suggestion again, so Undo adds it to the list, as on
            // the Commitments page.
            toast.undo("Dismissed", async () => {
              await updateCommitment(action.commitmentId, { state: "open" });
              await refresh();
            }, { description: "Undo adds it to your list instead." });
            break;
          case "create-task":
            await promoteWikiIntakeItemApi(action.clientSlug, action.requestId);
            toast.success("Task created", "It's on the client's board.");
            break;
          case "mark-dealt-with":
            await updateWikiIntakeItemApi(action.clientSlug, action.requestId, { status: "CLOSED" });
            toast.undo("Marked dealt with", async () => {
              await updateWikiIntakeItemApi(action.clientSlug, action.requestId, { status: "NEW" });
              await refresh();
            });
            break;
        }
        void qc.invalidateQueries({ queryKey: ["client-wiki"] });
        await refresh();
      } catch (err) {
        putBack();
        toast.error("That didn't work", (err as Error).message);
      }
    },
    [patchItem, qc, refresh, toast],
  );

  return { snooze, dismiss, restore, run };
}
