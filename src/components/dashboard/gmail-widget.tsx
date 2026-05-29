"use client";

import Link from "next/link";
import { EnvelopeIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import { getGmailMessages } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function parseFrom(from: string): string {
  const match = from.match(/^(.+?)\s*<.+>$/);
  return match ? match[1].replace(/"/g, "") : from.split("@")[0];
}

export default function GmailWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useQuery({
    queryKey: ["integrations", "gmail"],
    queryFn: getGmailMessages,
    staleTime: 1000 * 60 * 2,
    retry: false,
  });

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50">
          <EnvelopeIcon className="h-5 w-5 text-sky-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-1)]">Gmail not connected</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            Sign out and back in to grant Gmail access
          </p>
        </div>
        <Link
          href="/api/auth/signout"
          className="rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Re-connect via Google
        </Link>
      </div>
    );
  }

  const messages = data.messages ?? [];
  const unread = messages.filter((m) => m.unread).length;
  const displayCount = size === "lg" ? 10 : size === "md" ? 7 : 3;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
            <EnvelopeIcon className="h-2.5 w-2.5" />
            Mail
          </span>
          {unread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-xs font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--text-3)]">{messages.length} messages</span>
      </div>

      {/* Message list */}
      <div className="mt-1.5 flex-1 divide-y divide-[var(--border-1)] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-3)]">
            Inbox empty
          </div>
        ) : (
          messages.slice(0, displayCount).map((msg) => (
            <div
              key={msg.id}
              className={`py-1.5 transition-colors ${msg.unread ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`truncate text-sm ${msg.unread ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}`}
                >
                  {parseFrom(msg.from)}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-3)]">{formatDate(msg.date)}</span>
              </div>
              <p className="truncate text-sm text-[var(--text-2)]">{msg.subject}</p>
              {size !== "sm" && (
                <p className="truncate text-xs text-[var(--text-3)]">{msg.snippet}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
