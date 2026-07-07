"use client";

import { useEffect, useState } from "react";
import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { useDeskGmail, useDeskMentions } from "@/hooks/use-desk";
import { EditorialRow, DeskEmpty, DeskSkeleton, DeskConnectGoogle } from "./desk-shared";

const STORAGE_KEY = "gitwork.desk.needsreply.v1";
// A high-level triage summary, not a feed — show only the few most-recent things.
const MAX_ITEMS = 3;

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
  const toggle = (key: Source) =>
    setSources((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { sources, toggle, ready };
}

/** "Needs you today" — a short triage list of Slack @mentions + unread Gmail that
 *  likely want a reply. Capped, newest first. Sources are toggleable (default both). */
export function DeskNeedsReply() {
  const { sources, ready } = useSources();
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
  const shown = items.slice(0, MAX_ITEMS);

  const anyOn = sources.slack || sources.gmail;
  const loading =
    (sources.slack && mentions.isPending) || (sources.gmail && gmail.isPending);
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
          <div className="space-y-2">
            {shown.map((it) => (
              <NeedRow key={it.id} item={it} />
            ))}
          </div>
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

function NeedRow({ item }: { item: NeedItem }) {
  const Icon = item.source === "slack" ? ChatBubbleLeftRightIcon : EnvelopeIcon;
  const body = (
    <div className="flex items-start gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3 transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-[var(--text-1)]">{item.title}</p>
        <p
          className="mt-0.5 truncate text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {item.sub}
        </p>
      </div>
      {item.link ? (
        <ArrowTopRightOnSquareIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
      ) : null}
    </div>
  );
  if (!item.link) return body;
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="block">
      {body}
    </a>
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
