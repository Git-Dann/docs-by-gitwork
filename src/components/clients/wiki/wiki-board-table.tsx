"use client";

/**
 * The Board's Table view: the same cards as the Board, as spreadsheet rows (rules in
 * src/lib/wiki-board-table.ts). It replaced the wiki's Sheets (§127): group by list, edit a cell in
 * place, add a row at the foot of a group, paste rows from Google Sheets, copy them back out.
 *
 * Every edit goes through the same routes as the card dialog, one field at a time, so the server's
 * rules apply to a cell exactly as to a form: the client never sets who works on a card, and the
 * team's dev tasks are never theirs to change.
 *
 * The grid scrolls inside its own frame with its header (.widget-card is overflow: hidden, §45.2),
 * with the header and the title column pinned. Below `sm` it is a stacked list instead, and a card
 * opens in its dialog to edit.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  PlusIcon,
  TableCellsIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ItemTypeChip } from "@/components/tasks/product-card-parts";
import { BOARD_LIST_MAX, TIERS, TIER_LABELS } from "@/lib/tasks/product-cards";
import { BOARD_LIMITS } from "@/lib/wiki-board";
import {
  BULK_FIELDS,
  BULK_FIELD_LABELS,
  PASTE_FIELDS,
  PASTE_FIELD_LABELS,
  TABLE_COLUMNS,
  TABLE_GROUP_BY,
  TABLE_GROUP_LABELS,
  TABLE_PASTE_MAX,
  boardLists,
  bulkTargets,
  cellEditable,
  cellPatch,
  cellText,
  defaultGroupBy,
  exportTable,
  groupTableCards,
  planTablePaste,
  sortTableCards,
  type BulkField,
  type EditableColumn,
  type PasteField,
  type TableColumnKey,
  type TableContext,
  type TableGroup,
  type TableGroupBy,
  type TableSort,
} from "@/lib/wiki-board-table";
import {
  addBoardCardApi,
  boardImageUrl,
  deleteBoardCardApi,
  moveBoardCardApi,
  updateBoardCardApi,
  type BoardCardForm,
  type BoardTarget,
} from "@/hooks/use-wiki-board";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardLane, WikiBoardSection } from "@/types/wiki-board";

const MONO = { fontFamily: "var(--font-mono)" } as const;

/** How many card writes a bulk change runs at once. Small: the client's edits are rate limited. */
const BULK_PARALLEL = 3;

async function runLimited<T>(items: readonly T[], fn: (item: T) => Promise<void>): Promise<{ done: number; failed: string[] }> {
  let done = 0;
  const failed: string[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
        done += 1;
      } catch (err) {
        failed.push(err instanceof Error ? err.message : "Couldn't change it.");
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, items.length) }, worker));
  return { done, failed };
}

function blankForm(): BoardCardForm {
  return {
    title: "",
    itemType: "feature",
    laneKey: "",
    parentId: null,
    releaseId: null,
    tier: null,
    area: null,
    list: null,
    priority: "MEDIUM",
    estimateHours: null,
    dueDate: null,
    description: "",
    links: [],
    dependsOn: [],
  };
}

export interface WikiBoardTableProps {
  /** The cards to show: the Board's filtered set. */
  cards: WikiBoardCard[];
  /** Every card on the board, for list suggestions. */
  allCards: WikiBoardCard[];
  section: WikiBoardSection;
  target: BoardTarget;
  /** The client, or the team previewing the client's view: their rules apply. */
  asClient: boolean;
  /** Whoever is looking may add cards, and to which early columns. */
  addLanes: WikiBoardLane[];
  canAdd: boolean;
  /** Delete is offered (client on their link, team on the internal wiki). */
  canDelete: boolean;
  /** Done columns send their newest cards; how many weren't sent. */
  hiddenCount: number;
  groupBy: TableGroupBy | null;
  onGroupBy: (g: TableGroupBy) => void;
  sort: TableSort | null;
  onSort: (s: TableSort | null) => void;
  onOpen: (id: string) => void;
  /** Move a card to another column (the Board's own optimistic move). */
  onMove: (card: WikiBoardCard, lane: WikiBoardLane) => void;
  /** Replace the local copy of the cards (optimistic edits and their rollback). */
  setCards: (update: (list: WikiBoardCard[]) => WikiBoardCard[]) => void;
  onPlace: (card: WikiBoardCard) => void;
  onRemoved: (ids: string[]) => void;
  refresh: () => void;
}

