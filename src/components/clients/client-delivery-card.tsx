"use client";

/**
 * The Portal client page's Timeline card, made to be glanced at (§163): eight weeks as small
 * bars (how much got done, a dot for a release or an outage), the picked week in one line and its
 * few events, and where things stand as a handful of numbers. Finished tasks aren't listed here;
 * the board has them. "Weekly update" drafts the Friday email. Rules in
 * src/lib/client-delivery-timeline.ts; data from /api/clients/[slug]/delivery-timeline.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import {
  ArrowRightIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  NoSymbolIcon,
  PlayIcon,
  ArchiveBoxIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { getDeliveryTimeline } from "@/lib/api";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { WeeklyUpdateDialog } from "@/components/clients/weekly-update-dialog";
import {
  LONG_OVERDUE_DAYS,
  shortDay,
  splitLongOverdue,
  weekHighlights,
  weekSummary,
  type DeliveryItem,
  type DeliveryKind,
  type DeliveryState,
  type DeliveryWeek,
} from "@/lib/client-delivery-timeline";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Weeks drawn as bars. */
const BAR_WEEKS = 8;
/** Events listed for the picked week before "+N more". */
const FIRST_EVENTS = 4;

const KIND_ICON: Record<DeliveryKind, ComponentType<{ className?: string }>> = {
  done: CheckCircleIcon,
  started: PlayIcon,
  shipped: RocketLaunchIcon,
  request: InboxArrowDownIcon,
  meeting: ChatBubbleLeftRightIcon,
  incident: ExclamationTriangleIcon,
  document: DocumentTextIcon,
  blocked: NoSymbolIcon,
  tidy: ArchiveBoxIcon,
};

/** Colour only where it means something: an outage, a blocker, or a release out of the door. */
const KIND_TONE: Partial<Record<DeliveryKind, string>> = {
  incident: "text-[var(--danger-500)]",
  blocked: "text-[var(--warning-500)]",
  shipped: "text-[var(--success-500)]",
};

export function ClientDeliveryCard({ number, slug }: { number: string; slug: string }) {
  const [writing, setWriting] = useState(false);
  const query = useQuery({
    queryKey: ["client-delivery-timeline", slug],
    queryFn: () => getDeliveryTimeline(slug, 8),
    staleTime: 60_000,
  });
  const t = query.data;

  return (
    <section className="widget-card flex flex-col" data-delivery-timeline>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {" // TIMELINE"}
        </span>
        <button type="button" onClick={() => setWriting(true)} className="app-button app-button-secondary app-button-xs" disabled={!t}>
          <EnvelopeIcon className="h-3.5 w-3.5" />
          Weekly update
        </button>
      </div>

      {query.isPending ? (
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : query.isError || !t ? (
        <p className="px-4 py-6 text-sm text-[var(--text-3)]">
          Couldn&apos;t load the timeline just now.{" "}
          <button type="button" onClick={() => void query.refetch()} className="app-button app-button-hyperlink">
            Try again
          </button>
        </p>
      ) : (
        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
          <Weeks weeks={t.weeks.slice(0, BAR_WEEKS)} failed={t.failed} />
          <Now state={t.state} slug={slug} />
        </div>
      )}

      {t ? <WeeklyUpdateDialog open={writing} onClose={() => setWriting(false)} slug={slug} clientName={t.clientName} /> : null}
    </section>
  );
}

/** Eight weeks as bars, oldest on the left; the picked week's line and its events underneath. */
function Weeks({ weeks, failed }: { weeks: DeliveryWeek[]; failed: string[] }) {
  // Newest first from the server; the bars read left to right, oldest to newest.
  const bars = [...weeks].reverse();
  const [picked, setPicked] = useState(bars.length - 1);
  const [allEvents, setAllEvents] = useState(false);
  const week = bars[picked];
  const most = Math.max(1, ...bars.map((w) => w.counts.done ?? 0));
  if (!week) return <p className="p-4 text-sm text-[var(--text-4)]">Nothing recorded yet.</p>;
  const events = weekHighlights(week);
  const shown = allEvents ? events : events.slice(0, FIRST_EVENTS);
  const start = new Date(`${week.start}T00:00:00Z`);

  return (
    <div className="min-w-0 border-[var(--border-1)] p-4 lg:border-r">
      <div className="flex h-24 items-end gap-1.5" role="radiogroup" aria-label="Week" data-delivery-bars>
        {bars.map((w, i) => {
          const done = w.counts.done ?? 0;
          const outage = (w.counts.incident ?? 0) > 0;
          const release = (w.counts.shipped ?? 0) > 0;
          const on = i === picked;
          const day = new Date(`${w.start}T00:00:00Z`);
          return (
            <button
              key={w.start}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setPicked(i);
                setAllEvents(false);
              }}
              title={`${w.label === "This week" || w.label === "Last week" ? w.label : `Week of ${shortDay(day)}`}: ${weekSummary(w.counts)}`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 outline-none"
              data-delivery-bar
            >
              <span className="flex h-2 items-center gap-0.5" aria-hidden>
                {release ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-500)]" /> : null}
                {outage ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger-500)]" /> : null}
              </span>
              <span
                className={cn(
                  "w-full max-w-[44px] rounded-[3px] transition-colors",
                  on ? "bg-[var(--brand-600)]" : "bg-[var(--brand-200)] group-hover:bg-[var(--brand-600)]/50",
                )}
                style={{ height: `${Math.max(4, Math.round((done / most) * 56))}px` }}
              />
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] tabular-nums",
                  on ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-4)]",
                  // On a phone eight dates don't fit: every other one, and always the picked week.
                  !on && i % 2 !== (bars.length - 1) % 2 && "invisible sm:visible",
                )}
                style={MONO}
              >
                {shortDay(day)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-2)]" style={MONO}>
          {week.label === "This week" || week.label === "Last week" ? week.label : `Week of ${shortDay(start)}`}
        </span>
        <span className="text-sm text-[var(--text-3)]">{weekSummary(week.counts)}</span>
      </div>

      {shown.length ? (
        <ul className="mt-2 space-y-1">
          {shown.map((i) => (
            <EventLine key={i.id} item={i} />
          ))}
          {events.length > FIRST_EVENTS ? (
            <li>
              <button type="button" onClick={() => setAllEvents((v) => !v)} className="app-button app-button-hyperlink text-xs">
                {allEvents ? "Show less" : `+${events.length - FIRST_EVENTS} more`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {failed.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--text-3)]">Couldn&apos;t read {failed.join(", ")} just now, so this may be missing some of it.</p>
      ) : null}
    </div>
  );
}

