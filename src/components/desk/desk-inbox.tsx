"use client";

import { useDeskGmail } from "@/hooks/use-desk";
import type { GmailMessage } from "@/lib/api";
import { EditorialRow, DeskEmpty, DeskSkeleton, DeskConnectGoogle, RevealList } from "./desk-shared";

/** INBOX tab — recent Gmail (reused per-user Google read) as an editorial row.
 *  Slack activity across the caller's assigned client channels lands here in Phase 2. */
export function DeskInbox() {
  const gmail = useDeskGmail();
  const messages = gmail.data?.messages ?? [];
  const unread = messages.filter((m) => m.unread).length;

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

      <EditorialRow title="Slack" caption="Chatter from the channels you're on.">
        <div className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center">
          <p
            className="text-[11px] uppercase tracking-[1.4px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Coming next
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[var(--text-4)]">
            Activity across your assigned client channels will surface right here — no
            channel-hopping to see what moved.
          </p>
        </div>
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