export function WikiBoardTable(props: WikiBoardTableProps) {
  const { cards, allCards, section, target, asClient, addLanes, canAdd, canDelete, hiddenCount, onOpen, refresh } = props;
  const toast = useToast();
  const ctx: TableContext = useMemo(
    () => ({ lanes: section.lanes.map((l) => ({ key: l.key, label: l.label })), releases: section.releases.map((r) => ({ id: r.id, label: r.label })) }),
    [section.lanes, section.releases],
  );
  const groupBy = props.groupBy ?? defaultGroupBy(allCards);
  const sorted = useMemo(() => sortTableCards(cards, props.sort, ctx), [cards, props.sort, ctx]);
  const groups = useMemo(() => groupTableCards(sorted, groupBy, ctx), [sorted, groupBy, ctx]);
  const lists = useMemo(() => boardLists(allCards), [allCards]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasting, setPasting] = useState(false);
  // Selection only ever covers cards still on screen: a filter or a delete drops the rest.
  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    setSelected((s) => (Array.from(s).every((id) => ids.has(id)) ? s : new Set(Array.from(s).filter((id) => ids.has(id)))));
  }, [cards]);

  const columns = TABLE_COLUMNS;
  const visibleKeys = columns.map((c) => c.key);

  async function saveCell(card: WikiBoardCard, key: EditableColumn, raw: string) {
    if (key === "lane") {
      const lane = section.lanes.find((l) => l.key === raw);
      if (lane && lane.key !== card.laneKey) props.onMove(card, lane);
      return;
    }
    const res = cellPatch(key, raw, ctx);
    if (!res.ok) {
      toast.error("Couldn't save that", res.error);
      return;
    }
    if (!res.patch) return;
    const before = card;
    const optimistic = applyPatch(card, res.patch, ctx);
    if (JSON.stringify(optimistic) === JSON.stringify(card)) return;
    props.setCards((list) => list.map((c) => (c.id === card.id ? optimistic : c)));
    try {
      const saved = await updateBoardCardApi(target, card.id, res.patch);
      props.onPlace(saved);
      refresh();
    } catch (err) {
      props.setCards((list) => list.map((c) => (c.id === card.id ? before : c)));
      toast.error("Couldn't save that", err instanceof Error ? err.message : "Please try again.");
    }
  }

  async function addRow(group: TableGroup, title: string): Promise<boolean> {
    const laneKey = group.seed.laneKey && addLanes.some((l) => l.key === group.seed.laneKey) ? group.seed.laneKey : addLanes[0]?.key;
    if (!laneKey) return false;
    try {
      const card = await addBoardCardApi(target, {
        ...blankForm(),
        title: title.trim(),
        laneKey,
        list: group.seed.list ?? null,
        releaseId: group.seed.releaseId ?? null,
      });
      props.onPlace(card);
      refresh();
      return true;
    } catch (err) {
      toast.error("Couldn't add the card", err instanceof Error ? err.message : "Please try again.");
      return false;
    }
  }

  function exportRows(delimiter: "," | "\t") {
    const text = exportTable(groups.flatMap((g) => g.cards), visibleKeys, ctx, delimiter);
    if (delimiter === "\t") {
      void navigator.clipboard.writeText(text).then(
        () => toast.success("Copied", "Paste it into Google Sheets."),
        () => toast.error("Couldn't copy", "Your browser blocked the clipboard. Try the CSV instead."),
      );
      return;
    }
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "board.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const allIds = groups.flatMap((g) => g.cards.map((c) => c.id));
  const allTicked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const sortValue = props.sort ? `${props.sort.key}:${props.sort.dir}` : "";
  const canAddRows = canAdd && addLanes.length > 0;

  return (
    <div className="space-y-3" data-board-table>
      {/* The view's own controls, in its own header line (as the Timeline and Calendar). */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="widget-data-label text-[var(--text-4)]">Group</span>
          <select
            className="app-select app-select-compact h-8 pr-8 text-[16px] sm:text-sm"
            value={groupBy}
            onChange={(e) => props.onGroupBy(e.target.value as TableGroupBy)}
            aria-label="Group by"
          >
            {TABLE_GROUP_BY.map((g) => (
              <option key={g} value={g}>
                {TABLE_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="widget-data-label text-[var(--text-4)]">Sort</span>
          <select
            className="app-select app-select-compact h-8 pr-8 text-[16px] sm:text-sm"
            value={sortValue}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              props.onSort(key ? { key: key as TableColumnKey, dir: dir === "desc" ? "desc" : "asc" } : null);
            }}
            aria-label="Sort by"
          >
            <option value="">Board order</option>
            {columns
              .filter((c) => c.sortable)
              .flatMap((c) => [
                <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                  {c.label} ↑
                </option>,
                <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                  {c.label} ↓
                </option>,
              ])}
          </select>
        </label>
        <span className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {canAddRows ? (
            <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={() => setPasting(true)} data-board-table-paste>
              <TableCellsIcon className="h-4 w-4" /> Paste rows
            </button>
          ) : null}
          <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={() => exportRows("\t")} title="Copy these rows for Google Sheets">
            <ClipboardDocumentIcon className="h-4 w-4" /> Copy
          </button>
          <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={() => exportRows(",")} title="Download these rows as CSV">
            <ArrowDownTrayIcon className="h-4 w-4" /> CSV
          </button>
        </span>
      </div>

      {!groups.length ? (
        <p className="py-8 text-center text-[13px] text-[var(--text-4)]">No cards to show.</p>
      ) : (
        <>
          {/* Desktop and tablet: the grid, header and rows in one scroller. */}
          <div
            className="hidden max-h-[70vh] overflow-auto rounded-[8px] border border-[var(--border-2)] sm:block"
            data-board-table-scroller
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 w-9 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select every row shown"
                      checked={allTicked}
                      onChange={() => setSelected(allTicked ? new Set() : new Set(allIds))}
                    />
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      style={{ width: c.width, minWidth: c.width, ...(c.key === "title" ? { left: 36 } : {}) }}
                      className={cn(
                        "sticky top-0 z-20 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-2 text-left",
                        c.key === "title" && "z-30 border-r",
                      )}
                    >
                      <HeaderButton
                        label={c.label}
                        sortable={c.sortable}
                        dir={props.sort?.key === c.key ? props.sort.dir : null}
                        onSort={() => {
                          if (!c.sortable) return;
                          const cur = props.sort?.key === c.key ? props.sort.dir : null;
                          props.onSort(cur === "asc" ? { key: c.key, dir: "desc" } : cur === "desc" ? null : { key: c.key, dir: "asc" });
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const folded = collapsed.has(g.key);
                  const addable = canAddRows && (!g.seed.laneKey || addLanes.some((l) => l.key === g.seed.laneKey));
                  return (
                    <GroupRows
                      key={g.key}
                      group={g}
                      folded={folded}
                      showHeading={groupBy !== "none"}
                      onFold={() =>
                        setCollapsed((s) => {
                          const next = new Set(s);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      columns={columns.length}
                    >
                      {folded
                        ? null
                        : g.cards.map((card) => (
                            <tr key={card.id} className="group/row" data-board-table-row>
                              <td className="sticky left-0 z-10 w-9 border-b border-[var(--border-2)] bg-[var(--surface-0)] px-2 group-hover/row:bg-[var(--surface-1)]">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${card.title}`}
                                  checked={selected.has(card.id)}
                                  onChange={() => toggle(card.id)}
                                />
                              </td>
                              {columns.map((c) => (
                                <td
                                  key={c.key}
                                  style={{ width: c.width, minWidth: c.width, maxWidth: c.width, ...(c.key === "title" ? { left: 36 } : {}) }}
                                  className={cn(
                                    "border-b border-[var(--border-2)] bg-[var(--surface-0)] align-middle group-hover/row:bg-[var(--surface-1)]",
                                    c.key === "title" && "sticky z-10 border-r",
                                  )}
                                >
                                  <Cell
                                    card={card}
                                    column={c.key}
                                    ctx={ctx}
                                    section={section}
                                    target={target}
                                    lists={lists}
                                    editable={cellEditable(card, c.key, asClient)}
                                    onSave={(raw) => void saveCell(card, c.key as EditableColumn, raw)}
                                    onOpen={() => onOpen(card.id)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                      {!folded && addable ? (
                        <tr>
                          <td className="sticky left-0 z-10 border-b border-[var(--border-2)] bg-[var(--surface-0)]" />
                          <td
                            className="sticky z-10 border-b border-r border-[var(--border-2)] bg-[var(--surface-0)]"
                            style={{ left: 36 }}
                          >
                            <AddRow
                              label={groupBy === "none" || g.seed.list === null || g.key.endsWith(":") ? "Add a card" : `Add to ${g.label}`}
                              onAdd={(title) => addRow(g, title)}
                            />
                          </td>
                          <td colSpan={columns.length - 1} className="border-b border-[var(--border-2)] bg-[var(--surface-0)]" />
                        </tr>
                      ) : null}
                    </GroupRows>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: a stacked list; a card opens in its dialog to edit. */}
          <div className="space-y-4 sm:hidden" data-board-table-stack>
            {groups.map((g) => (
              <div key={g.key} className="space-y-2">
                {groupBy !== "none" ? (
                  <p className="widget-data-label text-[var(--text-3)]">
                    {g.label} · {g.cards.length}
                  </p>
                ) : null}
                {g.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onOpen(card.id)}
                    className="block w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3 text-left hover:bg-[var(--surface-1)]"
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-[14px] font-medium text-[var(--text-1)]">{card.title}</span>
                      <ItemTypeChip itemType={card.itemType} />
                    </span>
                    <span className="mt-1 block text-[11px] text-[var(--text-3)]" style={MONO}>
                      {[cellText(card, "lane", ctx), card.list && groupBy !== "list" ? card.list : null, TASK_PRIORITY_LABELS[card.priority], card.dueDate ? `Due ${cellText(card, "due", ctx)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {hiddenCount > 0 ? (
        <p className="text-[12px] text-[var(--text-4)]">
          {hiddenCount} older done card{hiddenCount === 1 ? " isn’t" : "s aren’t"} shown: a done column carries its newest {BOARD_LIMITS.doneLaneCards}.
        </p>
      ) : null}

      {selected.size > 0
        ? createPortal(
            <BulkBar
              cards={cards}
              selected={selected}
              asClient={asClient}
              canDelete={canDelete}
              section={section}
              ctx={ctx}
              lists={lists}
              target={target}
              onClear={() => setSelected(new Set())}
              onDone={(removed) => {
                if (removed.length) props.onRemoved(removed);
                setSelected(new Set());
                refresh();
              }}
            />,
            document.body,
          )
        : null}

      {pasting ? (
        <PasteDialog
          ctx={ctx}
          target={target}
          lanes={section.lanes}
          addLanes={addLanes}
          lists={lists}
          onClose={() => setPasting(false)}
          onAdded={(added) => {
            for (const c of added) props.onPlace(c);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** The local copy after an edit, before the server answers. */
function applyPatch(card: WikiBoardCard, patch: Record<string, unknown>, ctx: TableContext): WikiBoardCard {
  const next = { ...card };
  if ("title" in patch) next.title = String(patch.title);
  if ("itemType" in patch) next.itemType = patch.itemType as string;
  if ("list" in patch) next.list = (patch.list as string | null) ?? null;
  if ("area" in patch) next.area = (patch.area as string | null) ?? null;
  if ("priority" in patch) next.priority = patch.priority as WikiBoardCard["priority"];
  if ("tier" in patch) next.tier = (patch.tier as string | null) ?? null;
  if ("estimateHours" in patch) next.estimateHours = (patch.estimateHours as number | null) ?? null;
  if ("dueDate" in patch) next.dueDate = patch.dueDate ? `${patch.dueDate as string}T12:00:00.000Z` : null;
  if ("releaseId" in patch) {
    const r = ctx.releases.find((x) => x.id === patch.releaseId);
    next.release = r ? { id: r.id, label: r.label } : null;
  }
  return next;
}

function HeaderButton({ label, sortable, dir, onSort }: { label: string; sortable: boolean; dir: "asc" | "desc" | null; onSort: () => void }) {
  if (!sortable) return <span className="widget-data-label text-[var(--text-3)]">{label}</span>;
  return (
    <button
      type="button"
      onClick={onSort}
      className="widget-data-label inline-flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-1)]"
      aria-label={`Sort by ${label}`}
      title={dir === "asc" ? "Sorted ascending: click for descending" : dir === "desc" ? "Sorted descending: click to clear" : `Sort by ${label}`}
    >
      {label}
      {dir ? <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

function GroupRows({
  group,
  folded,
  showHeading,
  onFold,
  columns,
  children,
}: {
  group: TableGroup;
  folded: boolean;
  showHeading: boolean;
  onFold: () => void;
  columns: number;
  children: React.ReactNode;
}) {
  return (
    <>
      {showHeading ? (
        <tr data-board-table-group>
          <td colSpan={columns + 1} className="border-b border-[var(--border-2)] bg-[var(--surface-1)] p-0">
            <button
              type="button"
              onClick={onFold}
              aria-expanded={!folded}
              className="sticky left-0 flex items-center gap-1.5 px-2 py-1.5 text-left text-[12px] font-semibold text-[var(--text-1)]"
            >
              {folded ? <ChevronRightIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
              <span className="max-w-[420px] truncate" title={group.label}>
                {group.label}
              </span>
              <span className="font-normal text-[var(--text-4)]" style={MONO}>
                {group.cards.length}
              </span>
            </button>
          </td>
        </tr>
      ) : null}
      {children}
    </>
  );
}

function AddRow({ label, onAdd }: { label: string; onAdd: (title: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(value);
    setBusy(false);
    if (ok) setValue("");
  }
  return (
    <span className="flex items-center gap-1.5 px-2 py-1">
      <PlusIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
      <input
        className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none"
        value={value}
        maxLength={BOARD_LIMITS.title}
        placeholder={label}
        aria-label={label}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setValue("");
        }}
        data-board-table-add
      />
    </span>
  );
}

/** One cell: text you click to edit (where you may), or a plain readout. */
function Cell({
  card,
  column,
  ctx,
  section,
  target,
  lists,
  editable,
  onSave,
  onOpen,
}: {
  card: WikiBoardCard;
  column: TableColumnKey;
  ctx: TableContext;
  section: WikiBoardSection;
  target: BoardTarget;
  lists: string[];
  editable: boolean;
  onSave: (raw: string) => void;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const text = cellText(card, column, ctx);
  const pad = "block w-full truncate px-2 py-1.5 text-left";

  if (column === "title") {
    return (
      <span className="flex items-center gap-1.5 pr-1">
        {editing ? (
          <TextEditor initial={card.title} onDone={(v) => { setEditing(false); if (v !== null) onSave(v); }} maxLength={BOARD_LIMITS.title} />
        ) : (
          <>
            <button type="button" onClick={onOpen} className={cn(pad, "min-w-0 flex-1 font-medium text-[var(--text-1)] hover:underline")} title={card.title}>
              {card.title}
            </button>
            {editable ? (
              <button
                type="button"
                className="shrink-0 rounded-[4px] px-1 text-[11px] text-[var(--text-4)] opacity-0 hover:text-[var(--text-1)] focus:opacity-100 group-hover/row:opacity-100"
                onClick={() => setEditing(true)}
                aria-label={`Rename ${card.title}`}
              >
                Edit
              </button>
            ) : null}
          </>
        )}
      </span>
    );
  }

  if (column === "images") {
    const first = card.images[0];
    return first ? (
      <button type="button" onClick={onOpen} className="flex items-center gap-1.5 px-2 py-1" title={`${card.images.length} screenshot${card.images.length === 1 ? "" : "s"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={boardImageUrl(target, card.id, first, true)} alt="" className="h-6 w-8 rounded-[3px] border border-[var(--border-2)] object-cover" />
        <span className="text-[12px] text-[var(--text-3)]" style={MONO}>
          {card.images.length}
        </span>
      </button>
    ) : (
      <span className="block px-2 py-1.5 text-[var(--text-4)]">—</span>
    );
  }

  if (!editable) {
    return (
      <span className={cn(pad, "text-[var(--text-2)]", !text && "text-[var(--text-4)]")} title={text || undefined}>
        {text || "—"}
      </span>
    );
  }

  const select = "app-select app-select-compact h-8 w-full text-[13px]";
  switch (column) {
    case "type":
      return (
        <select className={select} aria-label="Type" value={card.itemType ?? ""} onChange={(e) => onSave(e.target.value)}>
          {card.itemType && !["feature", "bug", "feedback"].includes(card.itemType) ? <option value={card.itemType}>{text}</option> : null}
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
          <option value="feedback">Feedback</option>
        </select>
      );
    case "lane":
      return (
        <select className={select} aria-label="Column" value={card.laneKey} onChange={(e) => onSave(e.target.value)}>
          {section.lanes.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      );
    case "release":
      return (
        <select className={select} aria-label="Release" value={card.release?.id ?? ""} onChange={(e) => onSave(e.target.value)}>
          <option value="">No release</option>
          {section.releases.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      );
    case "priority":
      return (
        <select className={select} aria-label="Priority" value={card.priority} onChange={(e) => onSave(e.target.value)}>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      );
    case "tier":
      return (
        <select className={select} aria-label="Tier" value={card.tier ?? ""} onChange={(e) => onSave(e.target.value)}>
          <option value="">No tier</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}
            </option>
          ))}
        </select>
      );
    default:
      break;
  }

  if (editing) {
    const initial =
      column === "due" ? (card.dueDate?.slice(0, 10) ?? "") : column === "hours" ? (card.estimateHours === null ? "" : String(card.estimateHours)) : text;
    return (
      <TextEditor
        initial={initial}
        type={column === "due" ? "date" : column === "hours" ? "number" : "text"}
        suggestions={column === "list" ? lists : column === "area" ? section.areas : undefined}
        maxLength={column === "list" ? BOARD_LIST_MAX : column === "area" ? BOARD_LIMITS.area : undefined}
        onDone={(v) => {
          setEditing(false);
          if (v !== null) onSave(v);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(pad, "text-[var(--text-2)] hover:bg-[var(--surface-2)]", !text && "text-[var(--text-4)]")}
      title={text ? `${text} (click to edit)` : "Click to edit"}
    >
      {text || "—"}
    </button>
  );
}

/** A text box over the cell: Enter or leaving it saves, Escape keeps the old value. */
function TextEditor({
  initial,
  onDone,
  type = "text",
  suggestions,
  maxLength,
}: {
  initial: string;
  onDone: (value: string | null) => void;
  type?: "text" | "number" | "date";
  suggestions?: string[];
  maxLength?: number;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const listId = useMemo(() => (suggestions ? `table-sugg-${Math.random().toString(36).slice(2, 8)}` : undefined), [suggestions]);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select?.();
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v === null || v === initial ? null : v);
  };
  return (
    <>
      <input
        ref={ref}
        className="app-input h-8 w-full px-2 text-[13px]"
        type={type}
        step={type === "number" ? 0.5 : undefined}
        min={type === "number" ? 0 : undefined}
        value={value}
        maxLength={maxLength}
        list={listId}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(value);
          if (e.key === "Escape") finish(null);
        }}
      />
      {suggestions && listId ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

/** Set one field on every selected card the viewer may change, or delete them. Floats at the foot. */
function BulkBar({
  cards,
  selected,
  asClient,
  canDelete,
  section,
  ctx,
  lists,
  target,
  onClear,
  onDone,
}: {
  cards: WikiBoardCard[];
  selected: Set<string>;
  asClient: boolean;
  canDelete: boolean;
  section: WikiBoardSection;
  ctx: TableContext;
  lists: string[];
  target: BoardTarget;
  onClear: () => void;
  onDone: (removedIds: string[]) => void;
}) {
  const toast = useToast();
  const [field, setField] = useState<BulkField>("list");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setValue(""), [field]);

  async function apply() {
    const { cards: targets, skipped } = bulkTargets(cards, selected, field, asClient);
    if (!targets.length) {
      toast.error("Nothing to change", "None of the selected cards can be changed here.");
      return;
    }
    setBusy(true);
    let result: { done: number; failed: string[] };
    if (field === "lane") {
      const lane = section.lanes.find((l) => l.key === value);
      if (!lane) {
        setBusy(false);
        toast.error("Choose a column first");
        return;
      }
      let orderKey = Math.max(0, ...cards.filter((c) => c.laneKey === lane.key).map((c) => c.orderKey));
      result = await runLimited(
        targets.filter((c) => c.laneKey !== lane.key),
        async (c) => moveBoardCardApi(target, c, lane, ++orderKey),
      );
    } else {
      const res = cellPatch(field, value, ctx);
      if (!res.ok || !res.patch) {
        setBusy(false);
        toast.error("Couldn't change that", res.ok ? "Choose a value first." : res.error);
        return;
      }
      const patch = res.patch;
      result = await runLimited(targets, async (c) => {
        await updateBoardCardApi(target, c.id, patch);
      });
    }
    setBusy(false);
    report(result, skipped);
    onDone([]);
  }

  async function remove() {
    const { cards: targets, skipped } = bulkTargets(cards, selected, "delete", asClient);
    setBusy(true);
    const removed: string[] = [];
    const result = await runLimited(targets, async (c) => {
      await deleteBoardCardApi(target, c.id);
      removed.push(c.id);
    });
    setBusy(false);
    setConfirmDelete(false);
    report(result, skipped, true);
    onDone(removed);
  }

  function report(result: { done: number; failed: string[] }, skipped: number, deleting = false) {
    const verb = deleting ? "Deleted" : "Changed";
    const notes = [
      skipped ? `${skipped} ${skipped === 1 ? "is" : "are"} Gitwork's own task${skipped === 1 ? "" : "s"} and ${skipped === 1 ? "was" : "were"} left alone.` : null,
      result.failed.length ? `${result.failed.length} couldn't be changed: ${result.failed[0]}` : null,
    ].filter(Boolean);
    if (result.failed.length) toast.error(`${verb} ${result.done} of ${result.done + result.failed.length}`, notes.join(" "));
    else toast.success(`${verb} ${result.done} card${result.done === 1 ? "" : "s"}`, notes.join(" ") || undefined);
  }

  const control = "app-select app-select-compact h-8 w-auto max-w-[200px] text-[16px] sm:text-[13px]";
  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-[760px] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.30)]"
      data-board-table-bulk
      role="region"
      aria-label="Change the selected cards"
    >
      <span className="text-[13px] font-medium text-[var(--text-1)]" style={MONO}>
        {selected.size} selected
      </span>
      {confirmDelete ? (
        <>
          <span className="text-[13px] text-red-700">Delete {selected.size}? The team can put them back.</span>
          <button type="button" className="app-button app-button-danger app-button-sm h-8" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={() => setConfirmDelete(false)}>
            Keep them
          </button>
        </>
      ) : (
        <>
          <select className={control} aria-label="Field to set" value={field} onChange={(e) => setField(e.target.value as BulkField)}>
            {BULK_FIELDS.map((f) => (
              <option key={f} value={f}>
                Set {BULK_FIELD_LABELS[f].toLowerCase()}
              </option>
            ))}
          </select>
          <BulkValue field={field} value={value} setValue={setValue} section={section} lists={lists} />
          <button type="button" className="app-button app-button-primary app-button-sm h-8" disabled={busy} onClick={() => void apply()}>
            {busy ? "Saving…" : "Apply"}
          </button>
          {canDelete ? (
            <button
              type="button"
              className="app-button app-button-secondary app-button-sm h-8 text-red-700"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete the selected cards"
              title="Delete the selected cards"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          ) : null}
        </>
      )}
      <button type="button" className="ml-auto text-[var(--text-4)] hover:text-[var(--text-1)]" onClick={onClear} aria-label="Clear the selection">
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function BulkValue({
  field,
  value,
  setValue,
  section,
  lists,
}: {
  field: BulkField;
  value: string;
  setValue: (v: string) => void;
  section: WikiBoardSection;
  lists: string[];
}) {
  const control = "app-select app-select-compact h-8 w-auto min-w-0 max-w-[200px] text-[16px] sm:text-[13px]";
  if (field === "list" || field === "area") {
    const sugg = field === "list" ? lists : section.areas;
    return (
      <>
        <input
          className="app-input h-8 w-[180px] min-w-0 px-2 text-[16px] sm:text-[13px]"
          list={`bulk-${field}`}
          value={value}
          maxLength={field === "list" ? BOARD_LIST_MAX : BOARD_LIMITS.area}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field === "list" ? "List name" : "Area"}
          title="Leave it blank to clear it"
          aria-label={BULK_FIELD_LABELS[field]}
        />
        <datalist id={`bulk-${field}`}>
          {sugg.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </>
    );
  }
  const options: Array<{ value: string; label: string }> =
    field === "lane"
      ? section.lanes.map((l) => ({ value: l.key, label: l.label }))
      : field === "release"
        ? [{ value: "", label: "No release" }, ...section.releases.map((r) => ({ value: r.id, label: r.label }))]
        : field === "priority"
          ? TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))
          : [{ value: "", label: "No tier" }, ...TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))];
  return (
    <select className={control} aria-label={BULK_FIELD_LABELS[field]} value={value} onChange={(e) => setValue(e.target.value)}>
      {field === "lane" || field === "priority" ? <option value="">Choose…</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Paste rows from Google Sheets: see how each column maps, then add them as cards. */
function PasteDialog({
  ctx,
  target,
  lanes,
  addLanes,
  lists,
  onClose,
  onAdded,
}: {
  ctx: TableContext;
  target: BoardTarget;
  /** Every column on the board: a pasted row may name a later one, moved to after it's added. */
  lanes: WikiBoardLane[];
  addLanes: WikiBoardLane[];
  lists: string[];
  onClose: () => void;
  onAdded: (cards: WikiBoardCard[]) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [list, setList] = useState("");
  const [mapping, setMapping] = useState<Array<PasteField | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const planCtx = useMemo(() => ({ ...ctx, addLaneKeys: addLanes.map((l) => l.key) }), [ctx, addLanes]);
  const plan = useMemo(() => planTablePaste(text, planCtx, { list, mapping: mapping ?? undefined }), [text, planCtx, list, mapping]);
  // A new paste starts from fresh guesses.
  useEffect(() => setMapping(null), [text]);
  const laneKey = addLanes[0]?.key ?? "";

  async function add() {
    if (!plan.cards.length || !laneKey) return;
    setBusy(true);
    const added: WikiBoardCard[] = [];
    let error: string | null = null;
    for (const c of plan.cards) {
      try {
        let card = await addBoardCardApi(target, {
          title: c.title,
          itemType: c.itemType,
          laneKey,
          parentId: null,
          releaseId: c.releaseId,
          tier: c.tier,
          area: c.area,
          list: c.list,
          priority: c.priority,
          estimateHours: c.estimateHours,
          dueDate: c.dueDate,
          description: c.description ?? "",
          links: [],
          dependsOn: [],
        });
        // A row naming a later column (In development, Live…) is added early, then moved there.
        const lane = c.moveToLaneKey ? lanes.find((l) => l.key === c.moveToLaneKey) : undefined;
        if (lane) {
          await moveBoardCardApi(target, card, lane, Date.now());
          card = { ...card, laneKey: lane.key, status: lane.stage };
        }
        added.push(card);
        setProgress(added.length);
      } catch (err) {
        error = err instanceof Error ? err.message : "Please try again.";
        break;
      }
    }
    setBusy(false);
    onAdded(added);
    if (error) {
      toast.error(`Added ${added.length} of ${plan.cards.length}`, `Stopped at a card that couldn't be added: ${error}`);
    } else {
      toast.success(`Added ${added.length} card${added.length === 1 ? "" : "s"}`);
      onClose();
    }
  }

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title="Paste rows" panelClassName="app-dialog-fixed w-full max-w-3xl">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" data-board-table-paste-dialog>
        <p className="text-[13px] text-[var(--text-3)]">
          Copy rows from Google Sheets or Excel (with the header row if you have one) and paste them here. Each row becomes a card. A column
          that isn&apos;t a card field is kept in the card&apos;s description, so nothing is lost. Up to {TABLE_PASTE_MAX} rows at a time.
        </p>
        <textarea
          className="app-input h-[140px] w-full resize-y px-3 py-2 text-[16px] sm:text-[13px]"
          style={MONO}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Title\tType\tPriority\nSaved filters\tFeature\tHigh"}
          aria-label="Pasted rows"
        />
        <label className="block">
          <span className="widget-data-label text-[var(--text-4)]">Put them in a list</span>
          <input
            className="app-input mt-1 h-10 w-full text-[16px] sm:text-sm"
            list="paste-lists"
            value={list}
            maxLength={BOARD_LIST_MAX}
            onChange={(e) => setList(e.target.value)}
            placeholder="Optional, e.g. QA review: 21 Nov"
          />
          <datalist id="paste-lists">
            {lists.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        {plan.header.length ? (
          <div>
            <span className="widget-data-label text-[var(--text-4)]">Columns</span>
            <ul className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {plan.header.map((h, i) => (
                <li key={`${h}-${i}`} className="min-w-0 rounded-[6px] border border-[var(--border-2)] px-2.5 py-2">
                  <span className="block truncate text-[12px] font-medium text-[var(--text-2)]" title={h}>
                    {h}
                  </span>
                  <select
                    className="app-select app-select-compact mt-1 h-8 w-full text-[16px] sm:text-[13px]"
                    aria-label={`What “${h}” is`}
                    value={plan.mapping[i] ?? ""}
                    onChange={(e) => {
                      const next = [...plan.mapping];
                      next[i] = (e.target.value || null) as PasteField | null;
                      setMapping(next);
                    }}
                  >
                    <option value="">Keep in description</option>
                    {PASTE_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {PASTE_FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.cards.length ? (
          <div>
            <span className="widget-data-label text-[var(--text-4)]">First rows</span>
            <ul className="mt-1 divide-y divide-[var(--border-2)] rounded-[6px] border border-[var(--border-2)]">
              {plan.cards.slice(0, 5).map((c, i) => (
                <li key={i} className="px-2.5 py-1.5 text-[13px]">
                  <span className="block truncate font-medium text-[var(--text-1)]" title={c.title}>
                    {c.title}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--text-3)]" style={MONO} title={c.description ?? undefined}>
                    {[c.itemType, c.list, TASK_PRIORITY_LABELS[c.priority], c.dueDate].filter(Boolean).join(" · ")}
                    {c.description ? " · has a description" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.problems.length && text.trim() ? (
          <ul className="space-y-1 text-[12px] text-amber-800">
            {plan.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        {busy ? (
          <span className="mr-auto text-[12px] text-[var(--text-3)]" style={MONO}>
            Adding {progress} of {plan.cards.length}…
          </span>
        ) : null}
        <button type="button" className="app-button app-button-secondary app-button-md" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="app-button app-button-primary app-button-md"
          disabled={busy || !plan.cards.length || !plan.mapping.includes("title")}
          onClick={() => void add()}
        >
          {plan.cards.length ? `Add ${plan.cards.length} card${plan.cards.length === 1 ? "" : "s"}` : "Add cards"}
        </button>
      </div>
    </Modal>
  );
}
