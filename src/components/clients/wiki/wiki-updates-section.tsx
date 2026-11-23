"use client";

/**
 * Updates: the weekly updates the team sent the client, as sent, and what happened each week
 * (CLAUDE.md §147; rules in src/lib/wiki-updates.ts). The same page on both sides: the team sees
 * exactly the client's copy, plus "Write this week's update" and Unpublish.
 *
 * Loaded on its own, never inside the wiki (§140).
 */

import { useState } from "react";
import type { ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxArrowDownIcon,
  NoSymbolIcon,
  PlayIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { getWikiUpdates, unpublishWikiUpdateApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { WeeklyUpdateDialog } from "@/components/clients/weekly-update-dialog";
import { WikiPageActions } from "./wiki-page-header";
import { DELIVERY_KIND_LABEL, dueWords, shortDay } from "@/lib/client-delivery-timeline";
import {
  isQuiet,
  weeksWithUpdates,
  type ClientDeliveryItem,
  type ClientDeliveryState,
  type ClientDeliveryWeek,
  type PublishedUpdate,
} from "@/lib/wiki-updates";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Weeks shown before "Show earlier weeks". */
const FIRST_ROWS = 4;
/** Things that happened shown per week before "Show all". */
const FIRST_ITEMS = 6;

const KIND_ICON: Record<ClientDeliveryItem["kind"], ComponentType<{ className?: string }>> = {
  done: CheckCircleIcon,
  started: PlayIcon,
  shipped: RocketLaunchIcon,
  request: InboxArrowDownIcon,
  meeting: ChatBubbleLeftRightIcon,
  incident: ExclamationTriangleIcon,
  document: DocumentTextIcon,
  blocked: NoSymbolIcon,
};

/** Colour only where it means something: an outage, a blocker, a release out of the door. */
const KIND_TONE: Partial<Record<ClientDeliveryItem["kind"], string>> = {
  incident: "text-[var(--danger-500)]",
  blocked: "text-[var(--warning-500)]",
  shipped: "text-[var(--success-500)]",
};

type Target = { slug: string } | { token: string };

export function WikiUpdatesSection({
  target,
  mode,
  clientName,
}: {
  target: Target;
  mode: "internal" | "client";
  clientName: string;
}) {
  const key = ["wiki-updates", "slug" in target ? target.slug : target.token];
  const query = useQuery({ queryKey: key, queryFn: () => getWikiUpdates(target), staleTime: 60_000 });
  const [writing, setWriting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const slug = "slug" in target ? target.slug : null;
  const team = mode === "internal" && slug !== null;
  const v = query.data;

  const rows = v ? weeksWithUpdates(v.weeks, v.published) : [];
  const folded = foldQuiet(rows);
  const visible = showAll ? folded : folded.slice(0, FIRST_ROWS);

  return (
    <div className="space-y-4">
      {team ? (
        <WikiPageActions>
          <button type="button" onClick={() => setWriting(true)} className="app-button app-button-primary app-button-sm">
            <EnvelopeIcon className="h-4 w-4" />
            Write this week&apos;s update
          </button>
        </WikiPageActions>
      ) : null}

      {query.isPending ? (
        <div className="widget-card space-y-2 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : query.isError || !v ? (
        <section className="widget-card px-4 py-6 text-sm text-[var(--text-3)]">
          Couldn&apos;t load the updates just now.{" "}
          <button type="button" onClick={() => void query.refetch()} className="app-button app-button-hyperlink">
            Try again
          </button>
        </section>
      ) : (
        <>
          <NowCard number="01" state={v.state} audience={mode} />
          <section className="widget-card" data-updates-weeks>
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">02</span>
                {" // WEEK BY WEEK"}
              </span>
            </div>
            {visible.map((row) =>
              row.kind === "quiet" ? (
                <QuietRun key={row.starts[0]} starts={row.starts} />
              ) : (
                <WeekRow key={row.start} week={row.week} update={row.update} slug={team ? slug : null} />
              ),
            )}
            {folded.length > FIRST_ROWS ? (
              <div className="border-t border-[var(--border-1)] px-4 py-2.5">
                <button type="button" onClick={() => setShowAll((s) => !s)} className="app-button app-button-hyperlink text-xs">
                  {showAll ? "Show fewer weeks" : `Show ${folded.length - FIRST_ROWS} earlier`}
                </button>
              </div>
            ) : null}
            {v.failed.length > 0 ? (
              <p className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-2)]">
                Couldn&apos;t read {v.failed.join(", ")} just now, so this may be missing some of it.
              </p>
            ) : null}
          </section>
        </>
      )}

      {team && slug ? (
        <WeeklyUpdateDialog open={writing} onClose={() => setWriting(false)} slug={slug} clientName={clientName} />
      ) : null}
    </div>
  );
}

type Row = { start: string; week: ClientDeliveryWeek | null; update: PublishedUpdate | null };
type Folded = ({ kind: "week" } & Row) | { kind: "quiet"; starts: string[] };

/** Runs of two or more quiet weeks fold into one line; the newest week never folds. */
function foldQuiet(rows: Row[]): Folded[] {
  const out: Folded[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ kind: "quiet", starts: run });
    else for (const s of run) {
      const r = rows.find((x) => x.start === s)!;
      out.push({ kind: "week", ...r });
    }
    run = [];
  };
  rows.forEach((r, i) => {
    if (i > 0 && isQuiet(r)) {
      run.push(r.start);
      return;
    }
    flush();
    out.push({ kind: "week", ...r });
  });
  flush();
  return out;
}

