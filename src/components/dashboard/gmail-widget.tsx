"use client";

import Link from "next/link";
import { EnvelopeIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import { getGmailMessages } from "@/lib/api";
import type { WidgetSize } from "@/components/app-overview";
import { SkeletonRows } from "@/components/ui/motion/skeleton";
import { TileHeader } from "@/components/dashboard/tile-header";
import { isAutomatedMail } from "@/lib/hq-mail";
import { useEffect, useState } from "react";

const SHOW_ALL_KEY = "foundry.hq.mail.showAutomated.v1";

/** Whether to show automated mail too, remembered per browser. Fails closed to "people only". */
function useShowAutomated(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(SHOW_ALL_KEY) === "1");
    } catch {
      /* blocked storage: people-only */
    }
  }, []);
  return [
    value,
    (v: boolean) => {
      setValue(v);
      try {
        window.localStorage.setItem(SHOW_ALL_KEY, v ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
  ];
}

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

export default function GmailWidget({ size, index }: { size: WidgetSize; index: number }) {
  const [showAutomated, setShowAutomated] = useShowAutomated();
  const { data, isLoading } = useQuery({
    queryKey: ["integrations", "gmail"],
    // Wrap so React Query's QueryFunctionContext isn't passed as the `query` arg.
    queryFn: () => getGmailMessages(),
    staleTime: 1000 * 60 * 2,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <TileHeader index={index} label="MAIL" />
        <SkeletonRows count={6} className="p-4" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="flex h-full flex-col">
        <TileHeader index={index} label="MAIL" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
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
            className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Re-connect via Google
          </Link>
        </div>
      </div>
    );
  }

  const messages = data.messages ?? [];
  const unread = messages.filter((m) => m.unread).length;
  const displayCount = size === "lg" ? 12 : size === "md" ? 9 : 3;
  // People first. Bot notifications, newsletters and no-reply senders sit behind a
  // toggle rather than being dropped: the count says how many are folded away.
  const automated = messages.filter((m) => isAutomatedMail(m.from, m.subject));
  const shown = showAutomated ? messages : messages.filter((m) => !isAutomatedMail(m.from, m.subject));
  const folded = showAutomated ? 0 : automated.length;

  return (
    <div className="flex h-full flex-col">
      <TileHeader
        index={index}
        label="MAIL"
        status={unread > 0 ? `${unread} NEW` : `${messages.length} MSGS`}
        statusTone={unread > 0 ? "brand" : "muted"}
        href="https://mail.google.com/mail/u/0/#inbox"
        hrefLabel="Open Gmail"
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 divide-y divide-[var(--border-2)] overflow-y-auto px-4 py-1">
          {shown.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-xs text-[var(--text-4)]">
              <p>{messages.length === 0 ? "Inbox empty" : "Nothing from people right now"}</p>
            </div>
          ) : (
            shown.slice(0, displayCount).map((msg) => (
              <a
                key={msg.id}
                href={`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(msg.threadId)}`}
                target="_blank"
                rel="noreferrer"
                title={`${parseFrom(msg.from)}: ${msg.subject}${msg.snippet ? `\n${msg.snippet}` : ""}`}
                className={`-mx-2 block rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)] ${msg.unread ? "" : "opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {msg.unread ? <span aria-label="Unread" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" /> : null}
                    <span className={`truncate text-sm ${msg.unread ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}`}>
                      {parseFrom(msg.from)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>{formatDate(msg.date)}</span>
                </div>
                <p className="truncate text-sm text-[var(--text-2)]">{msg.subject}</p>
                {size !== "sm" && <p className="truncate text-xs text-[var(--text-4)]">{msg.snippet}</p>}
              </a>
            ))
          )}
        </div>
        {automated.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAutomated(!showAutomated)}
            className="shrink-0 border-t border-[var(--border-2)] px-4 py-2 text-left text-[11px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            aria-pressed={showAutomated}
          >
            {showAutomated
              ? "Hide notifications and newsletters"
              : `${folded} notification${folded === 1 ? "" : "s"} and newsletter${folded === 1 ? "" : "s"} hidden · Show`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
