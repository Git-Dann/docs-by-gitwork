"use client";

/**
 * The top of Foundry HQ: "what needs me now", as a few big figures with a small graphic
 * each. Every figure is a link to where you deal with it.
 *
 * Nothing here fetches anything new. Each tile reads a query another card on the page
 * already makes (same React Query key, so it's a cache hit): your task attention (On your
 * desk), the standup roster (Daily roll-up), Care's queue summaries, Pulse's stats and the
 * calendar. A tile only appears for someone who can see its source, so the band never
 * shows a figure the card below it would refuse to show.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { VideoCameraIcon } from "@heroicons/react/24/solid";
import {
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  LifebuoyIcon,
  MegaphoneIcon,
  SignalIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useTaskAttention, useRollupRoster, useMyDay } from "@/hooks/use-tasks";
import { useClientQueueSummaries } from "@/hooks/use-support";
import { usePulseStats } from "@/hooks/use-pulse";
import { getCalendarEvents } from "@/lib/api";
import { nowOrNext, startsIn } from "@/lib/hq-calendar";
import { formatAge } from "@/components/care/care-constants";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { BigFigure, MONO, SplitBar } from "@/components/dashboard/tile-parts";

export type TodayBandAccess = {
  tasks: boolean;
  /** The viewer's own AM/PM standup (developers). */
  myStandup?: boolean;
  /** Where "My tasks" points: the desk card on HQ, the task list on the developer view. */
  tasksHref?: string;
  rollup: boolean;
  care: boolean;
  pulse: boolean;
  calendar: boolean;
};

export function HqTodayBand({ access }: { access: TodayBandAccess }) {
  const tiles: ReactNode[] = [];
  if (access.tasks) tiles.push(<TasksTile key="tasks" href={access.tasksHref ?? "#hq-desk"} />);
  if (access.myStandup) tiles.push(<MyStandupTile key="my-standup" />);
  if (access.rollup) tiles.push(<StandupTile key="standup" />);
  if (access.care) tiles.push(<CareTile key="care" />);
  if (access.pulse) tiles.push(<PulseTile key="pulse" />);
  if (access.calendar) tiles.push(<NextMeetingTile key="meeting" />);
  if (tiles.length === 0) return null;
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        tiles.length >= 3 && "lg:grid-cols-3",
        tiles.length === 4 && "xl:grid-cols-4",
        tiles.length >= 5 && "xl:grid-cols-5",
      )}
      data-hq-today
    >
      {tiles}
    </div>
  );
}

/** One figure tile: a mono label, a big number, a small graphic, and the whole thing a link. */
function Tile({
  href,
  label,
  icon: Icon,
  tone = "neutral",
  children,
  external = false,
}: {
  href: string;
  label: ReactNode;
  /** A small outline icon, neutral: it says what the figure is about, never its state. */
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "danger" | "warning" | "success" | "brand";
  children: ReactNode;
  external?: boolean;
}) {
  const className = cn(
    "group relative flex min-h-[112px] min-w-0 flex-col justify-between overflow-hidden rounded-[10px] border bg-[var(--surface-0)] px-4 py-3 transition-colors hover:bg-[var(--surface-1)] focus-visible:bg-[var(--surface-1)]",
    "border-[var(--border-2)]",
    // A straight 3px stroke on the left says which tiles want you. Square corners on that side.
    tone !== "neutral" && "border-l-[3px] rounded-l-[0px]",
    tone === "danger" && "border-l-[var(--danger-500)]",
    tone === "warning" && "border-l-[var(--warning-500)]",
    tone === "success" && "border-l-[var(--success-500)]",
    tone === "brand" && "border-l-[var(--brand-500)]",
  );
  const head = (
    <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]" style={MONO}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
      {label}
      <span aria-hidden className="ml-auto text-[var(--text-4)] transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </p>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className} data-hq-card="today">
      {head}
      {children}
    </a>
  ) : (
    <Link href={href} className={className} data-hq-card="today">
      {head}
      {children}
    </Link>
  );
}

function TileSkeleton() {
  return (
    <div className="flex min-h-[112px] flex-col justify-between rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-2 w-full" />
    </div>
  );
}

function TasksTile({ href }: { href: string }) {
  const q = useTaskAttention({ mine: true });
  if (q.isPending) return <TileSkeleton />;
  const overdue = q.data?.overdueCount ?? 0;
  const dueSoon = q.data?.dueSoonCount ?? 0;
  const doing = q.data?.doingCount ?? 0;
  return (
    <Tile href={href} icon={ClipboardDocumentCheckIcon} label="My tasks" tone={overdue > 0 ? "danger" : "neutral"}>
      <BigFigure value={overdue} unit="overdue" />
      <SplitBar
        parts={[
          { label: "overdue", n: overdue, colour: "var(--danger-500)" },
          { label: "due soon", n: dueSoon, colour: "var(--warning-500)" },
          { label: "doing", n: doing, colour: "var(--brand-500)" },
        ]}
      />
    </Tile>
  );
}

/** Two rings: the outer is the morning standup, the inner the end of day. */
function StandupRing({ am, pm, total }: { am: number; pm: number; total: number }) {
  const ring = (r: number, frac: number, colour: string) => {
    const c = 2 * Math.PI * r;
    return (
      <>
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth="4"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 22 22)"
          className="transition-[stroke-dasharray] duration-700"
        />
      </>
    );
  };
  const f = (n: number) => (total > 0 ? Math.min(1, n / total) : 0);
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="shrink-0">
      {ring(19, f(am), "var(--brand-500)")}
      {ring(12, f(pm), "var(--text-3)")}
    </svg>
  );
}

