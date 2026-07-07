"use client";

import { useEffect, useState } from "react";
import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentListIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  useDeskGmail,
  useDeskMentions,
  useDeskReminders,
  useUpdateDeskReminder,
} from "@/hooks/use-desk";
import { EditorialRow, DeskEmpty, DeskSkeleton, DeskConnectGoogle } from "./desk-shared";

const STORAGE_KEY = "gitwork.desk.needsreply.v1";
const DISMISS_KEY = "gitwork.desk.needsreply.dismissed.v1";
// A high-level triage list, not a feed — a handful of the most-critical things.
const MAX_ITEMS = 6;
// Only high-signal person-to-person mail — Gmail's Primary category excludes the
// Featurebase / Gemini-notes / promotions / updates noise that isn't "needs you".
const GMAIL_QUERY = "is:unread category:primary";

type Source = "reminder" | "slack" | "gmail";
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

/** Persisted per-user source toggles (device-local). Default: both on. */
function useSources() {
  const [sources, setSources] = useState<{ slack: boolean; gmail: boolean }>({
    slack: true,
    gmail: true,
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { slack?: boolean; gmail?: boolean };
        setSources({ slack: p.slack !== false, gmail: p.gmail !== false });
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
  return { sources, ready };
}

/** Locally-remembered dismissals for mail/mentions (device-local, capped). */
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
 * "Needs you today" — the single time-critical list: your reminders (incl. Slack
 * `/desk`), Slack @mentions, and high-signal Primary mail. Reminders are pinned
 * first (explicitly flagged = definitionally "needs you"); a reminder is cleared
 * by marking it done, mail/mentions by dismissing.
 */
export function DeskNeedsReply() {
  const { sources, ready } = useSources();
  const { dismissed, dismiss } = useDismissed();
  const reminders = useDeskReminders({ enabled: true });
  const updateReminder = useUpdateDeskReminder();
  const mentions = useDeskMentions({ enabled: ready && sources.slack });
  const gmail = useDeskGmail({ enabled: ready && sources.gmail, query: GMAIL_QUERY });

  // 1. Reminders (open, incl. /desk) — pinned first, newest first.
  const reminderItems: NeedItem[] = (reminders.data?.reminders ?? [])
    .filter((r) => !r.done)
    .map((r) => ({
      id: `reminder:${r.id}`,
      source: "reminder" as const,
      title: r.body,
      sub: `Reminder · ${relTime(r.createdAt)}`,
      sortTs: new Date(r.createdAt).getTime() || 0,
      link: null,
      reminderId: r.id,
    }))
    .sort((a, b) => b.sortTs - a.sortTs);

  // 2. Feed — @mentions + Primary unread mail, newest first, dismissable.
  const feed: NeedItem[] = [];
  if (sources.slack) {
    for (const m of mentions.data?.items ?? []) {
      feed.push({
        id: `slack:${m.id}`,
        source: "slack",
        title: m.text || `${m.author} mentioned you`,
        sub: `${m.clientName} · ${m.author} · ${relTime(m.ts)}`,
        sortTs: new Date(m.ts).getTime() || 0,
        link: m.link,
      });
    }
  }
  if (sources.gmail) {
    for (const g of (gmail.data?.messages ?? []).filter((m) => m.unread)) {
      const sender = g.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || g.from;
      feed.push({
        id: `gmail:${g.id}`,
        source: "gmail",
        title: g.subject,
        sub: `${sender} · ${relTime(new Date(g.date).toISOString())}`,
        sortTs: new Date(g.date).getTime() || 0,
        link: g.threadId ? `https://mail.google.com/mail/u/0/#all/${g.threadId}` : null,
      });
    }
  }
  feed.sort((a, b) => b.sortTs - a.sortTs);
  const visibleFeed = feed.filter((it) => !dismissed.has(it.id));

  const shown = [...reminderItems, ...visibleFeed].slice(0, MAX_ITEMS);

  const loading =
    reminders.isPending ||
    (sources.slack && mentions.isPending) ||
    (sources.gmail && gmail.isPending);
  const gmailDisconnected = sources.gmail && gmail.data && !gmail.data.connected;
  const slackUnmapped =
    sources.slack && mentions.data && mentions.data.configured && !mentions.data.mapped;

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
      caption="Reminders, @mentions and key mail that actually need you — nothing else."
    >
      {loading && shown.length === 0 ? (
        <DeskSkeleton />
      ) : shown.length > 0 ? (
        <>
          {visibleFeed.length > 0 ? (
            <div className="mb-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => dismiss(visibleFeed.map((it) => it.id))}
                className="text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Dismiss mail
              </button>
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--border-2)]">
            {shown.map((it) => (
              <NeedRow key={it.id} item={it} onDismiss={() => dismissItem(it)} />
            ))}
          </ul>
          {gmailDisconnected ? (
            <div className="mt-2">
              <DeskConnectGoogle what="your inbox" />
            </div>
          ) : null}
        </>
      ) : gmailDisconnected ? (
        <DeskConnectGoogle what="your inbox" />
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
  gmail: EnvelopeIcon,
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
