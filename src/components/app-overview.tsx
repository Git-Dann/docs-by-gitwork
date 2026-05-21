"use client";

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
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AdjustmentsHorizontalIcon,
  Bars3Icon,
  EyeSlashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

import PulseWidget from "@/components/dashboard/pulse-widget";
import CodeClearWidget from "@/components/dashboard/codeclear-widget";
import StudyWidget from "@/components/dashboard/study-widget";
import CareWidget from "@/components/dashboard/care-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import MeetingSummaryWidget from "@/components/dashboard/meeting-summary-widget";
import ProofWidget from "@/components/dashboard/proof-widget";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WidgetSize = { cols: 1 | 2 | 3; rows: 1 | 2 | 3 };

type WidgetId =
  | "pulse"
  | "codeclear"
  | "study"
  | "care"
  | "proposals"
  | "clients"
  | "gmail"
  | "calendar"
  | "meeting-summary"
  | "proof";

interface WidgetDef {
  id: WidgetId;
  label: string;
  defaultSize: WidgetSize;
  component: React.ComponentType<{ size: WidgetSize }>;
}

// ─── Widget registry ──────────────────────────────────────────────────────────

const WIDGETS: WidgetDef[] = [
  { id: "pulse", label: "Pulse", defaultSize: { cols: 2, rows: 1 }, component: PulseWidget },
  { id: "codeclear", label: "Code", defaultSize: { cols: 1, rows: 1 }, component: CodeClearWidget },
  { id: "study", label: "Study", defaultSize: { cols: 1, rows: 1 }, component: StudyWidget },
  { id: "care", label: "Care", defaultSize: { cols: 1, rows: 1 }, component: CareWidget },
  { id: "proposals", label: "Docs", defaultSize: { cols: 2, rows: 2 }, component: ProposalsWidget },
  { id: "clients", label: "Portal", defaultSize: { cols: 1, rows: 2 }, component: ClientsWidget },
  { id: "gmail", label: "Mail", defaultSize: { cols: 2, rows: 2 }, component: GmailWidget },
  { id: "calendar", label: "Calendar", defaultSize: { cols: 1, rows: 2 }, component: CalendarWidget },
  { id: "meeting-summary", label: "Meetings", defaultSize: { cols: 3, rows: 2 }, component: MeetingSummaryWidget },
  { id: "proof", label: "Proof", defaultSize: { cols: 1, rows: 1 }, component: ProofWidget },
];

const WIDGET_MAP = Object.fromEntries(WIDGETS.map((w) => [w.id, w])) as Record<WidgetId, WidgetDef>;

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "gitwork.dashboard.v3";
const ROW_HEIGHT = 180;
const GAP = 12;

interface PersistedState {
  order: WidgetId[];
  hidden: WidgetId[];
  sizes: Record<string, WidgetSize>;
}

function loadState(): PersistedState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      order: Array.isArray(parsed.order) ? (parsed.order as WidgetId[]) : defaultState().order,
      hidden: Array.isArray(parsed.hidden) ? (parsed.hidden as WidgetId[]) : [],
      sizes: parsed.sizes && typeof parsed.sizes === "object" ? parsed.sizes : {},
    };
  } catch {
    return defaultState();
  }
}

