"use client";

import { useEffect, useState } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  useBackstageTeam,
  useMarkAbsence,
  useDeleteAbsence,
  useTodayAbsences,
  useSlackChannels,
} from "@/hooks/use-backstage";
import { cn } from "@/lib/format";
import type { AbsenceDTO, AbsenceKind } from "@/types/backstage";

const LAST_CHANNEL_KEY = "backstage:absences:lastChannel";

const KINDS: { key: AbsenceKind; label: string; emoji: string }[] = [
  { key: "AWAY", label: "Away", emoji: "🌴" },
  { key: "ILL", label: "Ill", emoji: "🤒" },
  { key: "WFH", label: "WFH", emoji: "🏠" },
  { key: "APPOINTMENT", label: "Appt", emoji: "📅" },
];

const KIND_META: Record<AbsenceKind, { label: string; emoji: string }> = {
  AWAY: { label: "Away", emoji: "🌴" },
  ILL: { label: "Ill", emoji: "🤒" },
  WFH: { label: "WFH", emoji: "🏠" },
  APPOINTMENT: { label: "Appointment", emoji: "📅" },
};

function readLastChannel(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_CHANNEL_KEY) ?? "";
}

export function AbsencesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error, info } = useToast();
  const team = useBackstageTeam();
  const today = useTodayAbsences();
  const channels = useSlackChannels(open);
  const mark = useMarkAbsence();
  const remove = useDeleteAbsence();

  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("AWAY");
  const [note, setNote] = useState("");
  const [channelId, setChannelId] = useState<string>(readLastChannel);

  // Reset the form each time the modal opens (but keep the remembered channel).
  useEffect(() => {
    if (open) {
      setUserId("");
      setKind("AWAY");
      setNote("");
      setChannelId(readLastChannel());
    }
  }, [open]);

  const channelList = channels.data?.channels ?? [];

  async function submit() {
    if (!userId) {
      info("Pick a person", "Choose who's out today.");
      return;
    }
    const channelName = channelList.find((c) => c.id === channelId)?.name;
    try {
      const created = await mark.mutateAsync({
        userId,
        kind,
        note: note.trim() || undefined,
        channelId: channelId || undefined,
        channelName: channelName ? `#${channelName}` : undefined,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_CHANNEL_KEY, channelId);
      }
      if (channelId && !created.slackPosted) {
        info("Marked, but Slack post failed", "Check the Slack connection & channel access.");
      } else if (channelId) {
        success("Marked & posted to Slack", `${created.userName} · ${KIND_META[kind].label}`);
      } else {
        success("Marked", `${created.userName} · ${KIND_META[kind].label}`);
      }
      setUserId("");
      setNote("");
    } catch (e) {
      error("Couldn't mark absence", (e as Error)?.message);
    }
  }

  const submitLabel = channelId ? "Mark & post to Slack" : "Mark as out";

  return (
    <Modal open={open} onClose={onClose} title="ABSENCES" panelClassName="w-full max-w-3xl">
      <div className="grid h-[520px] grid-cols-1 sm:grid-cols-2">
        {/* Left — mark someone out */}
        <div className="flex flex-col gap-4 overflow-y-auto border-b border-[var(--border-2)] p-4 sm:border-b-0 sm:border-r">
          <div>
            <label className="widget-data-label mb-1 block">Who&apos;s out</label>
            <select
              className="app-select w-full"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Select a person…</option>
              {team.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="widget-data-label mb-1 block">Status</label>
            <div className="grid grid-cols-4 gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[8px] border px-2 py-2 text-xs font-medium transition",
                    kind === k.key
                      ? "border-[var(--brand-400)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  <span className="text-base leading-none">{k.emoji}</span>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="widget-data-label mb-1 block">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Back tomorrow / half day / etc."
              maxLength={500}
              className="w-full rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-400)]"
            />
          </div>

          <div>
            <label className="widget-data-label mb-1 block">Announce in Slack</label>
            <select
              className="app-select w-full"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              disabled={channels.isLoading}
            >
              <option value="">Don&apos;t post to Slack</option>
              {channelList.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                  {c.isPrivate ? " (private)" : ""}
                </option>
              ))}
            </select>
            {channels.isError ? (
              <p className="mt-1 text-xs text-amber-600">
                Slack isn&apos;t connected — you can still record the absence.
              </p>
            ) : null}
          </div>

          <div className="mt-auto">
            <Button
              type="button"
              variant="primary"
              onClick={submit}
              disabled={mark.isPending || !userId}
              className="w-full"
            >
              {mark.isPending ? "Marking…" : submitLabel}
            </Button>
          </div>
        </div>

        {/* Right — out today */}
        <div className="flex flex-col overflow-hidden p-4">
          <p className="widget-data-label mb-2">Out today</p>
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {today.isLoading ? (
              <p className="text-sm text-[var(--text-3)]">Loading…</p>
            ) : (today.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--text-3)]">Nobody marked out today.</p>
            ) : (
              today.data?.map((a) => (
                <TodayRow
                  key={a.id}
                  absence={a}
                  onRemove={() => remove.mutate(a.id)}
                  removing={remove.isPending}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TodayRow({
  absence,
  onRemove,
  removing,
}: {
  absence: AbsenceDTO;
  onRemove: () => void;
  removing: boolean;
}) {
  const meta = KIND_META[absence.kind];
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] px-2.5 py-2">
      <span className="text-base leading-none">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{absence.userName}</p>
        <p className="truncate text-[11px] text-[var(--text-3)]">
          {meta.label}
          {absence.note ? ` · ${absence.note}` : ""}
          {absence.slackPosted && absence.slackChannelName ? ` · ${absence.slackChannelName}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Clear ${absence.userName}'s absence`}
        className="shrink-0 rounded-[6px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-red-600 disabled:opacity-40"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
