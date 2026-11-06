"use client";

/**
 * Backstage → Commitments. One person's promises: typed in, or suggested from their sent email,
 * their Slack messages, their meeting notes and their calendar. Suggestions wait in their own
 * card until accepted; nothing is ever sent on the person's behalf.
 *
 * Rules live in src/lib/commitments.ts; the server in src/server/commitments.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/ui/motion/loading-state";
import { SkeletonRows } from "@/components/ui/motion/skeleton";
import { useToast } from "@/components/ui/toast";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import {
  countSnoozed,
  groupOpenCommitments,
  snoozeUntil,
  SOURCE_LABEL,
  type CommitmentSource,
} from "@/lib/commitments";
import {
  useCommitments,
  useCreateCommitment,
  useDeleteCommitment,
  useSyncCommitments,
  useUpdateCommitment,
  useUpdateCommitmentSettings,
} from "@/hooks/use-commitments";
import type { CommitmentDTO, CommitmentSettingsDTO } from "@/types/commitments";

/** The page reads its sources itself when opened and the last read is older than this. */
const STALE_MS = 30 * 60_000;

const SOURCE_ICON: Record<CommitmentSource, typeof EnvelopeIcon> = {
  manual: PencilSquareIcon,
  gmail: EnvelopeIcon,
  slack: ChatBubbleLeftRightIcon,
  meeting: DocumentTextIcon,
  calendar: CalendarDaysIcon,
};

function dueLabel(dueAt: string | null, now: Date): { text: string; tone: "danger" | "warning" | "muted" } | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((day(due) - day(now)) / 86_400_000);
  if (diff < 0) return { text: diff === -1 ? "Due yesterday" : `${-diff} days overdue`, tone: "danger" };
  if (diff === 0) return { text: "Due today", tone: "warning" };
  if (diff === 1) return { text: "Due tomorrow", tone: "muted" };
  return {
    text: `Due ${due.toLocaleDateString("en-GB", { weekday: diff < 7 ? "short" : undefined, day: "numeric", month: "short" })}`,
    tone: "muted",
  };
}