function QuietRun({ starts }: { starts: string[] }) {
  const newest = new Date(`${starts[0]}T00:00:00Z`);
  const oldest = new Date(`${starts[starts.length - 1]}T00:00:00Z`);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--border-1)] px-4 py-3 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" style={MONO}>
        {starts.length} quiet weeks
      </span>
      <span className="text-xs text-[var(--text-4)]">
        Weeks of {shortDay(oldest)} to {shortDay(newest)}: nothing finished, released or raised
      </span>
    </div>
  );
}

function WeekRow({ week, update, slug }: { week: ClientDeliveryWeek | null; update: PublishedUpdate | null; slug: string | null }) {
  const start = new Date(`${(week?.start ?? update?.weekStart)!}T00:00:00Z`);
  const label = week?.label ?? `Week of ${shortDay(start)}`;
  return (
    <article className="border-b border-[var(--border-1)] last:border-b-0" data-updates-week>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pb-1.5 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-2)]" style={MONO}>
          {label}
          {label.startsWith("Week of") ? "" : <span className="font-normal text-[var(--text-4)]">{` · ${shortDay(start)}`}</span>}
        </span>
        {week ? <span className="text-xs text-[var(--text-3)]">{week.summary}</span> : null}
      </header>
      {update ? <PublishedBlock update={update} slug={slug} /> : null}
      {week && week.items.length > 0 ? (
        update ? (
          <details className="group px-4 pb-3">
            <summary className="cursor-pointer list-none text-xs text-[var(--text-3)] hover:text-[var(--text-1)]">
              <span className="group-open:hidden">What happened this week ({week.items.length})</span>
              <span className="hidden group-open:inline">Hide what happened</span>
            </summary>
            <ItemList items={week.items} />
          </details>
        ) : (
          <div className="pb-2">
            <ItemList items={week.items} />
          </div>
        )
      ) : !update ? (
        <p className="px-4 pb-3 text-sm text-[var(--text-4)]">A quiet week: nothing finished, released or raised.</p>
      ) : null}
    </article>
  );
}

function PublishedBlock({ update, slug }: { update: PublishedUpdate; slug: string | null }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const unpublish = useMutation({
    mutationFn: () => unpublishWikiUpdateApi(slug!, update.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki-updates", slug] });
      void qc.invalidateQueries({ queryKey: ["client-wiki", slug] });
    },
  });
  const sent = new Date(update.publishedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="mx-4 mb-3 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-[15px] font-medium text-[var(--text-1)]">{update.subject}</h3>
        {slug ? (
          confirming ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-3)]">Take it off their wiki?</span>
              <button type="button" onClick={() => unpublish.mutate()} className="app-button app-button-secondary app-button-xs" disabled={unpublish.isPending}>
                Unpublish
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="app-button app-button-hyperlink text-xs">
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="app-button app-button-hyperlink text-xs">
              Unpublish
            </button>
          )
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
        Sent {sent}
        {update.publishedBy ? ` · ${update.publishedBy}` : ""}
      </p>
      <div className="mt-2.5 whitespace-pre-line break-words text-sm leading-relaxed text-[var(--text-1)]">{update.body}</div>
      {unpublish.isError ? <p className="mt-2 text-xs text-[var(--danger-500)]">{(unpublish.error as Error).message}</p> : null}
    </div>
  );
}

