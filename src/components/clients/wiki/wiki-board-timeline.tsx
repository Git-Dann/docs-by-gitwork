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
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Segmented } from "@/components/ui/segmented";
import { ITEM_TYPE_LABELS, isItemType } from "@/lib/tasks/product-cards";
import {
  dayOf,
  initialScrollLeft,
  quarterBands,
  releasePercent,
  spanX,
  timelineColumns,
  timelineGroups,
  timelineRange,
  todayX,
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
}: {
  /** The cards in view, already filtered the way the Board is. */
  cards: WikiBoardCard[];
  releases: WikiBoardRelease[];
  /** A card the viewer can see but not open (the team's dev tasks, for the client). */
  readOnly: (card: WikiBoardCard) => boolean;
  onOpen: (id: string) => void;
}) {
  const [scale, setScale] = useState<TimelineScale>("weeks");
  const today = useMemo(() => dayOf(new Date()), []);
  const groups = useMemo(() => timelineGroups(cards, releases), [cards, releases]);
  const range = useMemo(() => timelineRange(releases, today, scale), [releases, today, scale]);
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

  const scroller = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const scrollToToday = () => {
    const el = scroller.current;
    if (!el || nowX === null) return;
    el.scrollLeft = initialScrollLeft(nowX, el.clientWidth - (rail.current?.offsetWidth ?? 0));
  };
  // On open and whenever the scale changes, put today about a third of the way in.
  useLayoutEffect(scrollToToday, [scale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A section that mounts hidden (another tab first) has no width yet; try once more on show.
    const id = requestAnimationFrame(scrollToToday);
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rows, flattened, so the rail and the calendar render the same list in the same order.
  const rows: Array<{ kind: "release"; key: string; release: WikiBoardRelease | null; count: number } | { kind: "card"; card: WikiBoardCard; release: WikiBoardRelease | null }> = [];
  for (const g of groups) {
    rows.push({ kind: "release", key: keyOf(g.release), release: g.release, count: g.cards.length });
    if (!collapsed.has(keyOf(g.release))) for (const c of g.cards) rows.push({ kind: "card", card: c, release: g.release });
  }

  if (!groups.length) {
    return <p className="py-8 text-center text-[13px] text-[var(--text-4)]">Nothing to show on the timeline.</p>;
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
                <button
                  key={`r-${row.key}`}
                  type="button"
                  onClick={() => toggle(row.key)}
                  aria-expanded={!collapsed.has(row.key)}
                  className="flex w-full items-center gap-1.5 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-left hover:bg-[var(--surface-2)]"
                  style={{ height: ROW_H }}
                  title={row.release?.label ?? "No release"}
                >
                  <ChevronRightIcon
                    className={cn("h-3.5 w-3.5 shrink-0 text-[var(--text-3)] transition-transform motion-reduce:transition-none", !collapsed.has(row.key) && "rotate-90")}
                  />
                  {row.release ? (
                    <span className="hidden shrink-0 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1 text-[9px] uppercase tracking-[0.06em] text-[var(--text-3)] sm:inline" style={MONO}>
                      Release
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-1)]">{row.release?.label ?? "No release"}</span>
                  <span className="shrink-0 text-[10px] text-[var(--text-4)]" style={MONO}>
                    {row.count}
                  </span>
                </button>
              ) : (
                <RailCard key={row.card.id} card={row.card} readOnly={readOnly(row.card)} onOpen={onOpen} />
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
                <ReleaseRow key={`rb-${row.key}`} release={row.release} range={range} scale={scale} />
              ) : (
                <CardRow key={`cb-${row.card.id}`} card={row.card} release={row.release} range={range} scale={scale} readOnly={readOnly(row.card)} onOpen={onOpen} />
              ),
            )}
          </div>
        </div>
      </div>
      <p className="text-[12px] text-[var(--text-4)]">
        Each card runs for its release&rsquo;s dates. Releases that finished over a week ago start folded.
      </p>
    </div>
  );
}

function RailCard({ card, readOnly, onOpen }: { card: WikiBoardCard; readOnly: boolean; onOpen: (id: string) => void }) {
  const t = typeKey(card);
  const label = card.isCard && isItemType(card.itemType) ? ITEM_TYPE_LABELS[card.itemType] : "Dev task";
  const inner = (
    <>
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", RAIL_TONE[t] ?? "text-[var(--text-3)]", card.status === "DONE" && "opacity-60")}>{card.title}</span>
      <span className="hidden shrink-0 text-[9px] uppercase tracking-[0.06em] text-[var(--text-4)] sm:inline" style={MONO}>
        {label}
      </span>
    </>
  );
  const cls = "flex w-full items-center gap-2 border-b border-[var(--border-2)] pl-7 pr-2 text-left";
  return readOnly ? (
    <div className={cls} style={{ height: ROW_H }} title={card.title}>
      {inner}
    </div>
  ) : (
    <button type="button" className={cn(cls, "hover:bg-[var(--surface-1)]")} style={{ height: ROW_H }} title={card.title} onClick={() => onOpen(card.id)}>
      {inner}
    </button>
  );
}

function ReleaseRow({ release, range, scale }: { release: WikiBoardRelease | null; range: { start: number; end: number }; scale: TimelineScale }) {
  const span = release ? spanX(release.startDate, release.endDate, range, scale) : null;
  const pct = release ? releasePercent(release) : null;
  const dates = release ? [shortDate(release.startDate), shortDate(release.endDate)].filter(Boolean).join(" – ") : "";
  return (
    <div className="relative border-b border-[var(--border-2)] bg-[var(--surface-1)]/60" style={{ height: ROW_H }}>
      {span ? (
        <div
          className="absolute top-1/2 flex h-7 -translate-y-1/2 items-center gap-3 overflow-hidden rounded-[6px] bg-[var(--brand-600)] px-2 text-[11px] font-semibold text-[var(--surface-0)]"
          style={{ left: span.x, width: span.width }}
          title={`${release?.label ?? ""}${dates ? ` · ${dates}` : ""}${pct !== null ? ` · ${pct}% done` : ""}`}
          data-timeline-release={release?.id}
        >
          <span className="truncate">{dates}</span>
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
  range,
  scale,
  readOnly,
  onOpen,
}: {
  card: WikiBoardCard;
  release: WikiBoardRelease | null;
  range: { start: number; end: number };
  scale: TimelineScale;
  readOnly: boolean;
  onOpen: (id: string) => void;
}) {
  const span = release ? spanX(release.startDate, release.endDate, range, scale) : null;
  const t = typeKey(card);
  const done = card.status === "DONE";
  const cls = cn(
    "absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-[6px] border px-2 text-[11px]",
    t === "dev" ? DEV_TONE : BAR_TONE[t],
    done && "opacity-55",
  );
  return (
    <div className="relative border-b border-[var(--border-2)]" style={{ height: ROW_H }}>
      {span ? (
        readOnly ? (
          <div className={cls} style={{ left: span.x, width: span.width }} title={card.title}>
            <span className="truncate">{done ? "✓ " : ""}{span.width >= 60 ? card.title : ""}</span>
          </div>
        ) : (
          <button type="button" className={cn(cls, "text-left hover:brightness-95")} style={{ left: span.x, width: span.width }} title={card.title} onClick={() => onOpen(card.id)}>
            <span className="truncate">{done ? "✓ " : ""}{span.width >= 60 ? card.title : ""}</span>
          </button>
        )
      ) : (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-4)]">No dates yet</span>
      )}
    </div>
  );
}
