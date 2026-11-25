"use client";

/**
 * The Board's Timeline: each release as a bar on a calendar, its cards beneath it, like the
 * planning site Big Wedge used before Foundry. Same cards and filters as the Board; clicking a
 * card opens the same detail (feedback, sign-off).
 *
 * One scroller holds the header and every row (.widget-card is overflow: hidden, §45.2), and the
 * name rail sticks to the left while the calendar scrolls under it. The maths is in
 * src/lib/wiki-board-timeline.ts.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDaysIcon, CheckIcon, ChevronRightIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { menuPanel } from "@/components/ui/menu-styles";
import { cn } from "@/lib/format";
import { Segmented } from "@/components/ui/segmented";
import { ITEM_TYPE_LABELS, isItemType } from "@/lib/tasks/product-cards";
import {
  approvedOpenByRelease,
  cardBehind,
  dayOf,
  initialScrollLeft,
  quarterBands,
  releasePercent,
  releaseState,
  spanX,
  timelineCounts,
  timelineColumns,
  timelineGroups,
  timelineRange,
  todayX,
  waitingCount,
  type TimelineScale,
} from "@/lib/wiki-board-timeline";
import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

const MONO = { fontFamily: "var(--font-mono)" } as const;
const HEADER_H = 56;
const ROW_H = 40;

/** The bar and rail tones per card type: the same families as the type chips on the Board. */
export const BAR_TONE: Record<string, string> = {
  feature: "border-blue-200 bg-blue-50 text-blue-700",
  subitem: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]",
  bug: "border-red-200 bg-red-50 text-red-700",
  feedback: "border-amber-200 bg-amber-50 text-amber-700",
};
const RAIL_TONE: Record<string, string> = {
  feature: "text-[var(--text-1)]",
  subitem: "text-[var(--text-2)]",
  bug: "text-red-700",
  feedback: "text-amber-700",
};
export const DEV_TONE = "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]";

function typeKey(c: WikiBoardCard): string {
  return c.isCard && isItemType(c.itemType) ? c.itemType : "dev";
}

function shortDate(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
}

