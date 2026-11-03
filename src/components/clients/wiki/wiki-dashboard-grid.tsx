"use client";

/**
 * The dashboard's card grid — arrangeable per person.
 *
 * Three columns, every card one row tall; a card is 1, 2 or 3 columns wide. In Edit mode
 * (the button beside the theme switcher) each card gets a title line with a grab handle
 * on the left and the width picker + hide on the right, and a "Hidden" tray below the grid
 * brings hidden cards back. The rules — and why the layout is per browser — are in
 * `src/lib/wiki-dashboard-layout.ts`.
 *
 * ⚠️ While editing, the card itself is not clickable: dragging a card must not also open
 * its section. Clicks go to the title line's controls only.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUturnLeftIcon, EyeSlashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { DragHandle } from "@/components/proposals/sortable-list";
import {
  EMPTY_LAYOUT,
  clearLayout,
  hideCard,
  isDefaultLayout,
  loadLayout,
  moveCard,
  resolveLayout,
  saveLayout,
  setCardSize,
  showCard,
  spanClasses,
  type CardSize,
  type DashboardLayout,
} from "@/lib/wiki-dashboard-layout";
import { dashboardEdit, useDashboardEdit } from "./dashboard-edit";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

export interface DashboardCardDef {
  id: string;
  /** Shown on the edit title line and in the Hidden tray. */
  label: string;
  /** Rendered with the numeral for its CURRENT position, so the i. ii. iii. run stays in order. */
  render: (numeral: string) => ReactNode;
}

const SIZES: { size: CardSize; label: string }[] = [
  { size: 1, label: "1×1" },
  { size: 2, label: "2×1" },
  { size: 3, label: "3×1" },
];

function SizePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CardSize;
  onChange: (s: CardSize) => void;
}) {
  return (
    // Width only applies from `md` up — below that every card is full width — so the
    // picker is not offered where it would do nothing.
    <div
      role="radiogroup"
      aria-label={`Width of ${label}`}
      className="hidden shrink-0 items-center rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] p-0.5 md:flex"
    >
      {SIZES.map((s) => (
        <button
          key={s.size}
          type="button"
          role="radio"
          aria-checked={value === s.size}
          onClick={() => onChange(s.size)}
          className={`rounded-[4px] px-1.5 py-0.5 text-[10px] tracking-[0.04em] transition-colors ${
            value === s.size
              ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
              : "text-[var(--text-3)] hover:text-[var(--text-1)]"
          }`}
          style={{ fontFamily: MONO }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function SortableCard({
  id,
  label,
  size,
  span,
  editing,
  onSize,
  onHide,
  children,
}: {
  id: string;
  label: string;
  size: CardSize;
  /** Drawn span classes — may be wider than `size` when the card closes a row's gap. */
  span: string;
  editing: boolean;
  onSize: (s: CardSize) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });
  return (
    <div
      ref={setNodeRef}
      data-card={id}
      // ⚠️ Translate, never Transform: `CSS.Transform` also applies the scaleX/scaleY the
      // sorting strategy computes so cards of different widths can swap — which squashes
      // and stretches every card the drag passes over. Cards only ever MOVE here.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${span} flex min-w-0 flex-col ${isDragging ? "relative z-10 opacity-80" : ""}`}
    >
      {editing ? (
        <div className="mb-1.5 flex items-center gap-2 rounded-[8px] border border-dashed border-[var(--brand-500)] bg-[var(--surface-1)] py-1 pl-1 pr-1.5">
          <DragHandle
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${label} to move it`}
          />
          <span
            className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.1em] text-[var(--text-2)]"
            style={{ fontFamily: MONO }}
            title={label}
          >
            {label}
          </span>
          <SizePicker label={label} value={size} onChange={onSize} />
          <button
            type="button"
            onClick={onHide}
            className="shrink-0 rounded-[6px] p-1 text-[var(--text-3)] hover:bg-[var(--surface-0)] hover:text-[var(--text-1)]"
            aria-label={`Hide ${label}`}
            title="Hide this card"
          >
            <EyeSlashIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div
        className={`flex min-h-0 flex-1 flex-col [&>*]:flex-1 ${editing ? "pointer-events-none select-none" : ""}`}
        aria-hidden={editing ? true : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function WikiDashboardGrid({
  wikiId,
  cards,
  roman,
}: {
  wikiId: string;
  /** Available cards in their default order. */
  cards: DashboardCardDef[];
  roman: (n: number) => string;
}) {
  const { editing } = useDashboardEdit();
  const [layout, setLayout] = useState<DashboardLayout>(EMPTY_LAYOUT);

  // Read the saved layout after mount: storage is per browser, so the server renders the
  // default and this swaps in the viewer's own arrangement.
  useEffect(() => setLayout(loadLayout(wikiId)), [wikiId]);

  // Tell the header button there is a dashboard to edit; leaving it ends edit mode.
  useEffect(() => {
    dashboardEdit.setMounted(true);
    return () => dashboardEdit.setMounted(false);
  }, []);

  const ids = useMemo(() => cards.map((c) => c.id), [cards]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const resolved = resolveLayout(layout, ids);
  const spans = spanClasses(resolved.visible.map((c) => c.size));

  function update(next: DashboardLayout) {
    setLayout(next);
    saveLayout(wikiId, next);
  }

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click on the handle is just a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    update(moveCard(layout, ids, String(active.id), String(over.id)));
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={resolved.visible.map((c) => c.id)} strategy={rectSortingStrategy}>
          {/* One column on a phone, two from md, three from lg. Rows size to their tallest
              card, so every card in a row lines up; a card never spans two rows. */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resolved.visible.map((c, i) => {
              const def = byId.get(c.id)!;
              return (
                <SortableCard
                  key={c.id}
                  id={c.id}
                  label={def.label}
                  size={c.size}
                  span={spans[i]}
                  editing={editing}
                  onSize={(s) => update(setCardSize(layout, c.id, s))}
                  onHide={() => update(hideCard(layout, c.id))}
                >
                  {def.render(roman(i + 1))}
                </SortableCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {editing ? (
        <div className="mt-4 rounded-[12px] border border-dashed border-[var(--border-2)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              Hidden {resolved.hidden.length > 0 ? `· ${resolved.hidden.length}` : ""}
            </p>
            <button
              type="button"
              disabled={isDefaultLayout(layout, ids)}
              onClick={() => {
                clearLayout(wikiId);
                setLayout(EMPTY_LAYOUT);
              }}
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)] disabled:opacity-40"
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
              Reset to default
            </button>
          </div>
          {resolved.hidden.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--text-4)]">
              Nothing hidden. Drag cards by their handle, choose a width, or hide what you don&rsquo;t need.
              This layout is saved in this browser, for you only.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {resolved.hidden.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => update(showCard(layout, id))}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] px-2 py-1 text-[12px] text-[var(--text-2)] hover:border-[var(--brand-600)] hover:text-[var(--brand-700)]"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {byId.get(id)?.label ?? id}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
