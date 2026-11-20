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
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { getDeliveryTimeline } from "@/lib/api";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { WeeklyUpdateDialog } from "@/components/clients/weekly-update-dialog";
import {
  DELIVERY_KIND_LABEL,
  shortDay,
  weekSummary,
  type DeliveryItem,
  type DeliveryKind,
  type DeliveryState,
  type DeliveryWeek,
} from "@/lib/client-delivery-timeline";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Weeks shown before "Show earlier weeks". */
const FIRST_WEEKS = 3;
/** Items shown per week before "Show all". */
const FIRST_ITEMS = 6;

const KIND_ICON: Record<DeliveryKind, ComponentType<{ className?: string }>> = {
  done: CheckCircleIcon,
  started: PlayIcon,
  shipped: RocketLaunchIcon,
  request: InboxArrowDownIcon,
  meeting: ChatBubbleLeftRightIcon,
  incident: ExclamationTriangleIcon,
  document: DocumentTextIcon,
  blocked: NoSymbolIcon,
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
        <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 border-[var(--border-1)] lg:border-r">
            {weeks.map((w) => (
              <WeekBlock key={w.start} week={w} />
            ))}
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

function WeekBlock({ week }: { week: DeliveryWeek }) {
  const [all, setAll] = useState(false);
  const items = all ? week.items : week.items.slice(0, FIRST_ITEMS);
  const start = new Date(`${week.start}T00:00:00Z`);
  return (
    <div className="border-b border-[var(--border-1)] last:border-b-0" data-delivery-week>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pb-1.5 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-2)]" style={MONO}>
          {week.label}
          {week.label.startsWith("Week of") ? "" : <span className="font-normal text-[var(--text-4)]">{` · ${shortDay(start)}`}</span>}
        </span>
        <span className="text-xs text-[var(--text-3)]">{weekSummary(week.counts)}</span>
      </div>
      {week.items.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-[var(--text-4)]">A quiet week: nothing finished, released or raised.</p>
      ) : (
        <ul className="pb-2">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
          {week.items.length > FIRST_ITEMS ? (
            <li className="px-4 pt-1">
              <button type="button" onClick={() => setAll((v) => !v)} className="app-button app-button-hyperlink text-xs">
                {all ? "Show less" : `Show all ${week.items.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: DeliveryItem }) {
  const Icon = KIND_ICON[item.kind];
  const day = new Date(item.at);
  const body = (
    <>
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", KIND_TONE[item.kind] ?? "text-[var(--text-4)]")} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
            {DELIVERY_KIND_LABEL[item.kind]}
          </span>
          <span className="text-sm text-[var(--text-1)] group-hover:text-[var(--brand-700)]">{item.title}</span>
        </span>
        {item.detail || item.group || item.people.length ? (
          <span className="mt-0.5 block text-xs text-[var(--text-3)]">
            {[item.group, item.detail, item.people.length ? item.people.join(", ") : null].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-4)]" style={MONO}>
        {day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
      </span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className="group flex items-start gap-3 px-4 py-1.5 transition-colors hover:bg-[var(--surface-1)]">
          {body}
        </Link>
      ) : (
        <div className="flex items-start gap-3 px-4 py-1.5">{body}</div>
      )}
    </li>
  );
}

function NowPanel({ state, slug }: { state: DeliveryState; slug: string }) {
  return (
    <aside className="flex flex-col gap-4 border-t border-[var(--border-1)] p-4 lg:border-t-0" aria-label="Where things stand">
      {state.waitingOnClient.length > 0 ? (
        <NowList title="Waiting on the client" tone="warning">
          {state.waitingOnClient.slice(0, 5).map((w) => (
            <li key={w.id} className="text-sm">
              {w.href ? (
                <Link href={w.href} className="text-[var(--text-1)] hover:text-[var(--brand-700)]">
                  {w.title}
                </Link>
              ) : (
                <span className="text-[var(--text-1)]">{w.title}</span>
              )}
              {w.need ? <span className="block text-xs text-[var(--text-3)]">{w.need}</span> : null}
            </li>
          ))}
        </NowList>
      ) : null}

      {state.nextRelease ? (
        <div>
          <NowHeading>Next release</NowHeading>
          <p className="mt-1.5 text-sm text-[var(--text-1)]">{state.nextRelease.label}</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]" aria-hidden>
            <div
              className="h-full bg-[var(--brand-600)] transition-[width] duration-700"
              style={{ width: `${Math.round((state.nextRelease.done / Math.max(1, state.nextRelease.total)) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-3)]">
            {state.nextRelease.done} of {state.nextRelease.total} done
            {state.nextRelease.endDate ? ` · due ${shortDay(new Date(state.nextRelease.endDate))}` : ""}
          </p>
        </div>
      ) : null}

      <NowList title="In progress" empty="Nothing in progress.">
        {state.inProgress.slice(0, 6).map((o) => (
          <li key={o.id} className="text-sm">
            <Link href={`/app/portal/${slug}/tasks?task=${o.id}`} className="text-[var(--text-1)] hover:text-[var(--brand-700)]">
              {o.title}
            </Link>
            {o.people.length ? <span className="ml-1.5 text-xs text-[var(--text-3)]">{o.people.join(", ")}</span> : null}
          </li>
        ))}
      </NowList>

      <NowList title="Up next" empty="Nothing queued in To do.">
        {state.upNext.slice(0, 5).map((o) => (
          <li key={o.id} className="text-sm">
            <Link href={`/app/portal/${slug}/tasks?task=${o.id}`} className="text-[var(--text-1)] hover:text-[var(--brand-700)]">
              {o.title}
            </Link>
            {o.dueDate ? <span className="ml-1.5 text-xs text-[var(--text-3)]">due {shortDay(new Date(o.dueDate))}</span> : null}
          </li>
        ))}
      </NowList>

      <Link href={`/app/portal/${slug}/tasks`} className="app-button app-button-hyperlink self-start text-xs">
        Open the board
      </Link>
    </aside>
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
      {children.length ? <ul className="mt-1.5 space-y-1.5">{children}</ul> : <p className="mt-1.5 text-sm text-[var(--text-4)]">{empty}</p>}
    </div>
  );
}
