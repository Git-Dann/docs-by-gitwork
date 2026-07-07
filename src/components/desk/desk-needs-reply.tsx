"use client";

import { useEffect, useState } from "react";
import {
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useDeskMentions, useDeskReminders, useUpdateDeskReminder } from "@/hooks/use-desk";
import { EditorialRow, DeskEmpty, DeskSkeleton } from "./desk-shared";

const DISMISS_KEY = "gitwork.desk.needsreply.dismissed.v1";
// A high-level triage list, not a feed — a handful of the most-critical things.
const MAX_ITEMS = 6;

type Source = "reminder" | "slack";
type NeedItem = {
  id: string;
  source: Source;
  title: string;
  sub: string;
  sortTs: number;
  link: string | null;
  /** Set on reminder items so dismiss = mark done. */
  reminderId?: string;
};

/** Locally-remembered dismissals for @mentions (device-local, capped). */
function useDismissed() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) setIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  const dismiss = (toAdd: string[]) =>
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of toAdd) next.add(id);
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify([...next].slice(-200)));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { dismissed: ids, dismiss };
}

/**
 * "Needs you today" — the single time-critical list. Two sources only:
 *  - `/desk` reminders (Slack-delegated), pinned first — your own typed to-dos
 *    live in the On Your Desk clipboard, NOT here; and
 *  - Slack @mentions still awaiting your reply from the last 24h (answered ones
 *    — replied in-thread or spoken-after in-channel — are filtered server-side).
 * Mail was deliberately dropped: it pulled in calendar-accept / auto-reply noise
 * that never actually needed you. A reminder is cleared by marking it done, a
 * mention by dismissing it.
 */
export function DeskNeedsReply() {
  const { dismissed, dismiss } = useDismissed();
  const reminders = useDeskReminders({ enabled: true });
  const updateReminder = useUpdateDeskReminder();
  const mentions = useDeskMentions({ enabled: true });

  // 1. /desk reminders (Slack-delegated), open — pinned first, newest first.
  const reminderItems: NeedItem[] = (reminders.data?.reminders ?? [])
    .filter((r) => !r.done && r.source === "SLACK")
    .map((r) => ({
      id: `reminder:${r.id}`,
      source: "reminder" as const,
      title: r.body,
      sub: `/desk · ${relTime(r.createdAt)}`,
      sortTs: new Date(r.createdAt).getTime() || 0,
      link: null,
      reminderId: r.id,
    }))
    .sort((a, b) => b.sortTs - a.sortTs);

  // 2. Slack @mentions awaiting a reply (server already applies the 24h /
  //    unanswered filter), newest first, dismissable.
  const mentionItems: NeedItem[] = (mentions.data?.items ?? [])
    .map((m) => ({
      id: `slack:${m.id}`,
      source: "slack" as const,
      title: m.text || `${m.author} mentioned you`,
      sub: `${m.clientName} · ${m.author} · ${relTime(m.ts)}`,
      sortTs: new Date(m.ts).getTime() || 0,
      link: m.link,
    }))
    .sort((a, b) => b.sortTs - a.sortTs);
  const visibleMentions = mentionItems.filter((it) => !dismissed.has(it.id));

  const shown = [...reminderItems, ...visibleMentions].slice(0, MAX_ITEMS);

  const loading = reminders.isPending || mentions.isPending;
  const slackUnmapped = mentions.data && mentions.data.configured && !mentions.data.mapped;

  function dismissItem(it: NeedItem) {
    if (it.source === "reminder" && it.reminderId) {
      updateReminder.mutate({ id: it.reminderId, input: { done: true } });
    } else {
      dismiss([it.id]);
    }
  }

  return (
    <EditorialRow
      title="Needs you today"
      caption="Slack /desk reminders and unanswered @mentions from the last 24h — nothing else."
    >
      {loading && shown.length === 0 ? (
        <DeskSkeleton />
      ) : shown.length > 0 ? (
        <>
          {visibleMentions.length > 0 ? (
            <div className="mb-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => dismiss(visibleMentions.map((it) => it.id))}
                className="text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Dismiss @mentions
              </button>
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--border-2)]">
            {shown.map((it) => (
              <NeedRow key={it.id} item={it} onDismiss={() => dismissItem(it)} />
            ))}
          </ul>
        </>
      ) : slackUnmapped ? (
        <DeskEmpty>Couldn&apos;t match your email in Slack — mentions won&apos;t show.</DeskEmpty>
      ) : (
        <DeskEmpty>You&apos;re all caught up — nothing waiting on you.</DeskEmpty>
      )}
    </EditorialRow>
  );
}

const SOURCE_ICON = {
  reminder: ClipboardDocumentListIcon,
  slack: ChatBubbleLeftRightIcon,
} as const;

function NeedRow({ item, onDismiss }: { item: NeedItem; onDismiss: () => void }) {
  const Icon = SOURCE_ICON[item.source];
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--text-1)]">{item.title}</span>
        <span
          className="block truncate text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {item.sub}
        </span>
      </span>
      {item.link ? (
        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition group-hover:text-[var(--brand-600)]" />
      ) : null}
    </>
  );

  return (
    <li className="group flex items-center gap-2.5 py-2.5">
      <Icon
        className={`h-4 w-4 shrink-0 ${item.source === "reminder" ? "text-[var(--brand-600)]" : "text-[var(--text-4)]"}`}
      />
      {item.link ? (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          {content}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{content}</div>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={item.source === "reminder" ? "Mark done" : "Dismiss"}
        className="shrink-0 rounded-[5px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/** Compact "2m / 3h / 5d" relative time. */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}
