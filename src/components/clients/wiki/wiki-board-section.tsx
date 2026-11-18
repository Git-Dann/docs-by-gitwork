"use client";

/**
 * The client's Board (src/server/wiki-board.ts): their product cards on the team's task board,
 * in their own columns, grouped by release, as on the planning site Big Wedge used before.
 *
 * One component for both audiences, so they can never disagree about where a card is:
 *   - "client": the wiki link. Drag between columns (never into or out of Done), add cards to
 *     the early columns, leave feedback, approve or ask for changes.
 *   - "team":   the internal wiki. Drag anywhere, reply to feedback. New cards are added on the
 *     task board, where the team works.
 *
 * Every column scrolls inside one frame with its header (.widget-card is overflow: hidden, so a
 * wide child without its own scroller would be cut off, §45.2). On a phone the columns become a
 * column picker over one stacked column.
 */

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
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
import { ChatBubbleLeftEllipsisIcon, PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { Markdown } from "@/lib/markdown";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { CardProgressChip, ItemTypeChip, SignOffChip, TierChip } from "@/components/tasks/product-card-parts";
import { ITEM_TYPE_LABELS, isItemType } from "@/lib/tasks/product-cards";
import { safeLaunchpadLink } from "@/lib/launchpad/field-types";
import { groupByRelease } from "@/lib/wiki-board-layout";
import {
  BOARD_LIMITS,
  CLIENT_CARD_TYPES,
  clientMayActOn,
  clientMoveRefusal,
  feedbackRefusal,
  type FeedbackKind,
} from "@/lib/wiki-board";
import {
  addBoardCardApi,
  moveBoardCardApi,
  useBoardFeedback,
  useBoardRefresh,
  useSendBoardFeedback,
  useSetWikiBoardShowAllTasks,
  type BoardTarget,
} from "@/hooks/use-wiki-board";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardLane, WikiBoardSection } from "@/types/wiki-board";