/** The house widget-header label: mono number + name. */
function HeaderLabel({ n, title }: { n?: string; title: string }) {
  return (
    <span className="widget-header__label">
      {n ? <span className="widget-header__label--number">{n}</span> : null}
      {`${n ? " // " : ""}${title}`}
    </span>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const TONE_TEXT = {
  danger: "text-[var(--danger-500)] font-semibold",
  warning: "text-amber-700 font-semibold",
  muted: "text-[var(--text-3)]",
} as const;

export function CommitmentsWorkspace() {
  const { data, isLoading, error } = useCommitments();
  const sync = useSyncCommitments();
  const toast = useToast();
  const autoSynced = useRef(false);
  const now = new Date();

  // Read the sources once when the page opens, if the last read is stale.
  useEffect(() => {
    if (!data || autoSynced.current) return;
    autoSynced.current = true;
    const last = data.settings.lastSyncedAt ? new Date(data.settings.lastSyncedAt).getTime() : 0;
    if (!data.settings.syncing && Date.now() - last > STALE_MS) sync.mutate();
  }, [data, sync]);

  const commitments = useMemo(() => data?.commitments ?? [], [data]);
  const groups = useMemo(() => groupOpenCommitments(commitments, new Date()), [commitments]);
  const suggestions = commitments.filter((c) => c.state === "suggested");
  const finished = commitments
    .filter((c) => c.state === "done")
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const openCount = commitments.filter((c) => c.state === "open").length;
  const overdue = groups.find((g) => g.id === "overdue")?.items.length ?? 0;
  const snoozed = countSnoozed(commitments, now);

  const runSync = () =>
    sync.mutate(undefined, {
      onSuccess: ({ result }) => {
        if (result.status === "busy") toast.success("Already reading your sources", "New suggestions will appear shortly.");
        else if (result.added) toast.success(`${result.added} new suggestion${result.added === 1 ? "" : "s"}`);
        else if (result.status === "partial") toast.error("Some sources couldn't be read", "See Sources for why.");
        else toast.success("Nothing new to suggest");
      },
      onError: (err) => toast.error("Couldn't read your sources", (err as Error).message),
    });

  if (error) {
    return (
      <div className="widget-card">
        <div className="widget-header">
          <HeaderLabel n="01" title="COMMITMENTS" />
        </div>
        <p className="p-4 text-[14px] text-[var(--text-2)]">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="widget-card">
          <div className="widget-header">
            <HeaderLabel n="01" title="COMMITMENTS" />
            <span className="text-[10px] tracking-[1.2px] text-[var(--text-3)]">
              {openCount} OPEN{overdue ? ` · ${overdue} OVERDUE` : ""}
            </span>
          </div>
          <QuickAdd />
          {isLoading ? (
            <SkeletonRows count={4} className="p-4" />
          ) : groups.length === 0 ? (
            <EmptyList hasSuggestions={suggestions.length > 0} />
          ) : (
            <div className="divide-y divide-[var(--border-1)]">
              {groups.map((g) => (
                <div key={g.id}>
                  <p
                    className={cn(
                      "px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-[1.2px]",
                      g.id === "overdue" ? "text-[var(--danger-500)]" : "text-[var(--text-3)]",
                    )}
                  >
                    {g.label} · {g.items.length}
                  </p>
                  <ul>
                    {g.items.map((c) => (
                      <CommitmentRow key={c.id} item={c} now={now} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {snoozed > 0 && (
            <p className="border-t border-[var(--border-1)] px-4 py-2 text-[12px] text-[var(--text-3)]">
              {snoozed} snoozed, back when their snooze ends.
            </p>
          )}
        </section>

        {finished.length > 0 && <DoneList items={finished} />}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="widget-card">
          <div className="widget-header">
            <HeaderLabel n="02" title="SUGGESTED" />
            <button
              type="button"
              onClick={runSync}
              disabled={sync.isPending || data?.settings.syncing}
              className="app-button app-button-tertiary app-button-xs"
            >
              <ArrowPathIcon
                className={cn("h-3.5 w-3.5", (sync.isPending || data?.settings.syncing) && "animate-spin")}
                aria-hidden
              />
              {sync.isPending || data?.settings.syncing ? "Reading…" : "Check now"}
            </button>
          </div>
          {isLoading ? (
            <LoadingState variant="block" />
          ) : suggestions.length === 0 ? (
            <p className="px-4 py-6 text-[13px] leading-5 text-[var(--text-3)]">
              Nothing waiting. Promises you make in email, Slack and meetings appear here for you to accept.
              Last checked {relativeTime(data?.settings.lastSyncedAt ?? null)}.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-1)]">
              {suggestions.map((s) => (
                <SuggestionRow key={s.id} item={s} />
              ))}
            </ul>
          )}
        </section>

        {data && <SourcesCard settings={data.settings} />}
      </div>
    </div>
  );
}

function QuickAdd() {
  const create = useCreateCommitment();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create.mutate(
      { title: t, dueAt: due ? `${due}T17:00:00.000Z` : null },
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
        },
        onError: (err) => toast.error("Couldn't add that", (err as Error).message),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border-b border-[var(--border-1)] p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="I'll…  (press Enter to add)"
        aria-label="New commitment"
        maxLength={200}
        className="app-input min-w-[200px] flex-1 text-[16px] sm:text-[14px]"
      />
      <div className="w-[150px]">
        <DatePicker value={due} onChange={setDue} aria-label="Due date" placeholder="No date" />
      </div>
      <button type="submit" disabled={!title.trim() || create.isPending} className="app-button app-button-primary app-button-sm">
        Add
      </button>
    </form>
  );
}

function EmptyList({ hasSuggestions }: { hasSuggestions: boolean }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-serif text-[22px] text-[var(--text-1)]">Nothing on your plate</p>
      <p className="mt-1 text-[13px] text-[var(--text-3)]">
        {hasSuggestions
          ? "Accept a suggestion to add it here, or type one above."
          : "Type a promise above, or switch on a source and let Foundry find them."}
      </p>
    </div>
  );
}

function SourceTag({ item }: { item: CommitmentDTO }) {
  const Icon = SOURCE_ICON[item.source];
  const label = item.evidenceLabel ?? SOURCE_LABEL[item.source];
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </>
  );
  const cls = "inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] text-[var(--text-3)]";
  if (item.evidenceUrl) {
    const external = item.evidenceUrl.startsWith("http");
    return (
      <a
        href={item.evidenceUrl}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        title={`${SOURCE_LABEL[item.source]}: ${label}`}
        className={cn(cls, "hover:text-[var(--brand-700)] hover:underline")}
      >
        {content}
        {external && <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" aria-hidden />}
      </a>
    );
  }
  return (
    <span className={cls} title={`${SOURCE_LABEL[item.source]}: ${label}`}>
      {content}
    </span>
  );
}

function CommitmentRow({ item, now }: { item: CommitmentDTO; now: Date }) {
  const update = useUpdateCommitment();
  const remove = useDeleteCommitment();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [due, setDue] = useState(item.dueAt?.slice(0, 10) ?? "");
  const label = dueLabel(item.dueAt, now);

  const complete = () =>
    update.mutate(
      { id: item.id, input: { state: "done" } },
      {
        onSuccess: () =>
          toast.undo("Marked done", async () => {
            await update.mutateAsync({ id: item.id, input: { state: "open" } });
          }),
        onError: (err) => toast.error("Couldn't update", (err as Error).message),
      },
    );

  const snooze = (preset: "later" | "tomorrow" | "next-week") =>
    update.mutate(
      { id: item.id, input: { snoozedUntil: snoozeUntil(preset, new Date()).toISOString() } },
      {
        onSuccess: () =>
          toast.undo("Snoozed", async () => {
            await update.mutateAsync({ id: item.id, input: { snoozedUntil: null } });
          }),
      },
    );

  const save = () => {
    const t = title.trim();
    if (!t) return;
    update.mutate(
      { id: item.id, input: { title: t, dueAt: due ? `${due}T17:00:00.000Z` : null } },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast.error("Couldn't save", (err as Error).message),
      },
    );
  };

  const discard = () => {
    if (item.source === "manual") {
      remove.mutate(item.id, { onError: (err) => toast.error("Couldn't delete", (err as Error).message) });
    } else {
      update.mutate(
        { id: item.id, input: { state: "dismissed" } },
        {
          onSuccess: () =>
            toast.undo("Removed", async () => {
              await update.mutateAsync({ id: item.id, input: { state: "open" } });
            }),
        },
      );
    }
  };

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Commitment"
          autoFocus
          className="app-input min-w-[200px] flex-1 text-[16px] sm:text-[14px]"
        />
        <div className="w-[150px]">
          <DatePicker value={due} onChange={setDue} aria-label="Due date" placeholder="No date" />
        </div>
        <button type="button" onClick={save} className="app-button app-button-primary app-button-sm">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="app-button app-button-tertiary app-button-sm">
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--surface-1)]">
      <input
        type="checkbox"
        checked={false}
        onChange={complete}
        aria-label={`Mark “${item.title}” done`}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-700)]"
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left text-[14px] leading-5 text-[var(--text-1)]"
        >
          {item.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {label && <span className={cn("text-[12px]", TONE_TEXT[label.tone])}>{label.text}</span>}
          {item.counterpart && <span className="text-[12px] text-[var(--text-3)]">To {item.counterpart}</span>}
          {item.source !== "manual" && <SourceTag item={item} />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Menu>
          <MenuButton className="app-button app-button-tertiary app-button-icon-sm" aria-label="Snooze">
            <ClockIcon className="h-4 w-4" aria-hidden />
          </MenuButton>
          <MenuItems anchor="bottom end" className={cn(menuPanel, "w-44")}>
            <MenuItem>
              <button type="button" className={menuItem} onClick={() => snooze("later")}>
                Later today
              </button>
            </MenuItem>
            <MenuItem>
              <button type="button" className={menuItem} onClick={() => snooze("tomorrow")}>
                Tomorrow morning
              </button>
            </MenuItem>
            <MenuItem>
              <button type="button" className={menuItem} onClick={() => snooze("next-week")}>
                Next Monday
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
        <button
          type="button"
          onClick={discard}
          className="app-button app-button-tertiary app-button-icon-sm"
          aria-label={item.source === "manual" ? "Delete" : "Remove"}
        >
          <TrashIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function SuggestionRow({ item }: { item: CommitmentDTO }) {
  const update = useUpdateCommitment();
  const toast = useToast();
  const now = new Date();
  const label = dueLabel(item.dueAt, now);

  const act = (state: "open" | "dismissed") =>
    update.mutate(
      { id: item.id, input: { state } },
      {
        onSuccess: () =>
          state === "dismissed"
            ? toast.undo("Dismissed", async () => {
                await update.mutateAsync({ id: item.id, input: { state: "open" } });
              })
            : undefined,
        onError: (err) => toast.error("Couldn't update", (err as Error).message),
      },
    );

  return (
    <li className="px-4 py-3">
      <p className="text-[14px] font-medium leading-5 text-[var(--text-1)]">{item.title}</p>
      {item.quote && (
        <blockquote className="mt-1.5 border-l-2 border-[var(--border-2)] pl-2.5 text-[13px] italic leading-5 text-[var(--text-2)]">
          “{item.quote}”
        </blockquote>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <SourceTag item={item} />
        {label && <span className={cn("text-[12px]", TONE_TEXT[label.tone])}>{label.text}</span>}
        {item.counterpart && <span className="text-[12px] text-[var(--text-3)]">To {item.counterpart}</span>}
      </div>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={() => act("open")} className="app-button app-button-primary app-button-xs">
          Add to my list
        </button>
        <button type="button" onClick={() => act("dismissed")} className="app-button app-button-secondary app-button-xs">
          <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
          Not mine
        </button>
      </div>
    </li>
  );
}

function DoneList({ items }: { items: CommitmentDTO[] }) {
  const update = useUpdateCommitment();
  return (
    <details className="widget-card">
      <summary className="widget-header cursor-pointer list-none">
        <HeaderLabel n="04" title="DONE · LAST 14 DAYS" />
        <span className="text-[10px] text-[var(--text-3)]">{items.length}</span>
      </summary>
      <ul className="divide-y divide-[var(--border-1)]">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2">
            <input
              type="checkbox"
              checked
              onChange={() => update.mutate({ id: c.id, input: { state: "open" } })}
              aria-label={`Reopen “${c.title}”`}
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-700)]"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-3)] line-through" title={c.title}>
              {c.title}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const SOURCES: Array<{
  key: "gmailEnabled" | "slackEnabled" | "meetingsEnabled" | "calendarEnabled";
  status: string;
  name: string;
  what: string;
}> = [
  {
    key: "gmailEnabled",
    status: "gmail",
    name: "Sent Gmail",
    what: "Reads only email you sent, only the part you wrote. Keeps the promise and a short quote, never the email.",
  },
  {
    key: "slackEnabled",
    status: "slack",
    name: "Slack",
    what: "Reads only your own messages, in client channels you can see.",
  },
  { key: "meetingsEnabled", status: "meeting", name: "Meeting notes", what: "Action items from Scribe notes of meetings you were in." },
  {
    key: "calendarEnabled",
    status: "calendar",
    name: "Calendar",
    what: "A follow-up after a meeting with someone outside Gitwork.",
  },
];

function SourcesCard({ settings }: { settings: CommitmentSettingsDTO }) {
  const save = useUpdateCommitmentSettings();
  const toast = useToast();
  return (
    <section className="widget-card">
      <div className="widget-header">
        <HeaderLabel n="03" title="SOURCES" />
        <span className="text-[10px] text-[var(--text-3)]">CHECKED {relativeTime(settings.lastSyncedAt).toUpperCase()}</span>
      </div>
      <ul className="divide-y divide-[var(--border-1)]">
        {SOURCES.map((s) => {
          const on = settings[s.key];
          const status = settings.sourceStatus[s.status];
          const blocked = s.key === "slackEnabled" && !settings.slackConnected;
          return (
            <li key={s.key} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[var(--text-1)]">{s.name}</p>
                <p className="mt-0.5 text-[12px] leading-4 text-[var(--text-3)]">
                  {blocked ? "Slack isn't connected to Foundry yet." : s.what}
                </p>
                {on && status && (
                  <p
                    className={cn(
                      "mt-1 text-[12px] leading-4",
                      status.ok ? "text-[var(--text-3)]" : "text-[var(--danger-500)]",
                    )}
                  >
                    {status.message}
                  </p>
                )}
              </div>
              <Switch
                checked={on}
                disabled={blocked || save.isPending}
                label={`Read ${s.name}`}
                onChange={(next) =>
                  save.mutate(
                    { [s.key]: next },
                    { onError: (err) => toast.error("Couldn't save", (err as Error).message) },
                  )
                }
              />
            </li>
          );
        })}
      </ul>
      <p className="border-t border-[var(--border-1)] px-4 py-2.5 text-[12px] leading-4 text-[var(--text-3)]">
        Private to you. Foundry never replies, sends or books anything for you.
      </p>
    </section>
  );
}