function defaultState(): PersistedState {
  return {
    order: WIDGETS.map((w) => w.id),
    hidden: [],
    sizes: {},
  };
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function getSizeFor(id: WidgetId, sizes: Record<string, WidgetSize>): WidgetSize {
  return sizes[id] ?? WIDGET_MAP[id].defaultSize;
}

// ─── Resize handle ────────────────────────────────────────────────────────────

interface ResizeHandleProps {
  widgetId: WidgetId;
  currentSize: WidgetSize;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onResize: (id: WidgetId, size: WidgetSize) => void;
}

function ResizeHandle({ widgetId, currentSize, gridRef, onResize }: ResizeHandleProps) {
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const startSize = useRef<WidgetSize>(currentSize);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = currentSize;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!startPos.current || !gridRef.current) return;
    const gridWidth = gridRef.current.getBoundingClientRect().width;
    const cellW = (gridWidth - GAP * 2) / 3;
    const cellH = ROW_HEIGHT + GAP;

    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    const startColW = startSize.current.cols * cellW + (startSize.current.cols - 1) * GAP;
    const startRowH = startSize.current.rows * ROW_HEIGHT + (startSize.current.rows - 1) * GAP;

    const newCols = Math.min(3, Math.max(1, Math.round((startColW + dx) / cellW))) as 1 | 2 | 3;
    const newRows = Math.min(3, Math.max(1, Math.round((startRowH + dy) / cellH))) as 1 | 2 | 3;

    if (newCols !== currentSize.cols || newRows !== currentSize.rows) {
      onResize(widgetId, { cols: newCols, rows: newRows });
    }
  }

  function onPointerUp() {
    startPos.current = null;
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute bottom-1.5 right-1.5 z-10 flex h-4 w-4 cursor-se-resize items-center justify-center rounded-[3px] bg-[var(--border-2)] opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-[var(--accent)] hover:opacity-100"
      title="Drag to resize"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M7 1L1 7M7 4L4 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── Bento card ───────────────────────────────────────────────────────────────

interface BentoCardProps {
  def: WidgetDef;
  size: WidgetSize;
  editMode: boolean;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onResize: (id: WidgetId, size: WidgetSize) => void;
  onHide: (id: WidgetId) => void;
}

function BentoCard({ def, size, editMode, gridRef, onResize, onHide }: BentoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: def.id,
    disabled: !editMode,
  });

  const style: React.CSSProperties = {
    gridColumn: `span ${size.cols}`,
    gridRow: `span ${size.rows}`,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Component = def.component;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/card relative overflow-hidden rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-0)] p-3",
        editMode && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
        isDragging && "z-50 shadow-xl",
      )}
    >
      {editMode && (
        <div
          {...listeners}
          {...attributes}
          className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-grab items-center justify-center rounded-[4px] bg-[var(--border-2)] text-[var(--text-3)] active:cursor-grabbing"
          title="Drag to reorder"
        >
          <Bars3Icon className="h-3 w-3" />
        </div>
      )}

      {editMode && (
        <button
          onClick={() => onHide(def.id)}
          className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-[4px] bg-[var(--border-2)] text-[var(--text-3)] hover:bg-red-100 hover:text-red-600"
          title="Hide widget"
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      )}

      <Component size={size} />

      {editMode && (
        <ResizeHandle
          widgetId={def.id}
          currentSize={size}
          gridRef={gridRef}
          onResize={onResize}
        />
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function AppOverview() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<PersistedState>(defaultState);
  const [editMode, setEditMode] = useState(false);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    stateRef.current = loaded;
    setHydrated(true);
  }, []);

  const persistState = useCallback((next: PersistedState) => {
    stateRef.current = next;
    saveState(next);
  }, []);

  function updateState(updater: (prev: PersistedState) => PersistedState) {
    setState((prev) => {
      const next = updater(prev);
      persistState(next);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateState((prev) => {
      const oldIndex = prev.order.indexOf(active.id as WidgetId);
      const newIndex = prev.order.indexOf(over.id as WidgetId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
    });
  }

  function handleResize(id: WidgetId, size: WidgetSize) {
    updateState((prev) => ({
      ...prev,
      sizes: { ...prev.sizes, [id]: size },
    }));
  }

  function handleHide(id: WidgetId) {
    updateState((prev) => ({
      ...prev,
      hidden: [...prev.hidden, id],
    }));
  }

  function handleShow(id: WidgetId) {
    updateState((prev) => ({
      ...prev,
      hidden: prev.hidden.filter((h) => h !== id),
    }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleIds = state.order.filter((id) => !state.hidden.includes(id));
  const hiddenIds = state.hidden;

  if (!hydrated) {
    return (
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: ROW_HEIGHT }}
      >
        {WIDGETS.map((w) => (
          <div
            key={w.id}
            className="animate-pulse rounded-[12px] bg-[var(--surface-1)]"
            style={{ gridColumn: `span ${w.defaultSize.cols}`, gridRow: `span ${w.defaultSize.rows}` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-1)]">Foundry HQ</h1>
          <p className="text-xs text-[var(--text-3)]">Your workspace at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          {editMode && hiddenIds.length > 0 && (
            <button
              onClick={() => setShowWidgetPicker((v) => !v)}
              className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border-1)] px-2.5 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-1)]"
            >
              <EyeSlashIcon className="h-3.5 w-3.5" />
              {hiddenIds.length} hidden
            </button>
          )}
          <button
            onClick={() => { setEditMode((v) => !v); setShowWidgetPicker(false); }}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-xs font-medium transition-colors",
              editMode
                ? "bg-[var(--accent)] text-white hover:opacity-90"
                : "border border-[var(--border-1)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
            )}
          >
            <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
            {editMode ? "Done" : "Customise"}
          </button>
        </div>
      </div>

      {showWidgetPicker && hiddenIds.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
          <p className="w-full text-[11px] font-medium text-[var(--text-3)]">Hidden widgets — click to restore</p>
          {hiddenIds.map((id) => (
            <button
              key={id}
              onClick={() => handleShow(id)}
              className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-1)] px-2.5 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            >
              {WIDGET_MAP[id].label}
            </button>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
              gridAutoRows: ROW_HEIGHT,
              gridAutoFlow: "dense",
            }}
          >
            {visibleIds.map((id) => {
              const def = WIDGET_MAP[id];
              if (!def) return null;
              return (
                <BentoCard
                  key={id}
                  def={def}
                  size={getSizeFor(id, state.sizes)}
                  editMode={editMode}
                  gridRef={gridRef}
                  onResize={handleResize}
                  onHide={handleHide}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
