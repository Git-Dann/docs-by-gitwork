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
  PencilSquareIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { cn } from "@/lib/format";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { Markdown } from "@/lib/markdown";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { WikiBoardTimeline } from "@/components/clients/wiki/wiki-board-timeline";
import { WikiBoardCalendar } from "@/components/clients/wiki/wiki-board-calendar";
import { useToast } from "@/components/ui/toast";
import { CardProgressChip, ItemTypeChip, PreviousValues, SignOffChip, TierChip } from "@/components/tasks/product-card-parts";
import { ITEM_TYPE_LABELS, TIERS, TIER_LABELS, isItemType } from "@/lib/tasks/product-cards";
import { splitCardDescription, uploadBatches } from "@/lib/wiki-board-edit";
import { safeLaunchpadLink } from "@/lib/launchpad/field-types";
import { groupByRelease } from "@/lib/wiki-board-layout";
import {
  BOARD_EDIT_TYPES,
  BOARD_LIMITS,
  CLIENT_CARD_TYPES,
  clientMayActOn,
  feedbackRefusal,
  type FeedbackKind,
} from "@/lib/wiki-board";
import {
  addBoardCardApi,
  deleteBoardCardApi,
  moveBoardCardApi,
  restoreBoardCardApi,
  updateBoardCardApi,
  uploadBoardImagesApi,
  useBoardFeedback,
  useBoardRefresh,
  useSendBoardFeedback,
  useSetWikiBoardShowAllTasks,
  boardImageUrl,
  type BoardCardForm,
  type BoardTarget,
} from "@/hooks/use-wiki-board";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardDeletedCard, WikiBoardLane, WikiBoardSection } from "@/types/wiki-board";

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
  const [cards, setCards] = useState<WikiBoardCard[]>(() => flatten(section));
  // A refetch or router.refresh brings the server's board back: it replaces the local copy.
  useEffect(() => setCards(flatten(section)), [section]);

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
  // The same cards three ways: columns (the Board), releases over time (the Timeline), or by
  // date (the Calendar).
  const [view, setView] = useState<"board" | "timeline" | "calendar">("board");

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
              { value: "timeline", label: "Timeline" },
              { value: "calendar", label: "Calendar" },
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
            {canAdd ? (
              <button
                type="button"
                className="app-button app-button-primary app-button-sm h-9 shrink-0"
                onClick={() => setAdding("")}
                aria-label="Add card"
                data-board-add
              >
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Add card</span>
              </button>
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
          <WikiBoardTimeline cards={visible} releases={section.releases} readOnly={readOnly} onOpen={setOpenId} />
        ) : null}
        {view === "calendar" ? (
          <WikiBoardCalendar cards={visible} releases={section.releases} readOnly={readOnly} onOpen={setOpenId} />
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
                  hidden={mode === "cards" || (mode === "client" && !section.showAllTasks) ? lane.hidden.cards : lane.hidden.cards + lane.hidden.other}
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
            return groups.length ? (
              groups.map((g) => (
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
              ))
            ) : (
              <p className="py-6 text-center text-[13px] text-[var(--text-4)]">{filtered ? "Nothing matches." : "No cards here."}</p>
            );
          })()}
        </div>

        {audience === "team" && target.mode === "internal" && section.deleted?.length ? (
          <DeletedCards slug={target.slug} cards={section.deleted} total={section.deletedTotal ?? section.deleted.length} onRestored={(card) => { place(card); refresh(); }} />
        ) : null}
      </div>

      {open ? (
        <CardDetail
          card={open}
          cards={cards}
          section={section}
          target={target}
          audience={audience}
          canEdit={actable(open)}
          canDelete={actable(open) && (audience === "client" ? target.mode === "public" : target.mode === "internal")}
          onMove={(lane) => void move(open, lane)}
          onOpenCard={setOpenId}
          onSaved={(card) => {
            place(card);
            refresh();
          }}
          onDeleted={() => {
            setCards((list) => list.filter((c) => c.id !== open.id));
            setOpenId(null);
            toast.success("Card deleted", audience === "client" ? "Gitwork has been told, and can put it back if needed." : "It's in the deleted list below the board.");
            refresh();
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      {adding !== null && canAdd ? (
        <Modal open onClose={() => setAdding(null)} title="Add a card" panelClassName="app-dialog-fixed w-full max-w-2xl">
          <CardForm
            mode="add"
            target={target}
            audience={audience}
            section={section}
            cards={cards}
            lanes={addLanes}
            initial={{ ...EMPTY_FORM, laneKey: adding || addLanes[0]?.key || "" }}
            onCancel={() => setAdding(null)}
            onSaved={(card) => {
              place(card);
              setAdding(null);
              toast.success("Card added", audience === "client" ? "Gitwork has been told." : undefined);
              refresh();
            }}
          />
        </Modal>
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

function Lane({
  lane,
  groups,
  hidden,
  canAdd,
  onAdd,
  onOpen,
  audience,
  asClient = false,
}: {
  lane: WikiBoardLane;
  groups: ViewGroup[];
  hidden: number;
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
        {done && hidden > 0 ? (
          <p className="text-center text-[11px] text-[var(--text-4)]" style={MONO}>
            +{hidden} older
          </p>
        ) : null}
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

function CardDetail({
  card,
  cards,
  section,
  target,
  audience,
  canEdit,
  canDelete,
  onMove,
  onOpenCard,
  onSaved,
  onDeleted,
  onClose,
}: {
  card: WikiBoardCard;
  cards: WikiBoardCard[];
  section: WikiBoardSection;
  target: BoardTarget;
  audience: "client" | "team";
  canEdit: boolean;
  canDelete: boolean;
  onMove: (lane: WikiBoardLane) => void;
  onOpenCard: (id: string) => void;
  onSaved: (card: WikiBoardCard) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const lanes = section.lanes;
  const feedback = useBoardFeedback(target, card.id);
  const send = useSendBoardFeedback(target, card.id);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lane = lanes.find((l) => l.key === card.laneKey);
  // Opening another card (a "depends on" link) starts it fresh, not half-way through an edit.
  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
  }, [card.id]);

  async function submit(kind: FeedbackKind) {
    const refusal = feedbackRefusal(kind, body);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    try {
      await send.mutateAsync({ kind, body });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send. Please try again.");
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteBoardCardApi(target, card.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the card. Please try again.");
      setDeleting(false);
    }
  }

  const title = isItemType(card.itemType) ? ITEM_TYPE_LABELS[card.itemType] : "Task";
  if (editing) {
    return (
      <Modal open onClose={onClose} title={`Edit ${title.toLowerCase()}`} panelClassName="app-dialog-fixed w-full max-w-2xl">
        <CardForm
          mode="edit"
          target={target}
          audience={audience}
          section={section}
          cards={cards}
          lanes={lanes}
          card={card}
          initial={formFromCard(card)}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            onSaved(next);
            setEditing(false);
            // The edit wrote an entry in the thread: show it.
            void feedback.refetch();
          }}
        />
      </Modal>
    );
  }

  const meta = [
    card.release?.label,
    card.area,
    TASK_PRIORITY_LABELS[card.priority as TaskPriority],
    card.estimateHours !== null ? `${card.estimateHours}h estimate` : null,
    card.dueDate ? `Due ${formatDay(card.dueDate)}` : null,
    card.people.join(", "),
  ].filter(Boolean);

  return (
    <Modal open onClose={onClose} title={title} panelClassName="app-dialog-fixed w-full max-w-4xl">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <div>
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <ItemTypeChip itemType={card.itemType} />
                <TierChip tier={card.tier} />
                <SignOffChip signOff={card.signOff} />
                <CardProgressChip progress={card.progress} />
              </span>
              {canEdit ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setEditing(true)} data-board-edit>
                    <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      className="app-button app-button-secondary app-button-sm text-red-700"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Delete card"
                      title="Delete card"
                      data-board-delete
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {confirmDelete ? (
              <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-800" data-board-delete-confirm>
                <p>
                  Delete &ldquo;{card.title}&rdquo;? It comes off the board.{" "}
                  {audience === "client" ? "Gitwork can put it back if you need it." : "You can restore it from the deleted list."}
                  {card.progress ? " Its dev tasks aren’t deleted, just unlinked." : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="app-button app-button-danger app-button-sm" disabled={deleting} onClick={() => void remove()}>
                    {deleting ? "Deleting…" : "Delete card"}
                  </button>
                  <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : null}
            <h2 className="mt-2 text-[18px] font-semibold leading-snug text-[var(--text-1)]">{card.title}</h2>
            <p className="mt-1 text-[12px] text-[var(--text-3)]" style={MONO}>
              {meta.join(" · ")}
            </p>
          </div>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Column</span>
            <select
              className="app-select mt-1 h-9 w-full text-[16px] sm:text-sm"
              value={card.laneKey}
              onChange={(e) => {
                const next = lanes.find((l) => l.key === e.target.value);
                if (next) onMove(next);
              }}
            >
              {lanes.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
            {lane ? null : <span className="text-[12px] text-[var(--text-4)]">This card&apos;s column was removed.</span>}
          </label>
          {card.description ? (
            <div className="text-[14px]">
              <Markdown compact>{card.description}</Markdown>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-4)]">No description.</p>
          )}
          {card.dependsOn.length ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Depends on</p>
              <ul className="mt-1 space-y-1">
                {card.dependsOn.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="text-left text-[13px] font-medium text-[var(--brand-600)] hover:underline" onClick={() => onOpenCard(d.id)}>
                      {d.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {card.images.length ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Images</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {card.images.map((img, i) => (
                  <a
                    key={img}
                    href={boardImageUrl(target, card.id, img, false)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] hover:border-[var(--border-1)]"
                    title="Open the full image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={boardImageUrl(target, card.id, img, true)}
                      alt={`Image ${i + 1} on ${card.title}`}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          {card.stageHistory.length ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Stage history</p>
              <ul className="mt-1 space-y-1">
                {card.stageHistory.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 text-[13px] text-[var(--text-2)]">
                    <span className="w-[88px] shrink-0 tabular-nums text-[var(--text-3)]" style={MONO}>
                      {h.date}
                    </span>
                    <span className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5">{h.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {card.subtasks.length ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Sub-items</p>
              <ul className="mt-1 space-y-1">
                {card.subtasks.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
                    <span className={cn("h-3 w-3 shrink-0 rounded-full border", s.done ? "border-emerald-500 bg-emerald-500" : "border-[var(--border-1)]")} />
                    <span className={cn(s.done && "text-[var(--text-4)] line-through")}>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-col border-t border-[var(--border-2)] md:border-l md:border-t-0">
          <p className="widget-data-label shrink-0 px-4 pt-4 text-[var(--text-4)]">Feedback</p>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {feedback.isLoading ? <p className="text-[13px] text-[var(--text-4)]">Loading…</p> : null}
            {feedback.data?.feedback.length === 0 ? (
              <p className="text-[13px] text-[var(--text-4)]">
                {audience === "client" ? "No feedback yet. Say what you think, approve it, or ask for changes." : "The client hasn’t said anything on this card yet."}
              </p>
            ) : null}
            {feedback.data?.feedback.map((f) =>
              f.kind === "change" ? (
                // A record of an edit, written by the board: one quiet line.
                <div key={f.id} className="text-[12px] text-[var(--text-3)]" data-board-change>
                  <p>
                    <span className="text-[11px] text-[var(--text-4)]" style={MONO}>
                      {formatDay(f.createdAt)} ·{" "}
                    </span>
                    {f.body}
                  </p>
                  <PreviousValues previous={f.previous} />
                </div>
              ) : (
                <div key={f.id} className="text-[13px]">
                  <p className="text-[11px] text-[var(--text-4)]" style={MONO}>
                    {f.side === "team" ? "GITWORK" : "CLIENT"} · {f.authorName} · {formatDay(f.createdAt)}
                  </p>
                  {f.kind !== "comment" ? <SignOffChip signOff={f.kind} className="mt-1" /> : null}
                  {f.body ? <p className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{f.body}</p> : null}
                </div>
              ),
            )}
            {feedback.isError ? <p className="text-[13px] text-red-700">Couldn&apos;t load the feedback.</p> : null}
          </div>
          <div className="shrink-0 space-y-2 border-t border-[var(--border-2)] p-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={BOARD_LIMITS.feedback}
              placeholder={audience === "client" ? "Feedback, or what needs changing…" : "Reply to the client…"}
              aria-label="Feedback"
              className="app-input w-full resize-none px-3 py-2 text-[16px] sm:text-sm"
            />
            {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              {audience === "client" ? (
                <>
                  <button type="button" className="app-button app-button-secondary app-button-sm" disabled={send.isPending} onClick={() => void submit("changes_requested")}>
                    Changes needed
                  </button>
                  <button type="button" className="app-button app-button-secondary app-button-sm" disabled={send.isPending} onClick={() => void submit("approved")}>
                    Approve
                  </button>
                </>
              ) : null}
              <button type="button" className="app-button app-button-primary app-button-sm" disabled={send.isPending} onClick={() => void submit("comment")}>
                {audience === "client" ? "Comment" : "Reply"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const EMPTY_FORM: BoardCardForm = {
  title: "",
  itemType: "feature",
  laneKey: "",
  parentId: null,
  releaseId: null,
  tier: null,
  area: null,
  priority: "MEDIUM",
  estimateHours: null,
  dueDate: null,
  description: "",
  links: [],
  dependsOn: [],
};

/** A card's current fields, as the edit form starts from them. Links come back out of the description. */
function formFromCard(card: WikiBoardCard): BoardCardForm {
  const { body, links } = splitCardDescription(card.description);
  return {
    title: card.title,
    itemType: card.itemType === "bug" || card.itemType === "feedback" ? card.itemType : "feature",
    laneKey: card.laneKey,
    parentId: null,
    releaseId: card.release?.id ?? null,
    tier: card.tier,
    area: card.area,
    priority: card.priority,
    estimateHours: card.estimateHours,
    dueDate: card.dueDate ? card.dueDate.slice(0, 10) : null,
    description: body,
    links,
    dependsOn: card.dependsOn.map((d) => d.id),
  };
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Add a card, or edit one: every field the client's own planning board had, except who works on
 * it. Screenshots are added once the card is saved, against the card's own image route.
 */
function CardForm({
  mode,
  target,
  audience,
  section,
  cards,
  lanes,
  card,
  initial,
  onCancel,
  onSaved,
}: {
  mode: "add" | "edit";
  target: BoardTarget;
  audience: "client" | "team";
  section: WikiBoardSection;
  cards: WikiBoardCard[];
  lanes: WikiBoardLane[];
  card?: WikiBoardCard;
  initial: BoardCardForm;
  onCancel: () => void;
  onSaved: (card: WikiBoardCard) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<BoardCardForm>(initial);
  const [links, setLinks] = useState(initial.links.join("\n"));
  const [estimate, setEstimate] = useState(initial.estimateHours === null ? "" : String(initial.estimateHours));
  const [files, setFiles] = useState<File[]>([]);
  const [depQuery, setDepQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof BoardCardForm>(k: K, v: BoardCardForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const subItem = form.itemType === "subitem";
  // The cards a card may depend on, or a sub-item go under: what this person can see, not this one.
  const mayPick = cards.filter((c) => c.id !== card?.id && (audience === "team" || clientMayActOn(c)));
  const features = mayPick.filter((c) => c.itemType === "feature");
  const depChoices = depQuery.trim() ? fuzzySearch(mayPick, depQuery, (c) => [c.title]) : mayPick;
  const existingImages = card?.images.length ?? 0;
  const types = mode === "add" ? CLIENT_CARD_TYPES : BOARD_EDIT_TYPES;

  async function save() {
    if (!form.title.trim()) return setError("Give the card a title.");
    if (subItem && !form.parentId) return setError("Pick the feature this sub-item belongs to.");
    const list = links.split(/\s+/).map((l) => l.trim()).filter(Boolean);
    const bad = list.find((l) => !safeLaunchpadLink(l));
    if (bad) return setError(`“${bad}” isn't a web link. Links need to start with https://`);
    if (list.length > BOARD_LIMITS.links) return setError(`Up to ${BOARD_LIMITS.links} links.`);
    const est = estimate.trim() === "" ? null : Number(estimate);
    if (est !== null && (!Number.isFinite(est) || est < 0 || est > BOARD_LIMITS.estimateHours)) {
      return setError(`The estimate is a number of hours from 0 to ${BOARD_LIMITS.estimateHours}.`);
    }
    if (existingImages + files.length > BOARD_LIMITS.images) return setError(`A card holds up to ${BOARD_LIMITS.images} images.`);
    const wrong = files.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > BOARD_LIMITS.imageBytes);
    if (wrong) return setError(`“${wrong.name}” isn't a PNG, JPEG, GIF or WebP image under 10 MB.`);
    const next: BoardCardForm = { ...form, title: form.title.trim(), links: list, estimateHours: est };
    setSaving(true);
    setError(null);
    try {
      let saved: WikiBoardCard;
      if (mode === "add") {
        saved = await addBoardCardApi(target, next);
      } else {
        // Only what changed goes up, so the thread records what was really edited.
        const patch: Record<string, unknown> = {};
        for (const k of ["title", "itemType", "releaseId", "tier", "area", "priority", "estimateHours", "dueDate", "description", "links", "dependsOn"] as const) {
          if (JSON.stringify(next[k] ?? null) !== JSON.stringify(initial[k] ?? null)) patch[k] = k === "area" ? next.area?.trim() || null : next[k];
        }
        saved = Object.keys(patch).length ? await updateBoardCardApi(target, card!.id, patch) : card!;
      }
      if (files.length && !subItem) {
        try {
          // nginx refuses a body over 25 MB, so a big selection goes up in several requests.
          for (const batch of uploadBatches(files)) saved = await uploadBoardImagesApi(target, saved.id, batch);
        } catch (err) {
          toast.error("The card is saved, but the images weren't", err instanceof Error ? err.message : "Please try adding them again.");
        }
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the card. Please try again.");
      setSaving(false);
    }
  }

  const field = "app-input mt-1 h-10 w-full text-[16px] sm:text-sm";
  const select = "app-select mt-1 h-10 w-full text-[16px] sm:text-sm";
  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" data-board-card-form>
        <div>
          <span className="widget-data-label block text-[var(--text-4)]">Type</span>
          <Segmented
            label="Type"
            className="mt-1 flex w-full flex-wrap sm:inline-flex sm:w-auto"
            value={form.itemType}
            onChange={(v) => set("itemType", v)}
            options={types.map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] }))}
          />
        </div>
        {subItem ? (
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Feature it belongs to</span>
            <select className={select} value={form.parentId ?? ""} onChange={(e) => set("parentId", e.target.value || null)}>
              <option value="">{features.length ? "Choose a feature card" : "No feature cards yet"}</option>
              {features.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Title</span>
          <input
            className={field}
            value={form.title}
            maxLength={BOARD_LIMITS.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={form.itemType === "bug" ? "What's going wrong?" : "What should it do?"}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mode === "add" ? (
            <label className="block">
              <span className="widget-data-label text-[var(--text-4)]">Column</span>
              <select className={select} value={form.laneKey} onChange={(e) => set("laneKey", e.target.value)}>
                {lanes.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Release</span>
            <select className={select} value={form.releaseId ?? ""} onChange={(e) => set("releaseId", e.target.value || null)}>
              <option value="">No release yet</option>
              {section.releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Tier</span>
            <select className={select} value={form.tier ?? ""} onChange={(e) => set("tier", e.target.value || null)}>
              <option value="">No tier</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Area</span>
            <input
              className={field}
              list="board-areas"
              value={form.area ?? ""}
              maxLength={BOARD_LIMITS.area}
              onChange={(e) => set("area", e.target.value)}
              placeholder="Choose or type a new one"
            />
            <datalist id="board-areas">
              {section.areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Priority</span>
            <select className={select} value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
              {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Estimate (hours)</span>
            <input
              className={field}
              type="number"
              inputMode="decimal"
              min={0}
              max={BOARD_LIMITS.estimateHours}
              step={0.5}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Due date</span>
            <input className={field} type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} />
          </label>
        </div>
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Description</span>
          <textarea
            className="app-input mt-1 w-full resize-y px-3 py-2 text-[16px] sm:text-sm"
            rows={4}
            value={form.description}
            maxLength={BOARD_LIMITS.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Links (one per line)</span>
          <textarea
            className="app-input mt-1 w-full resize-y px-3 py-2 text-[16px] sm:text-sm"
            rows={2}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="https://"
          />
        </label>
        {mayPick.length ? (
          <div>
            <span className="widget-data-label text-[var(--text-4)]">Depends on</span>
            {form.dependsOn.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {form.dependsOn.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-2 py-0.5 text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                    onClick={() => set("dependsOn", form.dependsOn.filter((d) => d !== id))}
                    title="Remove"
                  >
                    <span className="truncate">{cards.find((c) => c.id === id)?.title ?? "A card"}</span>
                    <XMarkIcon className="h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            ) : null}
            <input
              className="app-input mt-1.5 h-9 w-full text-[16px] sm:text-sm"
              type="search"
              value={depQuery}
              onChange={(e) => setDepQuery(e.target.value)}
              placeholder="Find a card it depends on…"
              aria-label="Find a card it depends on"
            />
            <ul className="mt-1 max-h-[140px] overflow-y-auto rounded-[6px] border border-[var(--border-2)]">
              {depChoices.slice(0, 50).map((c) => {
                const on = form.dependsOn.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-1)]">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && form.dependsOn.length >= BOARD_LIMITS.dependsOn}
                        onChange={() => set("dependsOn", on ? form.dependsOn.filter((d) => d !== c.id) : [...form.dependsOn, c.id])}
                      />
                      <span className="min-w-0 truncate" title={c.title}>
                        {c.title}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {subItem ? (
          <p className="text-[12px] text-[var(--text-4)]">Add screenshots on the feature card itself.</p>
        ) : (
          <div>
            <span className="widget-data-label text-[var(--text-4)]">Screenshots</span>
            <p className="text-[12px] text-[var(--text-4)]">
              PNG, JPEG, GIF or WebP, up to 10 MB and 40 megapixels each, and {BOARD_LIMITS.images} a card
              {existingImages ? ` (this card has ${existingImages})` : ""}.
            </p>
            <label className="app-button app-button-secondary app-button-sm mt-1.5 inline-flex cursor-pointer">
              <PhotoIcon className="h-4 w-4" /> Choose images
              <input
                type="file"
                accept={IMAGE_TYPES.join(",")}
                multiple
                className="sr-only"
                data-board-file
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles((f) => [...f, ...picked].slice(0, BOARD_LIMITS.images));
                  e.target.value = "";
                }}
              />
            </label>
            {files.length ? (
              <ul className="mt-1.5 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
                    <span className="min-w-0 flex-1 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <button type="button" className="shrink-0 text-[var(--text-4)] hover:text-[var(--text-1)]" aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}>
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        {error ? <p className="mr-auto min-w-0 text-[12px] text-red-700">{error}</p> : null}
        <button type="button" className="app-button app-button-secondary app-button-md" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-md" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : mode === "add" ? "Add card" : "Save changes"}
        </button>
      </div>
    </>
  );
}
