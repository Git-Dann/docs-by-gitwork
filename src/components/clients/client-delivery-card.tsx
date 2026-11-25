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
        <div className="p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : query.isError || !t ? (
        <p className="px-4 py-6 text-sm text-[var(--text-3)]">
          Couldn&apos;t load the timeline just now.{" "}
          <button type="button" onClick={() => void query.refetch()} className="app-button app-button-hyperlink">
            Try again
          </button>
        </p>
      ) : (
        <Strip weeks={t.weeks.slice(0, BAR_WEEKS)} state={t.state} slug={slug} failed={t.failed} />
      )}

      {t ? <WeeklyUpdateDialog open={writing} onClose={() => setWriting(false)} slug={slug} clientName={t.clientName} /> : null}
    </section>
  );
}

const SERIF = { fontFamily: "var(--font-display), 'DM Serif Display', Georgia, serif" } as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
      {children}
    </p>
  );
}

/**
 * Everything in one strip: the picked week (its done count and an 8-week sparkline to pick
 * another), the next release, and three numbers; then that week's events on one line.
 */
function Strip({ weeks, state, slug, failed }: { weeks: DeliveryWeek[]; state: DeliveryState; slug: string; failed: string[] }) {
  // Newest first from the server; the sparkline reads left to right, oldest to newest.
  const bars = [...weeks].reverse();
  const [picked, setPicked] = useState(bars.length - 1);
  const [allEvents, setAllEvents] = useState(false);
  const week = bars[picked];
  const most = Math.max(1, ...bars.map((w) => w.counts.done ?? 0));
  const now = new Date();
  const inProgress = splitLongOverdue(state.inProgress, now);
  const upNext = splitLongOverdue(state.upNext, now);
  const overdue = [...inProgress.longOverdue, ...upNext.longOverdue];
  const r = state.nextRelease;
  const pct = r ? Math.round((r.done / Math.max(1, r.total)) * 100) : 0;
  const board = `/app/portal/${slug}/tasks`;
  const names = (list: Array<{ title: string }>) => list.slice(0, 6).map((x) => `• ${x.title}`).join("\n");
  const events = week ? weekHighlights(week) : [];
  const shown = allEvents ? events : events.slice(0, FIRST_EVENTS);
  const weekName = (w: DeliveryWeek) =>
    w.label === "This week" || w.label === "Last week" ? w.label : `Week of ${shortDay(new Date(`${w.start}T00:00:00Z`))}`;

  return (
    <div data-delivery-strip>
      <div className="grid grid-cols-3 divide-[var(--border-1)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))] lg:divide-x">
        {/* The week: its done count, and the sparkline to pick another. */}
        <div className="col-span-3 flex items-end justify-between gap-4 border-b border-[var(--border-1)] px-4 py-3 lg:col-span-1 lg:border-b-0">
          <div className="min-w-0">
            <Label>{week ? weekName(week) : "This week"}</Label>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[28px] leading-none text-[var(--text-1)]" style={SERIF}>
                {week?.counts.done ?? 0}
              </span>
              <span className="text-xs text-[var(--text-3)]">done</span>
            </p>
          </div>
          <div className="flex h-9 items-end gap-[3px]" role="radiogroup" aria-label="Week" data-delivery-bars>
            {bars.map((w, i) => {
              const done = w.counts.done ?? 0;
              const on = i === picked;
              const outage = (w.counts.incident ?? 0) > 0;
              const release = (w.counts.shipped ?? 0) > 0;
              return (
                <button
                  key={w.start}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${weekName(w)}: ${weekSummary(w.counts)}`}
                  title={`${weekName(w)}: ${weekSummary(w.counts)}`}
                  onClick={() => {
                    setPicked(i);
                    setAllEvents(false);
                  }}
                  className="group relative flex h-full w-2.5 flex-col justify-end outline-none"
                  data-delivery-bar
                >
                  {outage || release ? (
                    <span
                      aria-hidden
                      className={cn("absolute -top-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full", outage ? "bg-[var(--danger-500)]" : "bg-[var(--success-500)]")}
                    />
                  ) : null}
                  <span
                    className={cn("w-full rounded-[2px] transition-colors", on ? "bg-[var(--brand-600)]" : "bg-[var(--brand-200)] group-hover:bg-[var(--brand-600)]/50")}
                    style={{ height: `${Math.max(3, Math.round((done / most) * 32))}px` }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* The next release. */}
        <div className="col-span-3 min-w-0 border-b border-[var(--border-1)] px-4 py-3 lg:col-span-1 lg:border-b-0">
          <Label>{r?.endDate ? `Next release · due ${shortDay(new Date(r.endDate))}` : "Next release"}</Label>
          {r ? (
            <>
              <p className="mt-1 truncate text-sm font-medium text-[var(--text-1)]" title={r.label}>
                {r.label}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
                  <div className="h-full rounded-full bg-[var(--brand-600)]" style={{ width: `${pct}%` }} />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-3)]" style={MONO}>
                  {r.done}/{r.total}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-4)]">None scheduled</p>
          )}
        </div>

        <Figure label="In progress" n={inProgress.current.length} href={board} tip={names(inProgress.current)} />
        <Figure label="Up next" n={upNext.current.length} href={board} tip={names(upNext.current)} />
        <Figure
          label="Overdue"
          n={overdue.length}
          href={board}
          muted
          tip={overdue.length ? `More than ${LONG_OVERDUE_DAYS} days past due:\n${names(overdue)}` : `Nothing more than ${LONG_OVERDUE_DAYS} days past due`}
        />
      </div>

      {/* The picked week's events, inline. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--border-1)] px-4 py-2.5" data-delivery-events>
        {state.waitingOnClient.length ? (
          <Link href={board} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-700" title={names(state.waitingOnClient)}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--warning-500)]" />
            {state.waitingOnClient.length} waiting on the client
          </Link>
        ) : null}
        {shown.length ? (
          shown.map((i) => <EventChip key={i.id} item={i} />)
        ) : (
          <span className="text-[13px] text-[var(--text-4)]">{week ? `${weekName(week)}: no releases, outages or meetings.` : "Nothing recorded yet."}</span>
        )}
        {events.length > FIRST_EVENTS ? (
          <button type="button" onClick={() => setAllEvents((v) => !v)} className="app-button app-button-hyperlink text-xs">
            {allEvents ? "Less" : `+${events.length - FIRST_EVENTS}`}
          </button>
        ) : null}
        <Link href={board} className="app-button app-button-hyperlink ml-auto text-xs">
          Board
          <ArrowRightIcon className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      {failed.length > 0 ? (
        <p className="border-t border-[var(--border-1)] px-4 py-2 text-xs text-[var(--text-3)]">Couldn&apos;t read {failed.join(", ")} just now.</p>
      ) : null}
    </div>
  );
}

/** A number that opens the board; the names are in the tooltip. */
function Figure({ label, n, href, tip, muted }: { label: string; n: number; href: string; tip: string; muted?: boolean }) {
  return (
    <Link href={href} title={tip || label} className="group min-w-0 px-4 py-3 transition-colors hover:bg-[var(--surface-1)]" data-delivery-figure>
      <Label>{label}</Label>
      <p className={cn("mt-1 text-[28px] leading-none", muted && n > 0 ? "text-[var(--text-3)]" : "text-[var(--text-1)]", n === 0 && "text-[var(--text-4)]")} style={SERIF}>
        {n}
      </p>
    </Link>
  );
}

/** One event, inline: icon, a short title (full text on hover), the day. */
function EventChip({ item }: { item: DeliveryItem }) {
  const Icon = KIND_ICON[item.kind];
  const day = new Date(item.at).toLocaleDateString("en-GB", { weekday: "short" });
  const tip = [item.title, item.detail, new Date(item.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", KIND_TONE[item.kind] ?? "text-[var(--text-4)]")} />
      <span className="max-w-[240px] truncate text-[13px] text-[var(--text-1)]">{item.title}</span>
      <span className="shrink-0 text-[11px] text-[var(--text-4)]" style={MONO}>
        {day}
      </span>
    </>
  );
  return item.href ? (
    <Link href={item.href} title={tip} className="inline-flex min-w-0 items-center gap-1.5 hover:text-[var(--brand-700)]">
      {body}
    </Link>
  ) : (
    <span title={tip} className="inline-flex min-w-0 items-center gap-1.5">
      {body}
    </span>
  )
}
