"use client";

/**
 * The client's Board (src/server/wiki-board.ts): their product cards on the team's task board,
 * in their own columns, grouped by release, as on the planning site Big Wedge used before.
 *
 * One component for both audiences, so they can never disagree about where a card is:
 *   - "client": the wiki link. Full control of their cards (Dan, Nov 2026): add, edit every
 *     field, move anywhere including Live, delete, add screenshots, leave feedback, approve or
 *     ask for changes. The one thing they can't do is choose who works on a card.
 *   - "team":   the internal wiki. The same, plus reply to feedback, choose what the client sees,
 *     preview it, and restore a card that was deleted.
 *
 * Every column scrolls inside one frame with its header (.widget-card is overflow: hidden, so a
 * wide child without its own scroller would be cut off, §45.2). On a phone the columns become a
 * column picker over one stacked column.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems, Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUturnLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  FunnelIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { cn } from "@/lib/format";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { Segmented } from "@/components/ui/segmented";
import { apiFetch } from "@/lib/api";
import { WikiBoardTimeline } from "@/components/clients/wiki/wiki-board-timeline";
import { WikiBoardSchedule } from "@/components/clients/wiki/wiki-board-schedule";
import { useToast } from "@/components/ui/toast";
import { CardProgressChip, ItemTypeChip, SignOffChip, TierChip } from "@/components/tasks/product-card-parts";
import { ITEM_TYPE_LABELS } from "@/lib/tasks/product-cards";
import { groupByRelease, laneKindsToRead, laneLeftOut, mergeBoardCards } from "@/lib/wiki-board-layout";
import { readBoardPrefs, writeBoardPrefs, type BoardView, type TableGroupBy, type TableSort } from "@/lib/wiki-board-table";
import { WikiBoardTable } from "@/components/clients/wiki/wiki-board-table";
import { WikiBoardCardDialog } from "@/components/clients/wiki/wiki-board-card-dialog";
import {
  clientMayActOn,
} from "@/lib/wiki-board";
import {
  moveBoardCardApi,
  restoreBoardCardApi,
  useBoardRefresh,
  useSetWikiBoardShowAllTasks,
  type BoardTarget, fetchDoneLane } from "@/hooks/use-wiki-board";
import type { WikiBoardCard, WikiBoardDeletedCard, WikiBoardLane, WikiBoardSection } from "@/types/wiki-board";
import { WikiPageActions } from "./wiki-page-header";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Cards only, everything, or (team only, previewing) exactly what the client sees on their wiki. */
type ShowMode = "cards" | "all" | "client";

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function rangeLabel(start: string | null, end: string | null): string | null {
  const a = formatDay(start);
  const b = formatDay(end);
  if (a && b) return `${a} – ${b}`;
  return a ?? b;
}

/** Every card on the board, flat: moves and filters work on this, lanes are rebuilt from it. */
function flatten(section: WikiBoardSection): WikiBoardCard[] {
  return section.lanes.flatMap((l) => l.groups.flatMap((g) => g.cards));
}

interface ViewGroup {
  key: string;
  label: string;
  range: string | null;
  cards: WikiBoardCard[];
}

/** The shared grouping (src/lib/wiki-board-layout.ts), with each release's dates as a label. */
function groupsFor(cards: WikiBoardCard[], section: WikiBoardSection): ViewGroup[] {
  return groupByRelease(cards, section.releases).map((g) => ({
    key: g.releaseId ?? "none",
    label: g.label,
    range: rangeLabel(g.startDate, g.endDate),
    cards: g.cards,
  }));
}

