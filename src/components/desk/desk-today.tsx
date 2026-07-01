"use client";

import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useAccount } from "@/hooks/use-account";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { useDeskCalendar } from "@/hooks/use-desk";
import { cn } from "@/lib/format";
import { DeskSectionLabel, DeskTaskRow, DeskEmpty, DeskSkeleton } from "./desk-shared";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Editorial "Today" tab — the one place The Desk takes a Dia-style liberty
 *  (serif greeting + mono date rail), while staying on brand (blue, not yellow). */
export function DeskToday() {
  const account = useAccount();
  const myDay = useMyDay();
  const attention = useTaskAttention({ mine: true });
  const calendar = useDeskCalendar();

  const now = new Date();
  const firstName = (account.data?.name ?? "").trim().split(" ")[0] || "there";
  const longDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const amPushed = Boolean(myDay.data?.update.amPushedAt);
  const pmPushed = Boolean(myDay.data?.update.pmPushedAt);

  // Today's focus = first in-progress task, else the first up-next.
  const focus = myDay.data?.doing[0] ?? myDay.data?.upcoming[0] ?? null;

  // Next meeting today (calendar is ordered by start time; filter to today).
  const todaysEvents = (calendar.data?.events ?? []).filter((ev) => {
    if (!ev.start) return false;
    const d = new Date(ev.start);
    return d.toDateString() === now.toDateString();
  });
  const nextMeeting = todaysEvents.find((ev) => new Date(ev.start) >= now) ?? todaysEvents[0] ?? null;

  const overdueCount = attention.data?.overdueCount ?? 0;
  const doingCount = attention.data?.doingCount ?? 0;
  const dueSoonCount = attention.data?.dueSoonCount ?? 0;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
      {/* Left — editorial header + focus */}
      <div>
        <div className="flex items-baseline gap-3">
          <span
            className="text-[11px] uppercase tracking-[1.4px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {longDate}
          </span>
        </div>
        <h2
          className="mt-1 text-[32px] leading-[1.1] tracking-[-0.01em] text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {greeting(now.getHours())}, {firstName}.
        </h2>

        {/* Standup status */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StandupPill label="AM standup" done={amPushed} />
          <StandupPill label="PM standup" done={pmPushed} />
          <Link
            href="/app"
            className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-700)] hover:underline"
          >
            My Day <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>

        {/* Focus */}
        <div className="mt-5">
          <DeskSectionLabel>Focus</DeskSectionLabel>
          {myDay.isPending ? (
            <DeskSkeleton />
          ) : focus ? (
            <DeskTaskRow task={focus} />
          ) : (
            <DeskEmpty>Nothing in progress — pick something from Tasks.</DeskEmpty>
          )}
        </div>
      </div>

      {/* Right — counts + next meeting */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat n={overdueCount} label="Overdue" tone={overdueCount > 0 ? "danger" : "muted"} />
          <Stat n={doingCount} label="Doing" tone="muted" />
          <Stat n={dueSoonCount} label="Due soon" tone="muted" />
        </div>

        <div>
          <DeskSectionLabel>Next up</DeskSectionLabel>
          {calendar.isPending ? (
            <DeskSkeleton />
          ) : nextMeeting ? (
            <div className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5">
              <p
                className="text-[11px] text-[var(--text-4)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {new Date(nextMeeting.start).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-[var(--text-1)]">
                {nextMeeting.summary}
              </p>
              {nextMeeting.meetLink ? (
                <a
                  href={nextMeeting.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-[var(--brand-700)] hover:underline"
                >
                  Join →
                </a>
              ) : null}
            </div>
          ) : (
            <DeskEmpty>No more meetings today.</DeskEmpty>
          )}
        </div>
      </div>
    </div>
  );
}

function StandupPill({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 text-xs font-medium",
        done
          ? "border-[var(--border-2)] bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border-dashed border-[var(--border-2)] text-[var(--text-4)]",
      )}
    >
      {done ? <CheckCircleIcon className="h-3.5 w-3.5" /> : null}
      {label}
      {!done ? " pending" : ""}
    </span>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "danger" | "muted" }) {
  return (
    <div className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-2 text-center">
      <p
        className={cn(
          "text-[26px] leading-none",
          tone === "danger" && n > 0 ? "text-[var(--danger-500)]" : "text-[var(--text-1)]",
        )}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {n}
      </p>
      <p
        className="mt-1 text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
    </div>
  );
}
