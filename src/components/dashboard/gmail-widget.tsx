"use client";

import Link from "next/link";
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
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-1)]">
          <svg className="h-5 w-5 text-[var(--text-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-xs font-medium text-[var(--text-2)]">Gmail not connected</p>
        <Link href="/app/settings" className="text-[11px] text-[var(--accent)] hover:underline">
          Connect in Settings →
        </Link>
      </div>
    );
  }

  const messages = data.messages ?? [];
  const unread = messages.filter((m) => m.unread).length;
  const displayCount = size.rows >= 3 ? 10 : size.rows >= 2 ? 6 : 3;

  return (
    <div className="flex h-full flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-2)]">Mail</span>
          {unread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--text-3)]">{messages.length} messages</span>
      </div>

      <div className="flex-1 divide-y divide-[var(--border-1)] overflow-y-auto">
        {messages.slice(0, displayCount).map((msg) => (
          <div key={msg.id} className={`py-1.5 ${msg.unread ? "opacity-100" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <span className={`text-xs ${msg.unread ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}`}>
                {parseFrom(msg.from)}
              </span>
              <span className="shrink-0 text-[10px] text-[var(--text-3)]">{formatDate(msg.date)}</span>
            </div>
            <p className="truncate text-[11px] text-[var(--text-2)]">{msg.subject}</p>
            {size.cols >= 2 && (
              <p className="truncate text-[10px] text-[var(--text-3)]">{msg.snippet}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