export function WikiBoardTimeline({
  cards,
  releases,
  readOnly,
  onOpen,
  onEditDates,
  searching = false,
}: {
  /** The cards in view, already filtered the way the Board is. */
  cards: WikiBoardCard[];
  releases: WikiBoardRelease[];
  /** A card the viewer can see but not open (the team's dev tasks, for the client). */
  readOnly: (card: WikiBoardCard) => boolean;
  onOpen: (id: string) => void;
  /** The team can move a release's dates from here. Absent for the client. Dates are YYYY-MM-DD. */
  onEditDates?: (release: WikiBoardRelease, dates: { startDate: string | null; endDate: string | null; changelogVersion?: string | null }) => Promise<void>;
  /** A search is on: every release opens, so a match is never hidden inside a folded one. */
  searching?: boolean;
}) {
  const [scale, setScale] = useState<TimelineScale>("weeks");
  const today = useMemo(() => dayOf(new Date()), []);
  // Completed releases are out of the way by default; "Behind only" shows just what's late.
  const [showCompleted, setShowCompleted] = useState(false);
  const [onlyBehind, setOnlyBehind] = useState(false);
  // Approved cards are signed off, so they're out of the way unless asked for.
  const [showApproved, setShowApproved] = useState(false);
  const approvedOpen = useMemo(() => approvedOpenByRelease(cards), [cards]);
  const stateOf = (r: WikiBoardRelease) => releaseState(r, today, approvedOpen.get(r.id) ?? 0);
  const counts = useMemo(() => timelineCounts(cards, releases, today), [cards, releases, today]);
  const groups = useMemo(
    () => timelineGroups(cards, releases, { today, showCompleted, showApproved, onlyBehind }),
    [cards, releases, today, showCompleted, showApproved, onlyBehind],
  );
  // The calendar spans the releases shown, so hiding finished ones brings it closer to today.
  const shownReleases = useMemo(() => groups.flatMap((g) => (g.release ? [g.release] : [])), [groups]);
  const range = useMemo(() => timelineRange(shownReleases, today, scale), [shownReleases, today, scale]);
  const columns = useMemo(() => timelineColumns(range, scale), [range, scale]);
  const quarters = useMemo(() => quarterBands(range, scale), [range, scale]);
  const width = columns.reduce((w, c) => w + c.width, 0);
  const nowX = todayX(today, range, scale);

  // Releases that finished more than a week ago start folded, so the open work is what you see.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(releases.filter((r) => r.endDate && dayOf(r.endDate) < today - 7).map((r) => r.id)),
  );
  const keyOf = (r: WikiBoardRelease | null) => r?.id ?? "none";
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allFolded = groups.length > 0 && groups.every((g) => collapsed.has(keyOf(g.release)));
  // Searching opens every release: a folded release hid "Big Wedge Handicap Calculation" from a
  // search for "handicap" (Dan, Nov 2026). Folding by hand still works while searching.
  useEffect(() => {
    if (searching) setCollapsed(new Set());
  }, [searching]);

  const scroller = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const scrollToToday = () => {
    const el = scroller.current;
    if (!el || nowX === null) return;
    el.scrollLeft = initialScrollLeft(nowX, el.clientWidth - (rail.current?.offsetWidth ?? 0));
  };
  // Open on today: on first show, and whenever the scale or the span of the calendar changes.
  useLayoutEffect(scrollToToday, [scale, range.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasRows = groups.length > 0;
  useEffect(() => {
    // A view that mounts before it has a width (a hidden tab, the board still loading) can't be
    // scrolled yet. Scroll the first time it has one, then stop watching.
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    if (el.clientWidth > 0) scrollToToday();
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        scrollToToday();
        ro.disconnect();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rows, flattened, so the rail and the calendar render the same list in the same order.
  const rows: Array<{ kind: "release"; key: string; release: WikiBoardRelease | null; count: number } | { kind: "card"; card: WikiBoardCard; release: WikiBoardRelease | null }> = [];
  for (const g of groups) {
    rows.push({ kind: "release", key: keyOf(g.release), release: g.release, count: g.cards.length });
    if (!collapsed.has(keyOf(g.release))) for (const c of g.cards) rows.push({ kind: "card", card: c, release: g.release });
  }

  const filters = (
    <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
      {counts.behind ? (
        <button
          type="button"
          aria-pressed={onlyBehind}
          onClick={() => setOnlyBehind((v) => !v)}
          className={cn(
            "app-button app-button-sm h-8 border",
            onlyBehind ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
          )}
          title={onlyBehind ? "Show everything again" : "Show only what's behind schedule"}
          data-timeline-behind-filter
        >
          <ExclamationTriangleIcon className="h-4 w-4" />
          {counts.behind} behind schedule
        </button>
      ) : null}
      <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[6px] border border-[var(--border-2)] px-2.5 text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-1)]">
        <input type="checkbox" checked={showApproved} onChange={(e) => setShowApproved(e.target.checked)} data-timeline-show-approved />
        Show approved{counts.approved ? ` (${counts.approved})` : ""}
      </label>
      <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[6px] border border-[var(--border-2)] px-2.5 text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-1)]">
        <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} data-timeline-show-completed />
        Show completed{counts.completed ? ` (${counts.completed})` : ""}
      </label>
    </div>
  );

  if (!groups.length) {
    return (
      <div className="space-y-3" data-board-timeline>
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
        <p className="py-8 text-center text-[13px] text-[var(--text-4)]">
          {onlyBehind
            ? "Nothing is behind schedule."
            : counts.completed && !showCompleted
              ? "Everything here is complete. Tick Show completed to see it."
              : "Nothing to show on the timeline."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-board-timeline>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Scale"
          className="h-8"
          value={scale}
          onChange={setScale}
          options={[
            { value: "weeks", label: "Weeks" },
            { value: "months", label: "Months" },
          ]}
        />
        <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={scrollToToday} disabled={nowX === null}>
          Today
        </button>
        <button
          type="button"
          className="app-button app-button-secondary app-button-sm h-8"
          onClick={() => setCollapsed(allFolded ? new Set() : new Set(groups.map((g) => keyOf(g.release))))}
        >
          {allFolded ? "Expand all" : "Collapse all"}
        </button>
        {filters}
      </div>

      <div ref={scroller} className="overflow-x-auto rounded-[8px] border border-[var(--border-2)]" data-board-timeline-scroller>
        <div className="flex min-w-max">
          {/* Name rail: sticks to the left while the calendar scrolls under it. */}
          <div ref={rail} className="sticky left-0 z-20 w-[128px] shrink-0 border-r border-[var(--border-2)] bg-[var(--surface-0)] shadow-[-8px_0_0_0_var(--surface-0)] sm:w-[300px]">
            <div className="flex items-end border-b border-[var(--border-2)] bg-[var(--surface-1)] px-3 pb-2" style={{ height: HEADER_H }}>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={MONO}>
                Item
              </span>
            </div>
            {rows.map((row) =>
              row.kind === "release" ? (
                <div
                  key={`r-${row.key}`}
                  className="group/rel flex w-full items-center border-b border-[var(--border-2)] bg-[var(--surface-1)] pr-1 hover:bg-[var(--surface-2)]"
                  style={{ height: ROW_H }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(row.key)}
                    aria-expanded={!collapsed.has(row.key)}
                    className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left"
                    title={row.release?.label ?? "No release"}
                  >
                    <ChevronRightIcon
                      className={cn("h-3.5 w-3.5 shrink-0 text-[var(--text-3)] transition-transform motion-reduce:transition-none", !collapsed.has(row.key) && "rotate-90")}
                    />
                    {row.release ? <ReleaseChip state={stateOf(row.release)} /> : null}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-1)]">{row.release?.label ?? "No release"}</span>
                    <span className="shrink-0 text-[10px] text-[var(--text-4)]" style={MONO}>
                      {row.count}
                    </span>
                  </button>
                  {row.release && onEditDates ? <EditDates release={row.release} onSave={onEditDates} /> : null}
                </div>
              ) : (
                <RailCard key={row.card.id} card={row.card} behind={cardBehind(row.card, row.release, today)} readOnly={readOnly(row.card)} onOpen={onOpen} />
              ),
            )}
          </div>

          {/* Calendar. */}
          <div className="relative" style={{ width }}>
            <div className="relative z-10 border-b border-[var(--border-2)] bg-[var(--surface-1)]" style={{ height: HEADER_H }}>
              {quarters.map((q) => (
                <div
                  key={`q-${q.day}`}
                  className="absolute top-0 flex h-6 items-center justify-center overflow-hidden border-l border-[var(--border-2)] text-[11px] font-semibold text-[var(--text-2)]"
                  style={{ left: q.x, width: q.width }}
                >
                  <span className="truncate px-1">{q.label}</span>
                </div>
              ))}
              {columns.map((c) => (
                <div
                  key={`c-${c.day}`}
                  className="absolute bottom-0 flex h-8 items-center overflow-hidden border-l border-t border-[var(--border-2)] px-1.5 text-[10px] text-[var(--text-3)]"
                  style={{ left: c.x, width: c.width, ...MONO }}
                >
                  <span className="truncate">{c.label}</span>
                </div>
              ))}
            </div>

            {/* Column lines and today, under the rows. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: HEADER_H }} aria-hidden>
              {columns.map((c) => (
                <div key={`l-${c.day}`} className="absolute inset-y-0 border-l border-[var(--border-2)] opacity-60" style={{ left: c.x }} />
              ))}
            </div>
            {nowX !== null ? (
              <div className="pointer-events-none absolute bottom-0 z-[5]" style={{ left: nowX, top: HEADER_H - 6 }} data-timeline-today aria-hidden>
                <div className="absolute -left-[5px] top-0 h-3 w-3 rounded-full border-2 border-[var(--brand-600)] bg-[var(--surface-0)]" />
                <div className="absolute left-0 top-3 bottom-0 w-[2px] -translate-x-1/2 bg-[var(--brand-600)]" />
              </div>
            ) : null}

            {rows.map((row) =>
              row.kind === "release" ? (
                <ReleaseRow
                  key={`rb-${row.key}`}
                  release={row.release}
                  state={row.release ? stateOf(row.release) : "open"}
                  waiting={row.release ? waitingCount(row.release, approvedOpen.get(row.release.id) ?? 0) : 0}
                  range={range}
                  scale={scale}
                />
              ) : (
                <CardRow
                  key={`cb-${row.card.id}`}
                  card={row.card}
                  release={row.release}
                  behind={cardBehind(row.card, row.release, today)}
                  range={range}
                  scale={scale}
                  readOnly={readOnly(row.card)}
                  onOpen={onOpen}
                />
              ),
            )}
          </div>
        </div>
      </div>
      <p className="text-[12px] text-[var(--text-4)]">
        Each card runs for its release&rsquo;s dates. A red release has passed its end date with
        cards still waiting (approved cards don&rsquo;t count).{onEditDates ? " Move its dates with the calendar beside its name." : ""} A card is
        flagged only when its own due date has passed.
      </p>
    </div>
  );
}

function RailCard({ card, behind, readOnly, onOpen }: { card: WikiBoardCard; behind: boolean; readOnly: boolean; onOpen: (id: string) => void }) {
  const t = typeKey(card);
  const label = card.isCard && isItemType(card.itemType) ? ITEM_TYPE_LABELS[card.itemType] : "Dev task";
  const inner = (
    <>
      {behind ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" title="Behind schedule" aria-label="Behind schedule" /> : null}
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", RAIL_TONE[t] ?? "text-[var(--text-3)]", card.status === "DONE" && "opacity-60")}>{card.title}</span>
      {card.signOff ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border px-1 text-[9px] uppercase tracking-[0.06em]",
            card.signOff === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700",
          )}
          style={MONO}
          data-timeline-sign-off={card.signOff}
        >
          {card.signOff === "approved" ? <CheckIcon className="h-2.5 w-2.5" /> : null}
          {card.signOff === "approved" ? "Approved" : "Changes"}
        </span>
      ) : (
        <span className="hidden shrink-0 text-[9px] uppercase tracking-[0.06em] text-[var(--text-4)] sm:inline" style={MONO}>
          {label}
        </span>
      )}
    </>
  );
  const cls = "flex w-full items-center gap-2 border-b border-[var(--border-2)] pl-7 pr-2 text-left";
  const tip = [card.title, behind ? "Behind schedule" : null, card.signOff === "approved" ? "Approved" : card.signOff ? "Changes needed" : null]
    .filter(Boolean)
    .join(" · ");
  return readOnly ? (
    <div className={cls} style={{ height: ROW_H }} title={tip}>
      {inner}
    </div>
  ) : (
    <button type="button" className={cn(cls, "hover:bg-[var(--surface-1)]")} style={{ height: ROW_H }} title={tip} onClick={() => onOpen(card.id)}>
      {inner}
    </button>
  );
}

function ReleaseRow({
  release,
  state,
  waiting,
  range,
  scale,
}: {
  release: WikiBoardRelease | null;
  state: ReturnType<typeof releaseState>;
  /** Cards still waiting: not done and not approved. */
  waiting: number;
  range: { start: number; end: number };
  scale: TimelineScale;
}) {
  const span = release ? spanX(release.startDate, release.endDate, range, scale) : null;
  const pct = release ? releasePercent(release) : null;
  const dates = release ? [shortDate(release.startDate), shortDate(release.endDate)].filter(Boolean).join(" – ") : "";
  const status = state === "behind" ? `Behind · ${waiting} waiting` : state === "complete" ? "Complete" : null;
  return (
    <div className="relative border-b border-[var(--border-2)] bg-[var(--surface-1)]/60" style={{ height: ROW_H }}>
      {span ? (
        <div
          className={cn(
            "absolute top-1/2 flex h-7 -translate-y-1/2 items-center gap-3 overflow-hidden rounded-[6px] px-2 text-[11px] font-semibold text-white",
            state === "behind" ? "bg-red-600" : state === "complete" ? "bg-emerald-600" : "bg-[var(--brand-600)]",
          )}
          style={{ left: span.x, width: span.width }}
          title={`${release?.label ?? ""}${dates ? ` · ${dates}` : ""}${pct !== null ? ` · ${pct}% done` : ""}${status ? ` · ${status}` : ""}`}
          data-timeline-release={release?.id}
          data-timeline-release-state={state}
        >
          {state === "behind" ? <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" /> : state === "complete" ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
          <span className="truncate">{status ? `${status} · ${dates}` : dates}</span>
          {pct !== null ? <span className="ml-auto shrink-0">{pct}%</span> : null}
        </div>
      ) : release ? (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-4)]">No dates yet</span>
      ) : null}
    </div>
  );
}

