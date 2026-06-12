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
      <div className="flex h-full flex-col">
        {/* Widget header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
            10 // MAIL
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50">
            <EnvelopeIcon className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#0F172A]">Gmail not connected</p>
            <p className="mt-0.5 text-xs text-[#475569]">
              Sign out and back in to grant Gmail access
            </p>
          </div>
          <Link
            href="/api/auth/signout"
            className="rounded-[6px] bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Re-connect via Google
          </Link>
        </div>
      </div>
    );
  }

  const messages = data.messages ?? [];
  const unread = messages.filter((m) => m.unread).length;
  const displayCount = size === "lg" ? 10 : size === "md" ? 7 : 3;

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          10 // MAIL
        </span>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1D4ED8] px-1 text-xs font-bold text-white">
              {unread}
            </span>
          )}
          <span className="text-xs text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>{messages.length} msgs</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <div className="flex-1 divide-y divide-[rgba(0,0,0,0.06)] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[#94A3B8]">
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
                    className={`truncate text-sm ${msg.unread ? "font-semibold text-[#0F172A]" : "text-[#475569]"}`}
                  >
                    {parseFrom(msg.from)}
                  </span>
                  <span className="shrink-0 text-xs text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>{formatDate(msg.date)}</span>
                </div>
                <p className="truncate text-sm text-[#475569]">{msg.subject}</p>
                {size !== "sm" && (
                  <p className="truncate text-xs text-[#94A3B8]">{msg.snippet}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
