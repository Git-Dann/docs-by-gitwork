"use client";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useAccount } from "@/hooks/use-account";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { useDeskCalendar } from "@/hooks/use-desk";
import { cn } from "@/lib/format";
import { EditorialRow, Stamp, DeskTaskRow, DeskEmpty, DeskSkeleton } from "./desk-shared";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Editorial "Today" tab — Dia-style masthead (mono rails + serif greeting) then
 *  two-column rows. On brand: blue, not yellow. */
export function DeskToday() {
  const account = useAccount();
  const myDay = useMyDay();
  const attention = useTaskAttention({ mine: true });
  const calendar = useDeskCalendar();

  const now = new Date();
  const firstName = (account.data?.name ?? "").trim().split(" ")[0] || "there";
  const dateStr = now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const timeStr = now
    .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    .toUpperCase();

  const amPushed = Boolean(myDay.data?.update.amPushedAt);
  const pmPushed = Boolean(myDay.data?.update.pmPushedAt);
  const focus = myDay.data?.doing[0] ?? myDay.data?.upcoming[0] ?? null;

  const todaysEvents = (calendar.data?.events ?? []).filter(
    (ev) => ev.start && new Date(ev.start).toDateString() === now.toDateString(),
  );
  const nextMeeting =
    todaysEvents.find((ev) => new Date(ev.start) >= now) ?? todaysEvents[0] ?? null;

  const overdueCount = attention.data?.overdueCount ?? 0;
  const doingCount = attention.data?.doingCount ?? 0;
  const dueSoonCount = attention.data?.dueSoonCount ?? 0;

  return (
    <div>
      {/* Masthead */}
      <div className="mb-2">
        <div
          className="flex items-center justify-between text-[11px] uppercase tracking-[1.6px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <h2
          className="mt-3 text-[40px] leading-[1.05] tracking-[-0.01em] text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {greeting(now.getHours())},{" "}
          <span style={{ fontStyle: "italic" }} className="text-[var(--brand-700)]">
            {firstName}
          </span>
          .
        </h2>
      </div>

      {/* Push your work forward */}
      <EditorialRow
        title="Push your work forward"
        caption="Your focus and standup for today."
        stamp={<Stamp label="My Day" href="/app" />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StandupPill label="AM standup" done={amPushed} />
          <StandupPill label="PM standup" done={pmPushed} />
        </div>
        <div className="mt-4">
          {myDay.isPending ? (
            <DeskSkeleton />
          ) : focus ? (
            <DeskTaskRow task={focus} />
          ) : (
            <DeskEmpty>Nothing in progress — pick something up from Tasks.</DeskEmpty>
          )}
        </div>
      </EditorialRow>

      {/* Your day */}
      <EditorialRow title="Your day" caption="At a glance, and what's next.">
        <div className="grid grid-cols-3 gap-3">
          <Stat n={overdueCount} label="Overdue" danger />
          <Stat n={doingCount} label="Doing" />
          <Stat n={dueSoonCount} label="Due soon" />
        </div>
        <div className="mt-4">
          {calendar.isPending ? (
            <DeskSkeleton />
          ) : nextMeeting ? (
            <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3">
              <div className="flex items-center justify-between">
                <span
                  className="text-[11px] uppercase tracking-[1px] text-[var(--text-4)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Next up ·{" "}
                  {new Date(nextMeeting.start).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {nextMeeting.meetLink ? (
                  <a
                    href={nextMeeting.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-[var(--brand-700)] hover:underline"
                  >
                    Join →
                  </a>
                ) : null}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-[var(--text-1)]">
                {nextMeeting.summary}
              </p>
            </div>
          ) : (
            <DeskEmpty>No more meetings today — clear runway.</DeskEmpty>
          )}
        </div>
      </EditorialRow>
    </div>
  );
}

function StandupPill({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium",
        done
          ? "border-[var(--border-2)] bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border-dashed border-[var(--border-2)] text-[var(--text-4)]",
      )}
    >
      {done ? <CheckCircleIcon className="h-3.5 w-3.5" /> : null}
      {label}
      {done ? " pushed" : " pending"}
    </span>
  );
}

function Stat({ n, label, danger }: { n: number; label: string; danger?: boolean }) {
  return (
    <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-3 text-center">
      <p
        className={cn(
          "text-[34px] leading-none",
          danger && n > 0 ? "text-[var(--danger-500)]" : "text-[var(--text-1)]",
        )}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {n}
      </p>
      <p
        className="mt-1.5 text-[10px] uppercase tracking-[0.8px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
    </div>
  );
}