function CardRow({
  card,
  release,
  behind,
  range,
  scale,
  readOnly,
  onOpen,
}: {
  card: WikiBoardCard;
  release: WikiBoardRelease | null;
  behind: boolean;
  range: { start: number; end: number };
  scale: TimelineScale;
  readOnly: boolean;
  onOpen: (id: string) => void;
}) {
  const span = release ? spanX(release.startDate, release.endDate, range, scale) : null;
  const t = typeKey(card);
  const done = card.status === "DONE";
  const approved = card.signOff === "approved";
  const cls = cn(
    "absolute top-1/2 flex h-6 -translate-y-1/2 items-center gap-1 overflow-hidden rounded-[6px] border px-2 text-[11px]",
    t === "dev" ? DEV_TONE : BAR_TONE[t],
    done && "opacity-55",
  );
  const mark = approved ? (
    <CheckIcon className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Approved" />
  ) : done ? (
    <span aria-hidden>✓</span>
  ) : behind ? (
    <ExclamationTriangleIcon className="h-3 w-3 shrink-0 text-red-600" aria-label="Behind schedule" />
  ) : null;
  const tip = [card.title, behind ? "Behind schedule" : null, approved ? "Approved" : card.signOff ? "Changes needed" : null].filter(Boolean).join(" · ");
  return (
    <div className="relative border-b border-[var(--border-2)]" style={{ height: ROW_H }}>
      {span ? (
        readOnly ? (
          <div className={cls} style={{ left: span.x, width: span.width }} title={tip} data-timeline-card-behind={behind || undefined}>
            {mark}
            <span className="truncate">{span.width >= 60 ? card.title : ""}</span>
          </div>
        ) : (
          <button
            type="button"
            className={cn(cls, "text-left hover:brightness-95")}
            style={{ left: span.x, width: span.width }}
            title={tip}
            onClick={() => onOpen(card.id)}
            data-timeline-card-behind={behind || undefined}
          >
            {mark}
            <span className="truncate">{span.width >= 60 ? card.title : ""}</span>
          </button>
        )
      ) : (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-4)]">No dates yet</span>
      )}
    </div>
  );
}

