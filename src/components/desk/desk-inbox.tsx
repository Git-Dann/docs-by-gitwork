"use client";

import { useDeskGmail } from "@/hooks/use-desk";
import type { GmailMessage } from "@/lib/api";
import {
  DeskSectionLabel,
  DeskEmpty,
  DeskSkeleton,
  DeskConnectGoogle,
} from "./desk-shared";

/** INBOX tab — recent Gmail (reused per-user Google read). Slack activity across
 *  the caller's assigned client channels lands here in Phase 2. */
export function DeskInbox() {
  const gmail = useDeskGmail();
  const messages = gmail.data?.messages ?? [];

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Gmail */}
      <div>
        <DeskSectionLabel count={messages.filter((m) => m.unread).length}>
          Inbox
        </DeskSectionLabel>
        {gmail.isPending ? (
          <DeskSkeleton />
        ) : gmail.data && !gmail.data.connected ? (
          <DeskConnectGoogle what="your inbox" />
        ) : messages.length === 0 ? (
          <DeskEmpty>Inbox is clear.</DeskEmpty>
        ) : (
          <div className="space-y-1.5">
            {messages.slice(0, 12).map((m) => (
              <MailRow key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>

      {/* Slack — Phase 2 */}
      <div>
        <DeskSectionLabel>Slack</DeskSectionLabel>
        <div className="rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-6 text-center">
          <p className="text-xs text-[var(--text-4)]">
            Activity across your assigned client channels is coming next.
          </p>
        </div>
      </div>
    </div>
  );
}

function MailRow({ m }: { m: GmailMessage }) {
  // "Name <email>" → just the display name where possible.
  const sender = m.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || m.from;
  return (
    <div className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2">
      <div className="flex items-center gap-2">
        {m.unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" /> : null}
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
  );
}