const MONO = { fontFamily: "var(--font-mono)" } as const;
type ShowMode = "cards" | "all";

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
  tasksHref,
}: {
  section: WikiBoardSection;
  target: BoardTarget;
  audience: "client" | "team";
  /** Team only: the client's task board, where new cards are added. */
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
  const [show, setShow] = useState<ShowMode>(hasCards ? "cards" : "all");
  const mode: ShowMode = hasCards ? show : "all";
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [release, setRelease] = useState("");
  const [area, setArea] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // lane key, or "" for the toolbar
  const [phoneLane, setPhoneLane] = useState<string>(section.lanes[0]?.key ?? "");

  const visible = useMemo(() => {
    let list = mode === "cards" ? cards.filter((c) => c.isCard) : cards;
    if (type) list = list.filter((c) => (type === "dev" ? !c.isCard : c.itemType === type));
    if (release) list = list.filter((c) => (release === "none" ? !c.release : c.release?.id === release));
    if (area) list = list.filter((c) => c.area === area);
    if (q.trim()) list = fuzzySearch(list, q, (c) => [c.title, c.area, c.release?.label]);
    return list;
  }, [cards, mode, type, release, area, q]);

  const filtered = Boolean(q.trim() || type || release || area);
  const addLanes = section.lanes.filter((l) => l.canAdd);

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
    const refusal = audience === "client" ? clientMoveRefusal(card.status, lane.stage) : null;
    if (refusal) {
      toast.error("Can't move that card", refusal);
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

  const open = openId ? cards.find((c) => c.id === openId) ?? null : null;
  const waiting = cards.filter((c) => c.isCard && c.status === "IN_REVIEW" && !c.signOff).length;
  const approved = cards.filter((c) => c.signOff === "approved").length;

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
      <div className="widget-body space-y-4">
        {/* Toolbar: narrowing down on the left, actions on the right; wraps on a phone. */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards…"
            aria-label="Search cards"
            className="app-input h-9 min-w-[200px] flex-1 text-[16px] sm:text-sm"
          />
          <select className="app-select h-9 w-full min-w-0 sm:w-auto" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {(["feature", "subitem", "bug", "feedback"] as const).map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABELS[t]}
              </option>
            ))}
            {mode === "all" && hasOther ? <option value="dev">Dev tasks</option> : null}
          </select>
          {section.releases.length ? (
            <select className="app-select h-9 w-full min-w-0 sm:w-auto" aria-label="Release" value={release} onChange={(e) => setRelease(e.target.value)}>
              <option value="">All releases</option>
              {section.releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
              <option value="none">No release</option>
            </select>
          ) : null}
          {section.areas.length ? (
            <select className="app-select h-9 w-full min-w-0 sm:w-auto" aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">All areas</option>
              {section.areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
            {hasCards && hasOther ? (
              <Segmented
                label="Show"
                className="h-9"
                value={mode}
                onChange={setShow}
                options={[
                  { value: "cards", label: "Cards" },
                  { value: "all", label: "Everything" },
                ]}
              />
            ) : null}
            {audience === "client" && addLanes.length ? (
              <button type="button" className="app-button app-button-primary app-button-sm h-9" onClick={() => setAdding("")}>
                <PlusIcon className="h-4 w-4" /> Add card
              </button>
            ) : null}
            {audience === "team" && target.mode === "internal" ? (
              <ShowAllTasksSwitch slug={target.slug} on={section.showAllTasks} onChanged={refresh} />
            ) : null}
            {audience === "team" && tasksHref ? (
              <Link href={tasksHref} className="app-button app-button-secondary app-button-sm h-9">
                Add on the task board
              </Link>
            ) : null}
          </div>
        </div>
        {audience === "client" ? (
          <p className="text-[12px] text-[var(--text-3)]">
            <span className="hidden sm:inline">Drag cards between columns. </span>
            <span className="sm:hidden">Open a card to move it to another column. </span>
            Only Gitwork moves a card into Live or out of it: approve a card, or say what needs changing, from the card
            itself.
          </p>
        ) : null}

        <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
          {/* Desktop and tablet: every column side by side, in one scroller with its header. */}
          <div className="hidden overflow-x-auto pb-2 sm:block" data-board-scroller>
            <div className="flex items-start gap-3">
              {section.lanes.map((lane) => (
                <Lane
                  key={lane.key}
                  lane={lane}
                  groups={groupsFor(
                    visible.filter((c) => c.laneKey === lane.key),
                    section,
                  )}
                  hidden={mode === "cards" ? lane.hidden.cards : lane.hidden.cards + lane.hidden.other}
                  canAdd={audience === "client" && lane.canAdd}
                  onAdd={() => setAdding(lane.key)}
                  onOpen={setOpenId}
                  audience={audience}
                />
              ))}
            </div>
          </div>
        </DndContext>

        {/* Phone: one column at a time, picked from a list, with its cards stacked. */}
        <div className="space-y-3 sm:hidden">
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
      </div>

      {open ? (
        <CardDetail
          card={open}
          lanes={section.lanes}
          target={target}
          audience={audience}
          onMove={(lane) => void move(open, lane)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      {adding !== null && target.mode === "public" ? (
        <AddCardDialog
          token={target.token}
          lanes={addLanes}
          releases={section.releases}
          initialLane={adding || addLanes[0]?.key || ""}
          onClose={() => setAdding(null)}
          onAdded={(card) => {
            setCards((list) => [...list, card]);
            setAdding(null);
            toast.success("Card added", "Gitwork has been told.");
            refresh();
          }}
        />
      ) : null}
    </section>
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
}: {
  lane: WikiBoardLane;
  groups: ViewGroup[];
  hidden: number;
  canAdd: boolean;
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
              audience === "client" && !clientMayActOn(c) ? (
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
  const bug = card.itemType === "bug";
  const Tag = readOnly ? "div" : "button";
  return (
    <Tag
      {...(readOnly ? { title: "Gitwork's own task, shown so you can see where it is" } : { type: "button" as const, onClick: onOpen })}
      data-board-card={card.id}
      data-board-readonly={readOnly ? "" : undefined}
      className={cn(
        "block w-full rounded-[8px] border border-l-[3px] bg-[var(--surface-0)] p-2.5 text-left shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--border-1)]",
        bug ? "border-l-red-500" : card.isCard ? "border-l-[var(--brand-500)]" : "border-l-[var(--border-1)]",
        "border-[var(--border-2)]",
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

/**
 * The team's switch: whether the client also sees the team's own dev tasks. Off by default; on,
 * the client sees each one's title, column and who's on it, read-only, and nothing else.
 */
function ShowAllTasksSwitch({ slug, on, onChanged }: { slug: string; on: boolean; onChanged: () => void }) {
  const set = useSetWikiBoardShowAllTasks(slug);
  const toast = useToast();
  return (
    <label
      className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-[6px] border border-[var(--border-2)] px-2.5 text-[12px] text-[var(--text-2)]"
      title="Off: the client sees their product cards and the cards they added. On: they also see your dev tasks as titles only, and can't move or comment on them."
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--brand-500)]"
        checked={on}
        disabled={set.isPending}
        onChange={(e) =>
          set.mutate(e.target.checked, {
            onSuccess: onChanged,
            onError: (err) => toast.error("Couldn't change that", err instanceof Error ? err.message : "Please try again."),
          })
        }
      />
      Show the client all tasks (titles only)
    </label>
  );
}

function CardDetail({
  card,
  lanes,
  target,
  audience,
  onMove,
  onClose,
}: {
  card: WikiBoardCard;
  lanes: WikiBoardLane[];
  target: BoardTarget;
  audience: "client" | "team";
  onMove: (lane: WikiBoardLane) => void;
  onClose: () => void;
}) {
  const feedback = useBoardFeedback(target, card.id);
  const send = useSendBoardFeedback(target, card.id);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lane = lanes.find((l) => l.key === card.laneKey);

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

  return (
    <Modal open onClose={onClose} title={isItemType(card.itemType) ? ITEM_TYPE_LABELS[card.itemType] : "Task"} panelClassName="app-dialog-fixed w-full max-w-4xl">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <div>
            <span className="flex flex-wrap items-center gap-1">
              <ItemTypeChip itemType={card.itemType} />
              <TierChip tier={card.tier} />
              <SignOffChip signOff={card.signOff} />
              <CardProgressChip progress={card.progress} />
            </span>
            <h2 className="mt-2 text-[18px] font-semibold leading-snug text-[var(--text-1)]">{card.title}</h2>
            <p className="mt-1 text-[12px] text-[var(--text-3)]" style={MONO}>
              {[card.release?.label, card.area, TASK_PRIORITY_LABELS[card.priority as TaskPriority], card.people.join(", ")]
                .filter(Boolean)
                .join(" · ")}
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
              {lanes.map((l) => {
                const refused = audience === "client" ? clientMoveRefusal(card.status, l.stage) : null;
                return (
                  <option key={l.key} value={l.key} disabled={Boolean(refused) && l.key !== card.laneKey}>
                    {l.label}
                    {refused && l.key !== card.laneKey ? " (Gitwork only)" : ""}
                  </option>
                );
              })}
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
                {audience === "client" ? "No feedback yet. Say what you think, approve it, or ask for changes." : "The client hasn\u2019t said anything on this card yet."}
              </p>
            ) : null}
            {feedback.data?.feedback.map((f) => (
              <div key={f.id} className="text-[13px]">
                <p className="text-[11px] text-[var(--text-4)]" style={MONO}>
                  {f.side === "team" ? "GITWORK" : "CLIENT"} · {f.authorName} · {formatDay(f.createdAt)}
                </p>
                {f.kind !== "comment" ? (
                  <SignOffChip signOff={f.kind} className="mt-1" />
                ) : null}
                {f.body ? <p className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{f.body}</p> : null}
              </div>
            ))}
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

function AddCardDialog({
  token,
  lanes,
  releases,
  initialLane,
  onClose,
  onAdded,
}: {
  token: string;
  lanes: WikiBoardLane[];
  releases: WikiBoardSection["releases"];
  initialLane: string;
  onClose: () => void;
  onAdded: (card: WikiBoardCard) => void;
}) {
  const [itemType, setItemType] = useState<(typeof CLIENT_CARD_TYPES)[number]>("feature");
  const [title, setTitle] = useState("");
  const [laneKey, setLaneKey] = useState(initialLane);
  const [releaseId, setReleaseId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError("Give the card a title.");
      return;
    }
    const list = links.split(/\s+/).map((l) => l.trim()).filter(Boolean);
    const bad = list.find((l) => !safeLaunchpadLink(l));
    if (bad) {
      setError(`"${bad}" isn't a web link. Links need to start with https://`);
      return;
    }
    if (list.length > BOARD_LIMITS.links) {
      setError(`Up to ${BOARD_LIMITS.links} links.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onAdded(
        await addBoardCardApi(token, {
          title: title.trim(),
          itemType,
          laneKey,
          releaseId: releaseId || null,
          priority,
          description,
          links: list,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the card. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add a card" panelClassName="app-dialog-fixed w-full max-w-lg">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <span className="widget-data-label text-[var(--text-4)]">Type</span>
          <Segmented
            label="Type"
            className="mt-1"
            value={itemType}
            onChange={setItemType}
            options={CLIENT_CARD_TYPES.map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] }))}
          />
        </div>
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Title</span>
          <input
            className="app-input mt-1 h-10 w-full text-[16px] sm:text-sm"
            value={title}
            maxLength={BOARD_LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={itemType === "bug" ? "What's going wrong?" : "What should it do?"}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Column</span>
            <select className="app-select mt-1 h-10 w-full text-[16px] sm:text-sm" value={laneKey} onChange={(e) => setLaneKey(e.target.value)}>
              {lanes.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Priority</span>
            <select className="app-select mt-1 h-10 w-full text-[16px] sm:text-sm" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(["LOW", "MEDIUM", "HIGH"] as const).map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {releases.length ? (
          <label className="block">
            <span className="widget-data-label text-[var(--text-4)]">Release</span>
            <select className="app-select mt-1 h-10 w-full text-[16px] sm:text-sm" value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
              <option value="">No release yet</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Description</span>
          <textarea
            className="app-input mt-1 w-full resize-y px-3 py-2 text-[16px] sm:text-sm"
            rows={4}
            value={description}
            maxLength={BOARD_LIMITS.description}
            onChange={(e) => setDescription(e.target.value)}
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
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        {error ? <p className="mr-auto text-[12px] text-red-700">{error}</p> : null}
        <button type="button" className="app-button app-button-secondary app-button-md" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-md" disabled={saving} onClick={() => void save()}>
          {saving ? "Adding…" : "Add card"}
        </button>
      </div>
    </Modal>
  );
}
