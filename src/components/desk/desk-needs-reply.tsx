"use client";

import { useEffect, useState } from "react";
import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useDeskGmail, useDeskMentions } from "@/hooks/use-desk";
import { EditorialRow, DeskEmpty, DeskSkeleton, DeskConnectGoogle } from "./desk-shared";

const STORAGE_KEY = "gitwork.desk.needsreply.v1";
const DISMISS_KEY = "gitwork.desk.needsreply.dismissed.v1";
// A high-level triage list, not a feed — a handful of the most-recent things.
const MAX_ITEMS = 5;

type Source = "slack" | "gmail";
type NeedItem = {
  id: string;
  source: Source;
  title: string;
  sub: string;
  sortTs: number;
  link: string | null;
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

/** Locally-remembered dismissals (device-local, capped). Dismissing hides an item;
 *  genuinely new mentions/mail still surface later. */
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
        // Keep the set bounded — old ids age out of the source anyway.
        localStorage.setItem(DISMISS_KEY, JSON.stringify([...next].slice(-200)));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { dismissed: ids, dismiss };
}

/** "Needs you today" — a light triage list of Slack @mentions + unread Gmail that
 *  likely want a reply. Newest first, dismissable (one or all). */
export function DeskNeedsReply() {
  const { sources, ready } = useSources();
  const { dismissed, dismiss } = useDismissed();
  const mentions = useDeskMentions({ enabled: ready && sources.slack });
  const gmail = useDeskGmail({ enabled: ready && sources.gmail });

  const items: NeedItem[] = [];
  if (sources.slack) {
    for (const m of mentions.data?.items ?? []) {
      items.push({
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
      items.push({
        id: `gmail:${g.id}`,
        source: "gmail",
        title: g.subject,
        sub: `${sender} · ${relTime(new Date(g.date).toISOString())}`,
        sortTs: new Date(g.date).getTime() || 0,
        link: g.threadId ? `https://mail.google.com/mail/u/0/#all/${g.threadId}` : null,
      });
    }
  }
  items.sort((a, b) => b.sortTs - a.sortTs);
  const visible = items.filter((it) => !dismissed.has(it.id));
  const shown = visible.slice(0, MAX_ITEMS);

  const anyOn = sources.slack || sources.gmail;
  const loading = (sources.slack && mentions.isPending) || (sources.gmail && gmail.isPending);
  const gmailDisconnected = sources.gmail && gmail.data && !gmail.data.connected;
  const slackUnmapped =
    sources.slack && mentions.data && mentions.data.configured && !mentions.data.mapped;

  return (
    <EditorialRow
      title="Needs you today"
      caption="The top few things you've been tagged in or that are waiting on a reply."
    >
      {!anyOn ? (
        <DeskEmpty>You&apos;re all caught up.</DeskEmpty>
      ) : loading && shown.length === 0 ? (
        <DeskSkeleton />
      ) : shown.length > 0 ? (
        <>
          <div className="mb-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => dismiss(visible.map((it) => it.id))}
              className="text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)] transition hover:text-[var(--text-2)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Dismiss all
            </button>
          </div>
          <ul className="divide-y divide-[var(--border-2)]">
            {shown.map((it) => (
              <NeedRow key={it.id} item={it} onDismiss={() => dismiss([it.id])} />
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
      ) : slackUnmapped && !sources.gmail ? (
        <DeskEmpty>Couldn&apos;t match your email in Slack — mentions won&apos;t show.</DeskEmpty>
      ) : (
        <DeskEmpty>You&apos;re all caught up — nothing waiting on you.</DeskEmpty>
      )}
    </EditorialRow>
  );
}

function NeedRow({ item, onDismiss }: { item: NeedItem; onDismiss: () => void }) {
  const Icon = item.source === "slack" ? ChatBubbleLeftRightIcon : EnvelopeIcon;
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
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
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
        aria-label="Dismiss"
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