export function WikiBoardSectionView({
  section,
  target,
  audience,
  clientName,
}: {
  section: WikiBoardSection;
  target: BoardTarget;
  audience: "client" | "team";
  /** The client's name, for the team's "Previewing <name>'s view" strip. */
  clientName?: string;
  /** No longer used: the team adds cards here now. Kept so an old caller still compiles. */
  tasksHref?: string;
}) {
  const toast = useToast();
  const refresh = useBoardRefresh(target);
  // The client's board is server-rendered: dnd-kit's own counter numbers its accessibility ids
  // differently on the server and in the browser, which fails hydration. A React id is the same
  // on both.
  const dndId = useId();
  // A Done column arrives with its newest cards only (`BOARD_LIMITS.doneLaneCards`). Its older
  // cards are read when someone asks: "Show older" on the column, or opening the Table or the
  // Schedule, which need every card to count and to log what happened (§126.5).
  const [older, setOlder] = useState<Record<string, WikiBoardCard[]>>({});
  const [wanted, setWanted] = useState<string[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [cards, setCards] = useState<WikiBoardCard[]>(() => flatten(section));
  // A refetch or router.refresh brings the server's board back: it replaces the local copy, with
  // the older cards already read kept beside it until they are read again.
  useEffect(() => setCards(mergeBoardCards(flatten(section), Object.values(older).flat())), [section, older]);
  const seeOther = audience === "team" || section.showAllTasks;
  useEffect(() => {
    const lanes = section.lanes.filter((l) => wanted.includes(l.key) && laneKindsToRead(l, seeOther).length > 0);
    if (!lanes.length) return;
    let stale = false;
    setLoadingOlder(true);
    void Promise.all(
      lanes.map(async (l) => {
        const reads = await Promise.all(laneKindsToRead(l, seeOther).map((kind) => fetchDoneLane(target, l.key, kind)));
        return [l.key, reads.flatMap((r) => r.cards)] as const;
      }),
    )
      .then((pairs) => {
        if (!stale) setOlder((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      })
      .catch((err) => {
        if (!stale) toast.error("Couldn't load the older done cards", err instanceof Error ? err.message : "Please try again.");
      })
      .finally(() => {
        if (!stale) setLoadingOlder(false);
      });
    return () => {
      stale = true;
    };
    // `target` is stable per page; `toast` is a stable context value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, wanted, seeOther]);
  const wantOlder = (keys: string[]) => setWanted((prev) => [...new Set([...prev, ...keys])]);

  const hasCards = cards.some((c) => c.isCard);
  const hasOther = cards.some((c) => !c.isCard);
  const [show, setShow] = useState<"cards" | "all">(hasCards ? "cards" : "all");
  // The team looking at exactly what the client sees on their wiki.
  const [previewing, setPreviewing] = useState(false);
  const mode: ShowMode = audience === "team" && previewing ? "client" : hasCards ? show : "all";
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [release, setRelease] = useState("");
  const [area, setArea] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // lane key, or "" for the toolbar
  const [phoneLane, setPhoneLane] = useState<string>(section.lanes[0]?.key ?? "");
  // The same cards four ways: columns (the Board), rows (the Table), releases over time (the
  // Timeline), or by week (the Schedule). The view, the table's grouping and its sort are this
  // viewer's own, remembered per board in their browser.
  const boardKey = target.mode === "internal" ? `team:${target.slug}` : `link:${target.token.slice(0, 16)}`;
  const [view, setViewState] = useState<BoardView>("board");
  const [groupBy, setGroupByState] = useState<TableGroupBy | null>(null);
  const [tableSort, setTableSortState] = useState<TableSort | null>(null);
  // Read after mount: the server render has no storage, and a different first paint would fail
  // hydration on the client's server-rendered page.
  useEffect(() => {
    const prefs = readBoardPrefs(boardKey);
    if (prefs.view) setViewState(prefs.view);
    if (prefs.groupBy) setGroupByState(prefs.groupBy);
    if (prefs.sort !== undefined) setTableSortState(prefs.sort ?? null);
  }, [boardKey]);
  const remember = (next: { view?: BoardView; groupBy?: TableGroupBy | null; sort?: TableSort | null }) =>
    writeBoardPrefs(boardKey, {
      view: next.view ?? view,
      groupBy: (next.groupBy !== undefined ? next.groupBy : groupBy) ?? undefined,
      sort: next.sort !== undefined ? next.sort : tableSort,
    });
  const setView = (v: BoardView) => {
    setViewState(v);
    remember({ view: v });
  };
  const setGroupBy = (g: TableGroupBy) => {
    setGroupByState(g);
    remember({ groupBy: g });
  };
  const setTableSort = (s: TableSort | null) => {
    setTableSortState(s);
    remember({ sort: s });
  };

  // The Table and the Schedule count and log every card, so opening one reads every Done column's older cards.
  useEffect(() => {
    if (view === "table" || view === "schedule") wantOlder(section.lanes.filter((l) => l.stage === "DONE").map((l) => l.key));
  }, [view, section.lanes]);
  const countOther = !(mode === "cards" || (mode === "client" && !section.showAllTasks));
  const leftOut = (lane: WikiBoardLane) => laneLeftOut(lane, countOther, Boolean(older[lane.key]));

  const visible = useMemo(() => {
    let list =
      mode === "cards"
        ? cards.filter((c) => c.isCard)
        : mode === "client"
          ? // What the client's copy carries: their cards, plus dev tasks only while the team shows them.
            cards.filter((c) => clientMayActOn(c) || section.showAllTasks)
          : cards;
    if (type) list = list.filter((c) => (type === "dev" ? !c.isCard : c.itemType === type));
    if (release) list = list.filter((c) => (release === "none" ? !c.release : c.release?.id === release));
    if (area) list = list.filter((c) => c.area === area);
    if (q.trim()) list = fuzzySearch(list, q, (c) => [c.title, c.area, c.release?.label]);
    return list;
  }, [cards, mode, type, release, area, q, section.showAllTasks]);

  const filtered = Boolean(q.trim() || type || release || area);
  const addLanes = section.lanes.filter((l) => l.canAdd);
  // The client adds on their link; the team adds from the internal wiki (its own card routes).
  const canAdd = addLanes.length > 0 && (audience === "client" || target.mode === "internal");
  // A card may be edited, or deleted, by whoever may act on it here.
  const actable = (c: WikiBoardCard) => audience === "team" || clientMayActOn(c);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  async function move(card: WikiBoardCard, lane: WikiBoardLane) {
    if (card.laneKey === lane.key) return;
    if (audience === "client" && !clientMayActOn(card)) {
      toast.error("Can't move that card", "This is one of Gitwork's own tasks, shown so you can see where it is.");
      return;
    }
    const inLane = cards.filter((c) => c.laneKey === lane.key);
    const orderKey = (inLane.length ? Math.max(...inLane.map((c) => c.orderKey)) : 0) + 1;
    const before = cards;
    setCards((list) =>
      list.map((c) => (c.id === card.id ? { ...c, laneKey: lane.key, status: lane.stage, orderKey } : c)),
    );
    try {
      await moveBoardCardApi(target, card, lane, orderKey);
      refresh();
    } catch (err) {
      setCards(before);
      toast.error("Couldn't move the card", err instanceof Error ? err.message : "Please try again.");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const card = cards.find((c) => c.id === e.active.id);
    const lane = section.lanes.find((l) => l.key === e.over?.id);
    if (card && lane) void move(card, lane);
  }

  /** Put a card the server just returned in place: replace it, or add it if it's new. */
  function place(card: WikiBoardCard) {
    setCards((list) => (list.some((c) => c.id === card.id) ? list.map((c) => (c.id === card.id ? card : c)) : [...list, card]));
  }

  const open = openId ? cards.find((c) => c.id === openId) ?? null : null;
  const waiting = cards.filter((c) => c.isCard && c.status === "IN_REVIEW" && !c.signOff).length;
  const approved = cards.filter((c) => c.signOff === "approved").length;
  const filterCount = [type, release, area].filter(Boolean).length + (mode === "all" && hasCards && hasOther ? 1 : 0);
  const readOnly = (c: WikiBoardCard) => (audience === "client" || mode === "client") && !clientMayActOn(c);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          <span className="mx-1.5 text-[var(--text-4)]">{"//"}</span>
          Board
        </span>
        <span className="widget-header__status">
          {waiting ? `${waiting} waiting for review · ` : ""}
          {approved} approved
        </span>
      </div>
      <div className="widget-body space-y-3">
        {/* One toolbar: the view on the left, finding and adding on the right. On a phone the
            view takes the first line and the rest the second; nothing is cut off. */}
        <div className="flex flex-wrap items-center gap-2" data-board-toolbar>
          <Segmented
            label="View"
            className="h-9 shrink-0"
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Board" },
              { value: "table", label: "Table" },
              { value: "timeline", label: "Timeline" },
              { value: "schedule", label: "Schedule" },
            ]}
          />
          <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards"
              className="app-input h-9 min-w-0 flex-1 text-[16px] sm:w-[220px] sm:flex-none sm:text-sm"
            />
            <BoardFilters
              count={filterCount}
              section={section}
              type={type}
              setType={setType}
              release={release}
              setRelease={setRelease}
              area={area}
              setArea={setArea}
              show={hasCards && hasOther && mode !== "client" ? show : null}
              setShow={setShow}
              devOption={mode === "all" && hasOther}
            />
            {audience === "team" && target.mode === "internal" ? (
              <ClientViewMenu
                slug={target.slug}
                on={section.showAllTasks}
                onChanged={refresh}
                previewing={mode === "client"}
                onPreview={setPreviewing}
              />
            ) : null}
            {/* The page's main action sits in the shared header (§138). */}
            {canAdd ? (
              <WikiPageActions>
                <button
                  type="button"
                  className="app-button app-button-primary app-button-sm inline-flex items-center gap-1.5"
                  onClick={() => setAdding("")}
                  data-board-add
                >
                  <PlusIcon className="h-4 w-4" />
                  Add card
                </button>
              </WikiPageActions>
            ) : null}
          </div>
        </div>
        {mode === "client" ? (
          <div
            className="flex items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--brand-50)] px-3 py-1.5 text-[12px] text-[var(--text-2)]"
            data-board-preview
          >
            <EyeIcon className="h-4 w-4 shrink-0 text-[var(--brand-600)]" />
            <span className="min-w-0 flex-1 truncate" title={`Previewing ${clientName ?? "the client"}'s view`}>
              Previewing {clientName ? `${clientName}’s` : "the client’s"} view
            </span>
            <button type="button" className="shrink-0 font-medium text-[var(--brand-600)] hover:underline" onClick={() => setPreviewing(false)}>
              Exit
            </button>
          </div>
        ) : null}
        {view === "timeline" ? (
          <WikiBoardTimeline
            cards={visible}
            releases={section.releases}
            readOnly={readOnly}
            onOpen={setOpenId}
            onEditDates={
              // The team, on its own wiki, can move a release's dates (the releases route checks access).
              audience === "team" && target.mode === "internal"
                ? async (r, dates) => {
                    await apiFetch(`/api/releases/${encodeURIComponent(r.id)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(dates),
                    });
                    toast.success("Dates saved", r.label);
                    refresh();
                  }
                : undefined
            }
          />
        ) : null}
        {view === "schedule" ? (
          <WikiBoardSchedule
            cards={visible}
            releases={section.releases}
            keyDates={section.keyDates ?? []}
            loadingOlder={loadingOlder}
            target={target}
            readOnly={readOnly}
            // A date is a card edit: the client's own cards on their link, any card the team may
            // edit on the internal wiki (never a dev task's fields, as in the Table). Not while the
            // team previews the client's view.
            canEditCard={(c) => mode !== "client" && clientMayActOn(c) && (audience === "client" || target.mode === "internal")}
            canEditKeyDates={mode !== "client" && (audience === "client" || target.mode === "internal")}
            canDeleteKeyDates={mode !== "client" && (audience === "client" ? target.mode === "public" : target.mode === "internal")}
            onOpen={setOpenId}
            onPlace={place}
            refresh={refresh}
          />
        ) : null}
        {view === "table" ? (
          <WikiBoardTable
            cards={visible}
            allCards={cards}
            section={section}
            target={target}
            asClient={audience === "client" || mode === "client"}
            addLanes={addLanes}
            canAdd={canAdd && mode !== "client"}
            canDelete={mode !== "client" && (audience === "client" ? target.mode === "public" : target.mode === "internal")}
            hiddenCount={section.lanes.reduce((n, l) => n + leftOut(l), 0)}
            loadingOlder={loadingOlder}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            sort={tableSort}
            onSort={setTableSort}
            onOpen={setOpenId}
            onMove={(card, lane) => void move(card, lane)}
            setCards={setCards}
            onPlace={place}
            onRemoved={(ids) => setCards((list) => list.filter((c) => !ids.includes(c.id)))}
            refresh={refresh}
          />
        ) : null}

        <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
          {/* Desktop and tablet: every column side by side, in one scroller with its header. */}
          <div className={cn("hidden overflow-x-auto pb-2", view === "board" && "sm:block")} data-board-scroller>
            <div className="flex items-start gap-3">
              {section.lanes.map((lane) => (
                <Lane
                  key={lane.key}
                  lane={lane}
                  groups={groupsFor(
                    visible.filter((c) => c.laneKey === lane.key),
                    section,
                  )}
                  hidden={leftOut(lane)}
                  loadingOlder={loadingOlder && wanted.includes(lane.key)}
                  onShowOlder={() => wantOlder([lane.key])}
                  canAdd={canAdd && lane.canAdd}
                  onAdd={() => setAdding(lane.key)}
                  onOpen={setOpenId}
                  audience={audience}
                  asClient={mode === "client"}
                />
              ))}
            </div>
          </div>
        </DndContext>

        {/* Phone: one column at a time, picked from a list, with its cards stacked. */}
        <div className={cn("space-y-3 sm:hidden", view !== "board" && "hidden")}>
          <select
            className="app-select h-10 w-full text-[16px]"
            aria-label="Column"
            value={phoneLane}
            onChange={(e) => setPhoneLane(e.target.value)}
          >
            {section.lanes.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label} ({visible.filter((c) => c.laneKey === l.key).length})
              </option>
            ))}
          </select>
          {(() => {
            const lane = section.lanes.find((l) => l.key === phoneLane);
            if (!lane) return null;
            const groups = groupsFor(visible.filter((c) => c.laneKey === lane.key), section);
            const more = (
              <ShowOlder
                count={leftOut(lane)}
                loading={loadingOlder && wanted.includes(lane.key)}
                onClick={() => wantOlder([lane.key])}
              />
            );
            return groups.length ? (
              <>
                {groups.map((g) => (
                  <div key={g.key} className="space-y-2">
                    <GroupHeading group={g} />
                    {g.cards.map((c) => (
                      <CardFace
                        key={c.id}
                        card={c}
                        onOpen={() => setOpenId(c.id)}
                        readOnly={audience === "client" && !clientMayActOn(c)}
                      />
                    ))}
                  </div>
                ))}
                {more}
              </>
            ) : (
              <>
                <p className="py-6 text-center text-[13px] text-[var(--text-4)]">{filtered ? "Nothing matches." : "No cards here."}</p>
                {more}
              </>
            );
          })()}
        </div>

        {audience === "team" && target.mode === "internal" && section.deleted?.length ? (
          <DeletedCards slug={target.slug} cards={section.deleted} total={section.deletedTotal ?? section.deleted.length} onRestored={(card) => { place(card); refresh(); }} />
        ) : null}
      </div>

      {open ? (
        <WikiBoardCardDialog
          key={open.id}
          mode="card"
          card={open}
          cards={cards}
          section={section}
          target={target}
          audience={audience}
          previewing={mode === "client"}
          addLanes={addLanes}
          canDelete={actable(open) && (audience === "client" ? target.mode === "public" : target.mode === "internal")}
          onMove={(card, lane) => void move(card, lane)}
          onOpenCard={setOpenId}
          onSaved={(card) => {
            place(card);
            refresh();
          }}
          onAdded={place}
          onDeleted={(card) => {
            setCards((list) => list.filter((c) => c.id !== card.id));
            setOpenId(null);
            toast.success("Card deleted", audience === "client" ? "Gitwork has been told, and can put it back if needed." : "It's in the deleted list below the board.");
            refresh();
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      {adding !== null && canAdd ? (
        <WikiBoardCardDialog
          mode="add"
          initialLaneKey={adding || addLanes[0]?.key || ""}
          cards={cards}
          section={section}
          target={target}
          audience={audience}
          previewing={false}
          addLanes={addLanes}
          canDelete={false}
          onMove={() => undefined}
          onOpenCard={setOpenId}
          onSaved={place}
          onAdded={(card) => {
            place(card);
            setAdding(null);
            toast.success("Card added", audience === "client" ? "Gitwork has been told." : undefined);
            refresh();
          }}
          onDeleted={() => undefined}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </section>
  );
}

/** Type, release and area (and, where there are both, cards or everything), in one anchored popover. */
function BoardFilters({
  count,
  section,
  type,
  setType,
  release,
  setRelease,
  area,
  setArea,
  show,
  setShow,
  devOption,
}: {
  count: number;
  section: WikiBoardSection;
  type: string;
  setType: (v: string) => void;
  release: string;
  setRelease: (v: string) => void;
  area: string;
  setArea: (v: string) => void;
  /** Null when there's no choice to make (only cards, or only dev tasks, or previewing). */
  show: "cards" | "all" | null;
  setShow: (v: "cards" | "all") => void;
  devOption: boolean;
}) {
  return (
    <Popover className="relative shrink-0">
      <PopoverButton
        className="app-button app-button-secondary app-button-sm h-9"
        aria-label={count ? `Filters, ${count} on` : "Filters"}
        data-board-filters
      >
        <FunnelIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Filters</span>
        {count ? (
          <span className="rounded-[4px] bg-[var(--brand-600)] px-1.5 text-[10px] font-semibold text-white" style={MONO}>
            {count}
          </span>
        ) : null}
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 6 }}
        className={cn(menuPanel, "w-[280px] max-w-[calc(100vw-2rem)] space-y-3 p-3")}
        data-board-filters-panel
      >
        {show ? (
          <div>
            <span className="widget-data-label block text-[var(--text-4)]">Show</span>
            <Segmented
              label="Show"
              className="mt-1"
              value={show}
              onChange={setShow}
              options={[
                { value: "cards", label: "Cards" },
                { value: "all", label: "Everything" },
              ]}
            />
          </div>
        ) : null}
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Type</span>
          <select className="app-select mt-1 h-9 w-full text-[16px] sm:text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {(["feature", "subitem", "bug", "feedback"] as const).map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABELS[t]}
              </option>
            ))}
            {devOption ? <option value="dev">Dev tasks</option> : null}
          </select>
        </label>
        {section.releases.length ? (
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Release</span>
            <select className="app-select mt-1 h-9 w-full text-[16px] sm:text-sm" value={release} onChange={(e) => setRelease(e.target.value)}>
              <option value="">All releases</option>
              {section.releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
              <option value="none">No release</option>
            </select>
          </label>
        ) : null}
        {section.areas.length ? (
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Area</span>
            <select className="app-select mt-1 h-9 w-full text-[16px] sm:text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">All areas</option>
              {section.areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {type || release || area ? (
          <button
            type="button"
            className="text-[12px] font-medium text-[var(--brand-600)] hover:underline"
            onClick={() => {
              setType("");
              setRelease("");
              setArea("");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </PopoverPanel>
    </Popover>
  );
}

/**
 * The team's client-view menu: what the client sees on their wiki (the same setting as before),
 * and a preview of exactly that. It changes the CLIENT's wiki only, which is why the preview sits
 * right beside it: a setting whose effect the team can't see on their own screen read as broken.
 */
function ClientViewMenu({
  slug,
  on,
  onChanged,
  previewing,
  onPreview,
}: {
  slug: string;
  on: boolean;
  onChanged: () => void;
  previewing: boolean;
  onPreview: (on: boolean) => void;
}) {
  const set = useSetWikiBoardShowAllTasks(slug);
  const toast = useToast();
  const choose = (all: boolean) => {
    if (all === on) return;
    set.mutate(all, {
      onSuccess: onChanged,
      onError: (err) => toast.error("Couldn't change that", err instanceof Error ? err.message : "Please try again."),
    });
  };
  return (
    <Menu as="div" className="relative shrink-0">
      <MenuButton className="app-button app-button-secondary app-button-sm h-9 w-9 px-0" aria-label="Client view" title="Client view" data-board-client-menu>
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </MenuButton>
      <MenuItems anchor="bottom end" className={cn(menuPanel, "w-[280px] max-w-[calc(100vw-2rem)]")}>
        <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={MONO}>
          Client sees
        </p>
        {[
          { all: false, label: "Their cards only", hint: "Your dev tasks stay hidden from them." },
          { all: true, label: "Cards and dev task titles", hint: "Titles only. They can't open, move or comment on them." },
        ].map((o) => (
          <MenuItem key={String(o.all)}>
            <button type="button" className={cn(menuItem, "items-start gap-2")} onClick={() => choose(o.all)}>
              <span className="mt-0.5 h-3.5 w-3.5 shrink-0">
                {o.all === on ? <CheckIcon className="h-3.5 w-3.5 text-[var(--brand-600)]" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[var(--text-1)]">{o.label}</span>
                <span className="block text-[11px] text-[var(--text-4)]">{o.hint}</span>
              </span>
            </button>
          </MenuItem>
        ))}
        <div className="my-1 border-t border-[var(--border-2)]" />
        <MenuItem>
          <button type="button" className={cn(menuItem, "gap-2")} onClick={() => onPreview(!previewing)}>
            <EyeIcon className="h-4 w-4 shrink-0" />
            {previewing ? "Exit preview" : "Preview as client"}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

/** Cards deleted from the board, newest first, with Restore. Team only, never on the client's page. */
function DeletedCards({
  slug,
  cards,
  total,
  onRestored,
}: {
  slug: string;
  cards: WikiBoardDeletedCard[];
  /** Every deleted card; `cards` may hold only the newest. */
  total: number;
  onRestored: (card: WikiBoardCard) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <details className="rounded-[8px] border border-[var(--border-2)]" data-board-deleted>
      <summary className="cursor-pointer px-3 py-2 text-[12px] text-[var(--text-2)]">
        Deleted from the board <span className="text-[var(--text-4)]" style={MONO}>({total})</span>
      </summary>
      {total > cards.length ? (
        <p className="border-t border-[var(--border-2)] px-3 py-2 text-[12px] text-[var(--text-3)]">
          Showing the newest {cards.length.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}.
        </p>
      ) : null}
      <ul className="max-h-[360px] divide-y divide-[var(--border-2)] overflow-y-auto border-t border-[var(--border-2)]">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-[var(--text-1)]" title={c.title}>
                {c.title}
              </span>
              <span className="block text-[11px] text-[var(--text-4)]" style={MONO}>
                {c.deletedBy} · {formatDay(c.deletedAt)}
              </span>
            </span>
            <button
              type="button"
              className="app-button app-button-secondary app-button-sm shrink-0"
              disabled={busy === c.id}
              onClick={async () => {
                setBusy(c.id);
                try {
                  onRestored(await restoreBoardCardApi(slug, c.id));
                  toast.success("Card restored");
                } catch (err) {
                  toast.error("Couldn't restore it", err instanceof Error ? err.message : "Please try again.");
                } finally {
                  setBusy(null);
                }
              }}
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" /> Restore
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * A Done column's older cards, on request. The board carries a Done column's newest cards; this
 * reads the rest of that column (§126.5). Nothing when nothing is left out.
 */
function ShowOlder({ count, loading, onClick }: { count: number; loading: boolean; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="app-button app-button-secondary app-button-sm w-full justify-center"
      data-board-show-older
    >
      {loading ? "Loading older cards…" : `Show ${count} older`}
    </button>
  );
}

function Lane({
  lane,
  groups,
  hidden,
  loadingOlder = false,
  onShowOlder,
  canAdd,
  onAdd,
  onOpen,
  audience,
  asClient = false,
}: {
  lane: WikiBoardLane;
  groups: ViewGroup[];
  /** Older cards this Done column leaves out for this view. */
  hidden: number;
  loadingOlder?: boolean;
  onShowOlder?: () => void;
  canAdd: boolean;
  /** The team previewing the client's view: dev tasks render read-only, as the client sees them. */
  asClient?: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
  audience: "client" | "team";
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.key });
  const count = groups.reduce((n, g) => n + g.cards.length, 0);
  const done = lane.stage === "DONE";
  return (
    <div
      ref={setNodeRef}
      data-board-lane={lane.key}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-[10px] border bg-[var(--surface-1)] transition-colors",
        isOver ? "border-[var(--brand-500)]" : "border-[var(--border-2)]",
      )}
    >
      <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--border-2)] px-3">
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-1)]" title={lane.label}>
          {lane.label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-[4px] bg-[var(--surface-0)] px-1.5 text-[11px] text-[var(--text-3)]" style={MONO}>
            {count}
          </span>
          {canAdd ? (
            <button
              type="button"
              aria-label={`Add a card to ${lane.label}`}
              title={`Add a card to ${lane.label}`}
              className="rounded-[4px] p-0.5 text-[var(--text-3)] hover:bg-[var(--surface-0)] hover:text-[var(--text-1)]"
              onClick={onAdd}
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="max-h-[70vh] min-h-[120px] space-y-3 overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            <GroupHeading group={g} />
            {g.cards.map((c) =>
              // The team's own dev tasks are shown to the client read-only: not draggable, not openable.
              (audience === "client" || asClient) && !clientMayActOn(c) ? (
                <CardFace key={c.id} card={c} onOpen={() => onOpen(c.id)} readOnly />
              ) : (
                <DraggableCard key={c.id} card={c} onOpen={() => onOpen(c.id)} />
              ),
            )}
          </div>
        ))}
        {count === 0 ? <p className="py-6 text-center text-[12px] text-[var(--text-4)]">No cards</p> : null}
        {done && onShowOlder ? <ShowOlder count={hidden} loading={loadingOlder} onClick={onShowOlder} /> : null}
      </div>
    </div>
  );
}

function GroupHeading({ group }: { group: ViewGroup }) {
  return (
    <div className="px-1 pt-1">
      <p className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]" style={MONO} title={group.label}>
        {group.label}
      </p>
      {group.range ? (
        <p className="text-[10px] text-[var(--text-4)]" style={MONO}>
          {group.range}
        </p>
      ) : null}
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: WikiBoardCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && "relative z-10 opacity-80")}
      {...attributes}
      {...listeners}
    >
      <CardFace card={card} onOpen={onOpen} />
    </div>
  );
}

function CardFace({ card, onOpen, readOnly = false }: { card: WikiBoardCard; onOpen: () => void; readOnly?: boolean }) {
  const Tag = readOnly ? "div" : "button";
  return (
    <Tag
      {...(readOnly ? { title: "Gitwork's own task, shown so you can see where it is" } : { type: "button" as const, onClick: onOpen })}
      data-board-card={card.id}
      data-board-readonly={readOnly ? "" : undefined}
      className={cn(
        // A coloured stroke down the left says what the card is at a glance. It's a straight line:
        // the left corners are square so it never bends round a rounded corner (Dan, Nov 2026).
        "block w-full rounded-l-none rounded-r-[8px] border border-l-[3px] border-[var(--border-2)] bg-[var(--surface-0)] p-2.5 text-left shadow-[var(--shadow-xs)] transition-colors hover:border-y-[var(--border-1)] hover:border-r-[var(--border-1)]",
        card.itemType === "bug" ? "border-l-red-500" : card.isCard ? "border-l-[var(--brand-500)]" : "border-l-[var(--border-1)]",
      )}
    >
      <span className="flex flex-wrap items-center gap-1">
        {card.isCard ? <ItemTypeChip itemType={card.itemType} /> : (
          <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]" style={MONO}>
            Dev task
          </span>
        )}
        <TierChip tier={card.tier} />
        <SignOffChip signOff={card.signOff} />
      </span>
      <span className="mt-1.5 block text-[13px] font-medium leading-snug text-[var(--text-1)]">{card.title}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-3)]">
        {card.area ? <span className="truncate">{card.area}</span> : null}
        {card.priority === "HIGH" ? <span className="text-red-700">High</span> : null}
        <CardProgressChip progress={card.progress} />
        {card.feedbackCount ? (
          <span className="inline-flex items-center gap-0.5" title={`${card.feedbackCount} feedback`}>
            <ChatBubbleLeftEllipsisIcon className="h-3.5 w-3.5" />
            {card.feedbackCount}
          </span>
        ) : null}
        {card.people.length ? <span className="ml-auto truncate">{card.people.join(", ")}</span> : null}
      </span>
    </Tag>
  );
}