/** The release's state in the rail: Behind (red), Complete (green), else a plain Release tag. */
function ReleaseChip({ state }: { state: ReturnType<typeof releaseState> }) {
  const tone =
    state === "behind"
      ? "border-red-200 bg-red-50 text-red-700"
      : state === "complete"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)]";
  return (
    <span className={cn("shrink-0 rounded-[4px] border px-1 text-[9px] uppercase tracking-[0.06em]", tone, state === "open" && "hidden sm:inline")} style={MONO} data-timeline-release-chip={state}>
      {state === "behind" ? "Behind" : state === "complete" ? "Done" : "Release"}
    </span>
  );
}

/** YYYY-MM-DD for a date input, from a stored midnight-UTC date. */
function inputDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Move a release's dates from the timeline (the team only). A release that slipped can be given
 * its real dates instead of sitting red.
 */
function EditDates({
  release,
  onSave,
}: {
  release: WikiBoardRelease;
  onSave: (release: WikiBoardRelease, dates: { startDate: string | null; endDate: string | null; changelogVersion?: string | null }) => Promise<void>;
}) {
  return (
    <Popover className="shrink-0">
      <PopoverButton
        className="app-button app-button-tertiary app-button-icon-sm text-[var(--text-3)] opacity-60 group-hover/rel:opacity-100 data-[open]:opacity-100"
        title="Change this release's dates or changelog version"
        aria-label={`Change the dates of ${release.label}`}
        data-timeline-edit-dates
      >
        <CalendarDaysIcon className="h-4 w-4" />
      </PopoverButton>
      <PopoverPanel anchor={{ to: "bottom start", gap: 6 }} className={cn(menuPanel, "w-[260px] p-3")}>
        {({ close }) => <EditDatesForm release={release} onSave={onSave} close={close} />}
      </PopoverPanel>
    </Popover>
  );
}

