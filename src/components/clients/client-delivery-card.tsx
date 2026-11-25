"use client";

/**
 * The Portal client page's Timeline card: what happened on the client's work, week by week, and
 * where things stand now. "Weekly update" drafts the Friday email from it. Rules in
 * src/lib/client-delivery-timeline.ts; data from /api/clients/[slug]/delivery-timeline.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import {
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  NoSymbolIcon,
  PlayIcon,
  ArchiveBoxIcon,
  ChevronRightIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { getDeliveryTimeline } from "@/lib/api";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { WeeklyUpdateDialog } from "@/components/clients/weekly-update-dialog";
import {
  DELIVERY_KIND_LABEL,
  LONG_OVERDUE_DAYS,
  doneByGroup,
  dueWords,
  foldQuietWeeks,
  shortDay,
  splitLongOverdue,
  weekHighlights,
  type DeliveryItem,
  type DeliveryKind,
  type DeliveryState,
  type DeliveryWeek,
} from "@/lib/client-delivery-timeline";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Weeks shown before "Show earlier weeks". Each is one line until opened. */
const FIRST_WEEKS = 6;
/** Done tasks shown per group before "+N more". */
const FIRST_IN_GROUP = 3;
/** Tasks listed in each "now" list. */
const NOW_ITEMS = 4;

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
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [writing, setWriting] = useState(false);
  const query = useQuery({
    queryKey: ["client-delivery-timeline", slug],
    queryFn: () => getDeliveryTimeline(slug, 8),
    staleTime: 60_000,
  });
  const t = query.data;
  const weeks = t ? (showAllWeeks ? t.weeks : t.weeks.slice(0, FIRST_WEEKS)) : [];
  // The busiest week sets the scale of every week's activity bar.
  const busiest = Math.max(1, ...(t?.weeks ?? []).map((w) => w.counts.done ?? 0));

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
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError || !t ? (
        <p className="px-4 py-6 text-sm text-[var(--text-3)]">
          Couldn&apos;t load the timeline just now.{" "}
          <button type="button" onClick={() => void query.refetch()} className="app-button app-button-hyperlink">
            Try again
          </button>
        </p>
      ) : (
        <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 border-[var(--border-1)] lg:border-r">
            {foldQuietWeeks(weeks).map((row, i) =>
              row.kind === "week" ? (
                <WeekRow key={row.week.start} week={row.week} busiest={busiest} startOpen={i === 0 && row.week.items.length > 0} />
              ) : (
                <QuietWeeks key={row.weeks[0].start} weeks={row.weeks} />
              ),
            )}
            {t.weeks.length > FIRST_WEEKS ? (
              <div className="border-t border-[var(--border-1)] px-4 py-2.5">
                <button type="button" onClick={() => setShowAllWeeks((v) => !v)} className="app-button app-button-hyperlink text-xs">
                  {showAllWeeks ? "Show fewer weeks" : `Show ${t.weeks.length - FIRST_WEEKS} earlier weeks`}
                </button>
              </div>
            ) : null}
            {t.failed.length > 0 ? (
              <p className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-2)]">
                Couldn&apos;t read {t.failed.join(", ")} just now, so this may be missing some of it.
              </p>
            ) : null}
          </div>
          <NowPanel state={t.state} slug={slug} />
        </div>
      )}

      {t ? <WeeklyUpdateDialog open={writing} onClose={() => setWriting(false)} slug={slug} clientName={t.clientName} /> : null}
    </section>
  );
}

/** A run of quiet weeks as one row. */
function QuietWeeks({ weeks }: { weeks: DeliveryWeek[] }) {
  const newest = new Date(`${weeks[0].start}T00:00:00Z`);
  const oldest = new Date(`${weeks[weeks.length - 1].start}T00:00:00Z`);
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-1)] px-4 py-2.5 last:border-b-0" data-delivery-week>
      <span className="w-[132px] shrink-0 text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
        {weeks.length} quiet weeks
      </span>
      <span className="min-w-0 truncate text-xs text-[var(--text-4)]" title={`${shortDay(oldest)} to ${shortDay(newest)}`}>
        {shortDay(oldest)} – {shortDay(newest)}
      </span>
    </div>
  );
}

