"use client";

import Link from "next/link";
import { useDeskGmail, useDeskSlack } from "@/hooks/use-desk";
import type { GmailMessage } from "@/lib/api";
import type { DeskSlackMessage } from "@/types/desk";
import { EditorialRow, DeskEmpty, DeskSkeleton, DeskConnectGoogle, RevealList } from "./desk-shared";

/** INBOX tab — recent Gmail (per-user Google read) + recent Slack activity across
 *  the caller's client channels, as editorial rows. Both are pure aggregations. */
export function DeskInbox() {
  const gmail = useDeskGmail();
  const slack = useDeskSlack();
  const messages = gmail.data?.messages ?? [];
  const unread = messages.filter((m) => m.unread).length;
  const slackMessages = slack.data?.messages ?? [];

  return (
    <div>
      <EditorialRow
        title="Your inbox"
        count={gmail.data?.connected ? unread : undefined}
        caption="Most recent mail, unread first."
        first
      >
        {gmail.isPending ? (
          <DeskSkeleton />
        ) : gmail.data && !gmail.data.connected ? (
          <DeskConnectGoogle what="your inbox" />
        ) : messages.length === 0 ? (
          <DeskEmpty>Inbox is clear.</DeskEmpty>
        ) : (
          <RevealList
            items={[...messages].sort((a, b) => Number(b.unread) - Number(a.unread))}
            initial={6}
            renderItem={(m, i) => <MailRow key={m.id} m={m} index={i + 1} />}
          />
        )}
      </EditorialRow>

      <EditorialRow
        title="Slack"
        count={slack.data?.reason === "ok" ? slackMessages.length : undefined}
        caption="What moved across your client channels."
      >
        {slack.isPending ? (
          <DeskSkeleton />
        ) : !slack.data?.configured ? (
          <DeskEmpty>Slack isn&apos;t connected for this workspace yet.</DeskEmpty>
        ) : slack.data.reason === "no_channels" ? (
          <DeskEmpty>None of your clients have a linked Slack channel.</DeskEmpty>
        ) : slackMessages.length === 0 ? (
          <DeskEmpty>No recent messages in your channels.</DeskEmpty>
        ) : (
          <RevealList
            items={slackMessages}
            initial={6}
            renderItem={(m) => <SlackRow key={m.id} m={m} />}
          />
        )}
      </EditorialRow>
    </div>
  );
}

function MailRow({ m, index }: { m: GmailMessage; index: number }) {
  const sender = m.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || m.from;
  return (
    <div className="flex items-start gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3">
      <span
        className="shrink-0 pt-0.5 text-[11px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {m.unread ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" />
          ) : null}
          <p
            className={`min-w-0 flex-1 truncate text-sm ${
              m.unread ? "font-semibold text-[var(--text-1)]" : "font-medium text-[var(--text-2)]"
            }`}
          >
            {m.subject}
          </p>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">{sender}</p>
      </div>
    </div>
  );
}

function SlackRow({ m }: { m: DeskSlackMessage }) {
  return (
    <Link
      href={`/app/portal/${m.clientSlug}`}
      className="block rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3 transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate text-[11px] uppercase tracking-[0.8px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {m.clientName} · {m.author}
        </span>
        <span
          className="shrink-0 text-[11px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {relTime(m.ts)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-[var(--text-2)]">{m.text}</p>
    </Link>
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