function EditDatesForm({
  release,
  onSave,
  close,
}: {
  release: WikiBoardRelease;
  onSave: (release: WikiBoardRelease, dates: { startDate: string | null; endDate: string | null; changelogVersion?: string | null }) => Promise<void>;
  close: () => void;
}) {
  const [start, setStart] = useState(inputDate(release.startDate));
  const [end, setEnd] = useState(inputDate(release.endDate));
  const [cv, setCv] = useState(release.changelogVersion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (start && end && end < start) return setError("The end date is before the start.");
    setError(null);
    setSaving(true);
    try {
      await onSave(release, { startDate: start || null, endDate: end || null, changelogVersion: cv.trim() || null });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the dates.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-2.5" data-timeline-dates-form>
      <p className="truncate text-[12px] font-semibold text-[var(--text-1)]" title={release.label}>
        {release.label}
      </p>
      <label className="block">
        <span className="widget-data-label text-[var(--text-4)]">Starts</span>
        <input type="date" className="app-input mt-1 h-9 w-full px-2 text-[16px] sm:text-sm" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="block">
        <span className="widget-data-label text-[var(--text-4)]">Ends</span>
        <input type="date" className="app-input mt-1 h-9 w-full px-2 text-[16px] sm:text-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className="block">
        <span className="widget-data-label text-[var(--text-4)]">Changelog version</span>
        <input
          className="app-input mt-1 h-9 w-full px-2 text-[16px] sm:text-sm"
          value={cv}
          maxLength={40}
          placeholder="e.g. 2.0.4"
          onChange={(e) => setCv(e.target.value)}
        />
        <span className="mt-1 block text-[11px] text-[var(--text-4)]">Shown instead of the release&rsquo;s own number when the client numbers releases by the changelog.</span>
      </label>
      {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={close}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-sm h-8" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save dates"}
        </button>
      </div>
    </div>
  );
}