/** The events that get a chip on a week's line: the things a client would ask about. */
const CHIP_KINDS: Array<{ kind: DeliveryKind; one: string; many: string; tone: string }> = [
  { kind: "shipped", one: "release", many: "releases", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { kind: "incident", one: "outage", many: "outages", tone: "border-red-200 bg-red-50 text-red-700" },
  { kind: "blocked", one: "blocker", many: "blockers", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { kind: "meeting", one: "meeting", many: "meetings", tone: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]" },
  { kind: "request", one: "request", many: "requests", tone: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]" },
];

/**
 * One week on one line: when, how busy (a bar scaled to the busiest week), the events that matter
 * as chips, and how much got done. Opens to the events, then the finished work grouped by release
 * or category, one line per task.
 */
function WeekRow({ week, busiest, startOpen }: { week: DeliveryWeek; busiest: number; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const start = new Date(`${week.start}T00:00:00Z`);
  const done = week.counts.done ?? 0;
  const empty = week.items.length === 0;
  return (
    <div className="border-b border-[var(--border-1)] last:border-b-0" data-delivery-week>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={empty}
        aria-expanded={empty ? undefined : open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors enabled:hover:bg-[var(--surface-1)]"
        data-delivery-week-toggle
      >
        <ChevronRightIcon
          aria-hidden
          className={cn("h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition-transform motion-reduce:transition-none", open && "rotate-90", empty && "opacity-0")}
        />
        <span className="w-[116px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-2)]" style={MONO}>
          {week.label.startsWith("Week of") ? shortDay(start) : week.label}
        </span>
        <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-[3px] bg-[var(--surface-2)] sm:block" aria-hidden>
          <span className="block h-full rounded-[3px] bg-[var(--brand-600)]" style={{ width: `${Math.round((done / busiest) * 100)}%` }} />
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {CHIP_KINDS.map(({ kind, one, many, tone }) => {
            const n = week.counts[kind] ?? 0;
            return n ? (
              <span key={kind} className={cn("rounded-[4px] border px-1.5 text-[10px] uppercase tracking-[0.06em]", tone)} style={MONO}>
                {n} {n === 1 ? one : many}
              </span>
            ) : null;
          })}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-[var(--text-3)]">{empty ? "Quiet" : `${done} done`}</span>
      </button>
      {open && !empty ? <WeekDetail week={week} /> : null}
    </div>
  );
}

function WeekDetail({ week }: { week: DeliveryWeek }) {
  const highlights = weekHighlights(week);
  const groups = doneByGroup(week);
  return (
    <div className="space-y-3 px-4 pb-3 pl-[42px]" data-delivery-week-detail>
      {highlights.length ? (
        <ul className="space-y-0.5">
          {highlights.map((i) => (
            <ItemLine key={i.id} item={i} />
          ))}
        </ul>
      ) : null}
      {groups.map((g) => (
        <DoneGroup key={g.group ?? "none"} group={g.group} items={g.items} />
      ))}
    </div>
  );
}

function DoneGroup({ group, items }: { group: string | null; items: DeliveryItem[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST_IN_GROUP);
  return (
    <div>
      <p className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
        <span className="min-w-0 truncate" title={group ?? "Other work"}>
          {group ?? "Other work"}
        </span>
        <span className="shrink-0">{items.length} done</span>
      </p>
      <ul className="mt-1 space-y-0.5">
        {shown.map((i) => (
          <ItemLine key={i.id} item={i} quiet />
        ))}
      </ul>
      {items.length > FIRST_IN_GROUP ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="app-button app-button-hyperlink mt-0.5 text-xs">
          {all ? "Show less" : `+${items.length - FIRST_IN_GROUP} more`}
        </button>
      ) : null}
    </div>
  );
}

/** One item on one line: icon, title (full title on hover), who, day. */
function ItemLine({ item, quiet }: { item: DeliveryItem; quiet?: boolean }) {
  const Icon = KIND_ICON[item.kind];
  const day = new Date(item.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  const tip = [DELIVERY_KIND_LABEL[item.kind], item.title, item.detail, item.group, item.people.join(", ")].filter(Boolean).join(" · ");
  const body = (
    <>
      <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", KIND_TONE[item.kind] ?? "text-[var(--text-4)]")} />
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", quiet ? "text-[var(--text-2)]" : "text-[var(--text-1)]")}>
        {item.title}
        {!quiet && item.detail ? <span className="text-[var(--text-4)]"> · {item.detail}</span> : null}
      </span>
      {item.people.length ? <span className="hidden shrink-0 text-[11px] text-[var(--text-4)] sm:inline">{item.people[0]}</span> : null}
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-4)]" style={MONO}>
        {day}
      </span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} title={tip} className="group flex items-center gap-2 rounded-[4px] py-0.5 hover:text-[var(--brand-700)]">
          {body}
        </Link>
      ) : (
        <div title={tip} className="flex items-center gap-2 py-0.5">
          {body}
        </div>
      )}
    </li>
  );
}