function ItemList({ items }: { items: ClientDeliveryItem[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST_ITEMS);
  return (
    <ul className="pt-1">
      {shown.map((i) => {
        const Icon = KIND_ICON[i.kind];
        return (
          <li key={i.id} className="flex items-start gap-3 px-4 py-1.5">
            <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", KIND_TONE[i.kind] ?? "text-[var(--text-4)]")} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={MONO}>
                  {DELIVERY_KIND_LABEL[i.kind]}
                </span>
                <span className="break-words text-sm text-[var(--text-1)]">{i.title}</span>
              </span>
              {i.detail || i.group ? (
                <span className="mt-0.5 block break-words text-xs text-[var(--text-3)]">{[i.group, i.detail].filter(Boolean).join(" · ")}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-4)]" style={MONO}>
              {new Date(i.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
            </span>
          </li>
        );
      })}
      {items.length > FIRST_ITEMS ? (
        <li className="px-4 pt-1">
          <button type="button" onClick={() => setAll((a) => !a)} className="app-button app-button-hyperlink text-xs">
            {all ? "Show less" : `Show all ${items.length}`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function NowCard({ number, state, audience }: { number: string; state: ClientDeliveryState; audience: "internal" | "client" }) {
  const nothing = !state.waitingOnClient.length && !state.nextRelease && !state.inProgress.length && !state.upNext.length;
  return (
    <section className="widget-card" data-updates-now>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {" // WHERE THINGS STAND"}
        </span>
      </div>
      {nothing ? (
        <p className="px-4 py-4 text-sm text-[var(--text-4)]">Nothing in progress or queued right now.</p>
      ) : (
        <div className="grid gap-5 p-4 md:grid-cols-2 xl:grid-cols-4">
          <NowList title={audience === "client" ? "Waiting on you" : "Waiting on the client"} tone="warning" empty="Nothing.">
            {state.waitingOnClient.slice(0, 5).map((w) => (
              <li key={w.id} className="text-sm">
                <span className="text-[var(--text-1)]">{w.title}</span>
                {w.need ? <span className="block text-xs text-[var(--text-3)]">{w.need}</span> : null}
              </li>
            ))}
          </NowList>
          <div>
            <NowHeading>Next release</NowHeading>
            {state.nextRelease ? (
              <>
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
              </>
            ) : (
              <p className="mt-1.5 text-sm text-[var(--text-4)]">No release planned yet.</p>
            )}
          </div>
          <NowList title="In progress" empty="Nothing in progress.">
            {state.inProgress.slice(0, 6).map((o) => (
              <li key={o.id} className="text-sm">
                <span className="text-[var(--text-1)]">{o.title}</span>
                <Due dueDate={o.dueDate} />
              </li>
            ))}
          </NowList>
          <NowList title="Up next" empty="Nothing queued yet.">
            {state.upNext.slice(0, 5).map((o) => (
              <li key={o.id} className="text-sm">
                <span className="text-[var(--text-1)]">{o.title}</span>
                <Due dueDate={o.dueDate} />
              </li>
            ))}
          </NowList>
        </div>
      )}
    </section>
  );
}

function Due({ dueDate }: { dueDate: string | null }) {
  const due = dueWords(dueDate, new Date());
  if (!due) return null;
  return <span className={cn("ml-1.5 whitespace-nowrap text-xs", due.late ? "font-medium text-red-700" : "text-[var(--text-3)]")}>{due.text}</span>;
}

function NowHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
      {children}
    </h3>
  );
}

function NowList({ title, empty, tone, children }: { title: string; empty: string; tone?: "warning"; children: React.ReactNode[] }) {
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