function StandupTile() {
  const q = useRollupRoster(true);
  if (q.isPending) return <TileSkeleton />;
  const devs = q.data?.devs ?? [];
  const total = devs.length;
  const am = devs.filter((d) => d.amPushedAt).length;
  const pm = devs.filter((d) => d.pmPushedAt).length;
  const waitingAm = total - am;
  return (
    <Tile href="#hq-rollup" icon={MegaphoneIcon} label="Standups today" tone={total > 0 && pm === total ? "success" : "neutral"}>
      <div className="mt-1 flex items-center justify-between gap-3">
        <BigFigure value={am} unit={`of ${total} posted AM`} />
        <StandupRing am={am} pm={pm} total={total} />
      </div>
      <p className="mt-1 flex items-center gap-3 text-[10px] text-[var(--text-4)]" style={MONO}>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-[var(--brand-500)]" />
          AM {am}/{total}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-[var(--text-3)]" />
          PM {pm}/{total}
        </span>
        {waitingAm > 0 ? <span>· {waitingAm} to post</span> : null}
      </p>
    </Tile>
  );
}

function CareTile() {
  const q = useClientQueueSummaries(true);
  if (q.isPending) return <TileSkeleton />;
  const summaries = Object.values(q.data?.summaries ?? {});
  const awaiting = summaries.reduce((n, s) => n + s.awaiting, 0);
  const oldest = summaries
    .map((s) => s.oldestAwaitingAt)
    .filter((d): d is string => !!d)
    .sort()[0];
  return (
    <Tile href="/app/care" icon={LifebuoyIcon} label="Care awaiting reply" tone={awaiting > 0 ? "warning" : "success"}>
      <BigFigure value={awaiting} unit={awaiting === 1 ? "conversation" : "conversations"} />
      <p className="mt-2 truncate text-[10px] text-[var(--text-4)]" style={MONO}>
        {awaiting === 0 ? "ALL REPLIED" : oldest ? `LONGEST WAIT ${formatAge(oldest).toUpperCase()}` : " "}
      </p>
    </Tile>
  );
}

function PulseTile() {
  const q = usePulseStats(true);
  if (q.isPending) return <TileSkeleton />;
  const s = q.data;
  const tiers = s?.healthTiers ?? { green: 0, amber: 0, red: 0 };
  const critical = s?.totalCriticalGaps ?? 0;
  return (
    <Tile href="/app/pulse" icon={SignalIcon} label="Pulse health" tone={critical > 0 ? "danger" : "neutral"}>
      <BigFigure value={s?.avgHealthScore ?? null} unit={critical > 0 ? `avg · ${critical} critical` : "avg health"} />
      <SplitBar
        parts={[
          { label: "healthy", n: tiers.green, colour: "var(--success-500)" },
          { label: "needs work", n: tiers.amber, colour: "var(--warning-500)" },
          { label: "at risk", n: tiers.red, colour: "var(--danger-500)" },
        ]}
      />
    </Tile>
  );
}

function NextMeetingTile() {
  const q = useQuery({
    queryKey: ["integrations", "calendar"],
    queryFn: getCalendarEvents,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  if (q.isPending) return <TileSkeleton />;
  const events = q.data?.connected ? q.data.events ?? [] : [];
  const next = nowOrNext(events, new Date());
  if (!next) {
    return (
      <Tile href="https://calendar.google.com" external icon={CalendarDaysIcon} label="Next meeting">
        <p className="mt-1 text-sm text-[var(--text-2)]">{q.data?.connected ? "Nothing booked" : "Calendar not connected"}</p>
        <p className="mt-2 text-[10px] text-[var(--text-4)]" style={MONO}>
          NEXT 14 DAYS
        </p>
      </Tile>
    );
  }
  const href = next.event.meetLink ?? "https://calendar.google.com";
  return (
    <Tile href={href} external icon={CalendarDaysIcon} label={next.live ? "In a meeting now" : "Next meeting"} tone={next.live ? "brand" : "neutral"}>
      <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--text-1)]" title={next.event.summary}>
        {next.event.summary}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] uppercase text-[var(--text-3)]" style={MONO}>
        <StatusDot tone="brand" motion={next.live ? "pulse" : "none"} size="xs" />
        {next.live ? "NOW" : startsIn(next.event.start, new Date())}
        {next.event.meetLink ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[var(--brand-700)]">
            <VideoCameraIcon className="h-3 w-3" />
            JOIN
          </span>
        ) : null}
      </p>
    </Tile>
  );
}

/** Your own standup today: AM and PM, posted or not. Links to My Day, where you post it. */
function MyStandupTile() {
  const q = useMyDay();
  if (q.isPending) return <TileSkeleton />;
  const am = q.data?.update?.amPushedAt ?? null;
  const pm = q.data?.update?.pmPushedAt ?? null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const next = !am ? "Post your morning standup" : !pm ? "Post your end-of-day update" : "Both posted today";
  return (
    <Tile href="#dev-myday" icon={SunIcon} label="My standup" tone={am && pm ? "success" : !am ? "warning" : "brand"}>
      <p className="mt-1 text-sm font-semibold text-[var(--text-1)]">{next}</p>
      <p className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-3)]" style={MONO}>
        <span className="inline-flex items-center gap-1">
          <StatusDot tone={am ? "success" : "neutral"} size="xs" />
          AM {am ? time(am) : "—"}
        </span>
        <span className="inline-flex items-center gap-1">
          <StatusDot tone={pm ? "success" : "neutral"} size="xs" />
          PM {pm ? time(pm) : "—"}
        </span>
      </p>
    </Tile>
  );
}