function NowPanel({ state, slug }: { state: DeliveryState; slug: string }) {
  const now = new Date();
  const inProgress = splitLongOverdue(state.inProgress, now);
  const upNext = splitLongOverdue(state.upNext, now);
  const longOverdue = inProgress.longOverdue.length + upNext.longOverdue.length;
  const r = state.nextRelease;
  const pct = r ? Math.round((r.done / Math.max(1, r.total)) * 100) : 0;
  return (
    <aside className="flex flex-col gap-4 border-t border-[var(--border-1)] p-4 lg:border-t-0" aria-label="Where things stand">
      {r ? (
        <div className="rounded-[8px] border border-[var(--border-2)] p-3">
          <NowHeading>Next release</NowHeading>
          <p className="mt-1 truncate text-sm font-medium text-[var(--text-1)]" title={r.label}>
            {r.label}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]" aria-hidden>
            <div className="h-full bg-[var(--brand-600)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 flex justify-between text-xs text-[var(--text-3)]">
            <span>
              {r.done} of {r.total} done
            </span>
            {r.endDate ? <span>due {shortDay(new Date(r.endDate))}</span> : null}
          </p>
        </div>
      ) : null}

      {state.waitingOnClient.length > 0 ? (
        <NowList title="Waiting on the client" tone="warning">
          {state.waitingOnClient.slice(0, NOW_ITEMS).map((w) => (
            <NowLine key={w.id} href={w.href} title={w.title} meta={w.need || null} />
          ))}
        </NowList>
      ) : null}

      <NowList title="In progress" empty="Nothing in progress.">
        {inProgress.current.slice(0, NOW_ITEMS).map((o) => (
          <NowLine key={o.id} href={`/app/portal/${slug}/tasks?task=${o.id}`} title={o.title} task={o} />
        ))}
      </NowList>

      <NowList title="Up next" empty="Nothing queued in To do.">
        {upNext.current.slice(0, NOW_ITEMS).map((o) => (
          <NowLine key={o.id} href={`/app/portal/${slug}/tasks?task=${o.id}`} title={o.title} task={o} />
        ))}
      </NowList>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Link href={`/app/portal/${slug}/tasks`} className="app-button app-button-hyperlink">
          Open the board
        </Link>
        {longOverdue ? (
          <Link
            href={`/app/portal/${slug}/tasks`}
            className="text-[var(--text-4)] hover:text-[var(--text-2)]"
            title={`Open tasks more than ${LONG_OVERDUE_DAYS} days past their due date: probably worth closing or re-dating.`}
            data-delivery-long-overdue
          >
            {longOverdue} long overdue
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

/** One task or ask on one line, with who and when (late in red) on the right. */
function NowLine({
  href,
  title,
  meta,
  task,
}: {
  href: string | null;
  title: string;
  meta?: string | null;
  task?: { people: string[]; dueDate: string | null };
}) {
  const due = task ? dueWords(task.dueDate, new Date()) : null;
  return (
    <li className="flex items-baseline gap-2 text-[13px]">
      {href ? (
        <Link href={href} className="min-w-0 flex-1 truncate text-[var(--text-1)] hover:text-[var(--brand-700)]" title={[title, meta].filter(Boolean).join(" · ")}>
          {title}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[var(--text-1)]" title={[title, meta].filter(Boolean).join(" · ")}>
          {title}
        </span>
      )}
      {task?.people.length ? <span className="shrink-0 text-[11px] text-[var(--text-4)]">{task.people[0]}</span> : null}
      {due ? (
        <span className={cn("shrink-0 whitespace-nowrap text-[11px]", due.late ? "font-medium text-red-700" : "text-[var(--text-4)]")}>{due.text}</span>
      ) : null}
    </li>
  );
}

function NowHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
      {children}
    </h3>
  );
}

function NowList({ title, empty, tone, children }: { title: string; empty?: string; tone?: "warning"; children: React.ReactNode[] }) {
  return (
    <div>
      <NowHeading>
        {tone === "warning" ? <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--warning-500)] align-middle" /> : null}
        {title}
      </NowHeading>
      {children.length ? <ul className="mt-1.5 space-y-1">{children}</ul> : <p className="mt-1.5 text-sm text-[var(--text-4)]">{empty}</p>}
    </div>
  );
}