/** One event on one line: what happened, and the day. Full text on hover. */
function EventLine({ item }: { item: DeliveryItem }) {
  const Icon = KIND_ICON[item.kind];
  const day = new Date(item.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  const tip = [item.title, item.detail].filter(Boolean).join(" · ");
  const body = (
    <>
      <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", KIND_TONE[item.kind] ?? "text-[var(--text-4)]")} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]">
        {item.title}
        {item.detail ? <span className="text-[var(--text-4)]"> · {item.detail}</span> : null}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-4)]" style={MONO}>
        {day}
      </span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} title={tip} className="flex items-center gap-2 hover:text-[var(--brand-700)]">
          {body}
        </Link>
      ) : (
        <div title={tip} className="flex items-center gap-2">
          {body}
        </div>
      )}
    </li>
  );
}

/** Where things stand: the next release, then three numbers that each open the board. */
function Now({ state, slug }: { state: DeliveryState; slug: string }) {
  const now = new Date();
  const inProgress = splitLongOverdue(state.inProgress, now);
  const upNext = splitLongOverdue(state.upNext, now);
  const longOverdue = inProgress.longOverdue.length + upNext.longOverdue.length;
  const r = state.nextRelease;
  const pct = r ? Math.round((r.done / Math.max(1, r.total)) * 100) : 0;
  const board = `/app/portal/${slug}/tasks`;
  const names = (list: Array<{ title: string }>) => list.slice(0, 5).map((x) => `• ${x.title}`).join("\n");
  return (
    <aside className="flex flex-col gap-3 border-t border-[var(--border-1)] p-4 lg:border-t-0" aria-label="Where things stand">
      {r ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
            Next release
          </p>
          <p className="mt-1 truncate text-sm font-medium text-[var(--text-1)]" title={r.label}>
            {r.label}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]" aria-hidden>
            <div className="h-full bg-[var(--brand-600)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 flex justify-between text-xs text-[var(--text-3)]">
            <span>
              {r.done} of {r.total} done
            </span>
            {r.endDate ? <span>due {shortDay(new Date(r.endDate))}</span> : null}
          </p>
        </div>
      ) : null}

      <ul className="divide-y divide-[var(--border-1)] border-y border-[var(--border-1)]" data-delivery-now>
        {state.waitingOnClient.length ? (
          <NowCount label="Waiting on the client" n={state.waitingOnClient.length} href={board} tone="warning" tip={names(state.waitingOnClient)} />
        ) : null}
        <NowCount label="In progress" n={inProgress.current.length} href={board} tip={names(inProgress.current)} />
        <NowCount label="Up next" n={upNext.current.length} href={board} tip={names(upNext.current)} />
        {longOverdue ? (
          <NowCount
            label="Long overdue"
            n={longOverdue}
            href={board}
            tone="muted"
            tip={`More than ${LONG_OVERDUE_DAYS} days past due: worth closing or re-dating.\n${names([...inProgress.longOverdue, ...upNext.longOverdue])}`}
          />
        ) : null}
      </ul>

      <Link href={board} className="app-button app-button-hyperlink self-start text-xs">
        Open the board
      </Link>
    </aside>
  );
}

function NowCount({ label, n, href, tip, tone }: { label: string; n: number; href: string; tip: string; tone?: "warning" | "muted" }) {
  return (
    <li>
      <Link href={href} title={tip || label} className="group flex items-center justify-between gap-3 py-2 text-sm">
        <span className={cn("text-[var(--text-2)] group-hover:text-[var(--brand-700)]", tone === "muted" && "text-[var(--text-4)]")}>
          {tone === "warning" ? <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--warning-500)] align-middle" /> : null}
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("text-base font-semibold tabular-nums text-[var(--text-1)]", tone === "muted" && "text-[var(--text-3)]")}>{n}</span>
          <ArrowRightIcon aria-hidden className="h-3 w-3 text-[var(--text-4)] opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </Link>
    </li>
  );
}
