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
  useEndAbsenceCover,
  useTodayAbsences,
  useSlackChannels,
  useCoverableClients,
  useAvailabilitySettings,
  useSetAvailabilityDigestChannel,
} from "@/hooks/use-backstage";
import { usePermissions } from "@/hooks/use-permissions";
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

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function readLastChannel(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_CHANNEL_KEY) ?? "";
}

// ISO day key `days` from today (UTC).
function isoFromToday(days: number): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function formatDay(iso: string): string {
  return DAY_LABEL.format(new Date(iso + "T00:00:00Z"));
}

export function AbsencesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error, info } = useToast();
  const team = useBackstageTeam();
  const today = useTodayAbsences();
  const channels = useSlackChannels(open);
  const mark = useMarkAbsence();
  const remove = useDeleteAbsence();
  const endCover = useEndAbsenceCover();
  const { isAdminOrAbove } = usePermissions();
  const digestSettings = useAvailabilitySettings(open && isAdminOrAbove);
  const setDigestChannel = useSetAvailabilityDigestChannel();

  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<AbsenceKind>("AWAY");
  const [note, setNote] = useState("");
  const [daysOut, setDaysOut] = useState(1);
  const [channelId, setChannelId] = useState<string>(readLastChannel);
  const [coverEnabled, setCoverEnabled] = useState(false);
  const [coverUserId, setCoverUserId] = useState("");
  const [coverClientId, setCoverClientId] = useState("");

  const coverable = useCoverableClients(coverEnabled && userId ? userId : null);

  // Reset the form each time the modal opens (but keep the remembered channel).
  useEffect(() => {
    if (open) {
      setUserId("");
      setKind("AWAY");
      setNote("");
      setDaysOut(1);
      setChannelId(readLastChannel());
      setCoverEnabled(false);
      setCoverUserId("");
      setCoverClientId("");
    }
  }, [open]);

  // Changing the absent person invalidates the coverable-client choice.
  useEffect(() => {
    setCoverClientId("");
  }, [userId]);

  const channelList = channels.data?.channels ?? [];
  const coverableList = coverable.data ?? [];
  const endDateIso = daysOut > 1 ? isoFromToday(daysOut - 1) : undefined;

  async function submit() {
    if (!userId) {
      info("Pick a person", "Choose who's out today.");
      return;
    }
    if (coverEnabled && (!coverUserId || !coverClientId)) {
      info("Finish the cover", "Pick a cover dev and the client they'll cover.");
      return;
    }
    const channelName = channelList.find((c) => c.id === channelId)?.name;
    try {
      const created = await mark.mutateAsync({
        userId,
        kind,
        note: note.trim() || undefined,
        endDate: endDateIso,
        channelId: channelId || undefined,
        channelName: channelName ? `#${channelName}` : undefined,
        coverUserId: coverEnabled ? coverUserId : undefined,
        coverClientId: coverEnabled ? coverClientId : undefined,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_CHANNEL_KEY, channelId);
      }
      const cover = created.coverActive && created.coverUserName ? ` · ${created.coverUserName} covering` : "";
      if (channelId && !created.slackPosted) {
        info("Marked, but Slack post failed", "Check the Slack connection & channel access.");
      } else if (channelId) {
        success("Marked & posted to Slack", `${created.userName} · ${KIND_META[kind].label}${cover}`);
      } else {
        success("Marked", `${created.userName} · ${KIND_META[kind].label}${cover}`);
      }
      setUserId("");
      setNote("");
      setDaysOut(1);
      setCoverEnabled(false);
      setCoverUserId("");
      setCoverClientId("");
    } catch (e) {
      error("Couldn't mark absence", (e as Error)?.message);
    }
  }

  const submitLabel = channelId ? "Mark & post to Slack" : "Mark as out";

  return (
    <Modal open={open} onClose={onClose} title="ABSENCES" panelClassName="w-full max-w-3xl">
      <div className="grid h-[560px] grid-cols-1 sm:grid-cols-2">
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
            <label className="widget-data-label mb-1 block">Duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={daysOut}
                onChange={(e) => setDaysOut(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 rounded-[8px] border border-[var(--border-2)] bg-white px-2 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-400)]"
              />
              <span className="text-sm text-[var(--text-3)]">
                {daysOut === 1 ? "day · today only" : `days · through ${formatDay(endDateIso!)}`}
              </span>
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

          {/* Cover */}
          <div>
            <label
              className={cn(
                "flex items-center gap-2",
                !userId && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="checkbox"
                checked={coverEnabled}
                disabled={!userId}
                onChange={(e) => setCoverEnabled(e.target.checked)}
              />
              <span className="widget-data-label">Arrange cover</span>
            </label>
            {coverEnabled ? (
              <div className="mt-2 space-y-2 rounded-[8px] border border-[var(--border-2)] p-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--text-3)]">
                    Cover dev
                  </label>
                  <select
                    className="app-select w-full"
                    value={coverUserId}
                    onChange={(e) => setCoverUserId(e.target.value)}
                  >
                    <option value="">Select a dev…</option>
                    {team.data
                      ?.filter((m) => m.id !== userId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[var(--text-3)]">
                    Picks up client
                  </label>
                  <select
                    className="app-select w-full"
                    value={coverClientId}
                    onChange={(e) => setCoverClientId(e.target.value)}
                    disabled={coverable.isLoading || coverableList.length === 0}
                  >
                    <option value="">Select client…</option>
                    {coverableList.map((c) => (
                      <option key={c.clientId} value={c.clientId}>
                        {c.clientName} ({c.taskCount})
                      </option>
                    ))}
                  </select>
                  {!coverable.isLoading && coverableList.length === 0 ? (
                    <p className="mt-1 text-[11px] text-[var(--text-4)]">
                      No active tasks assigned to this person to cover.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-[var(--text-4)]">
                      Their tasks on this client move to the cover dev for the period, then revert.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
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

        {/* Right — out now */}
        <div className="flex flex-col overflow-hidden p-4">
          <p className="widget-data-label mb-2">Out now</p>
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {today.isLoading ? (
              <p className="text-sm text-[var(--text-3)]">Loading…</p>
            ) : (today.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--text-3)]">Nobody marked out.</p>
            ) : (
              today.data?.map((a) => (
                <TodayRow
                  key={a.id}
                  absence={a}
                  onRemove={() => remove.mutate(a.id)}
                  onEndCover={() => endCover.mutate(a.id)}
                  busy={remove.isPending || endCover.isPending}
                />
              ))
            )}
          </div>

          {/* Admin: combined leave + absence morning digest channel */}
          {isAdminOrAbove ? (
            <div className="mt-3 border-t border-[var(--border-2)] pt-3">
              <label className="widget-data-label mb-1 block">Morning digest channel</label>
              <select
                className="app-select w-full"
                value={digestSettings.data?.digestChannelId ?? ""}
                disabled={channels.isLoading || setDigestChannel.isPending}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const nm = id ? channelList.find((c) => c.id === id)?.name : null;
                  setDigestChannel.mutate({ channelId: id, channelName: nm ? `#${nm}` : null });
                }}
              >
                <option value="">Off — no morning digest</option>
                {channelList.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                    {c.isPrivate ? " (private)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[var(--text-4)]">
                One combined leave + absence post each weekday morning (Mon = week roll-up).
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function TodayRow({
  absence,
  onRemove,
  onEndCover,
  busy,
}: {
  absence: AbsenceDTO;
  onRemove: () => void;
  onEndCover: () => void;
  busy: boolean;
}) {
  const meta = KIND_META[absence.kind];
  return (
    <div className="rounded-[8px] border border-[var(--border-2)] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-1)]">{absence.userName}</p>
          <p className="truncate text-[11px] text-[var(--text-3)]">
            {meta.label}
            {absence.endDate ? ` · through ${DAY_LABEL.format(new Date(absence.endDate))}` : ""}
            {absence.note ? ` · ${absence.note}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Clear ${absence.userName}'s absence`}
          className="shrink-0 rounded-[6px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-red-600 disabled:opacity-40"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      {absence.coverActive && absence.coverUserName ? (
        <div className="mt-1.5 flex items-center gap-2 border-t border-[var(--border-2)] pt-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--brand-700)]">
            ↳ {absence.coverUserName} covering {absence.coverClientName}
          </span>
          <button
            type="button"
            onClick={onEndCover}
            disabled={busy}
            className="shrink-0 rounded-[6px] border border-[var(--border-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
          >
            End cover
          </button>
        </div>
      ) : null}
    </div>
  );
}
