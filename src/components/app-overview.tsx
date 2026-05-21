"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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
  CheckIcon,
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
  { id: "pulse",           label: "Pulse",    defaultSize: { cols: 2, rows: 1 }, component: PulseWidget },
  { id: "codeclear",       label: "Code",     defaultSize: { cols: 1, rows: 1 }, component: CodeClearWidget },
  { id: "study",           label: "Study",    defaultSize: { cols: 1, rows: 1 }, component: StudyWidget },
  { id: "care",            label: "Care",     defaultSize: { cols: 1, rows: 1 }, component: CareWidget },
  { id: "proposals",       label: "Docs",     defaultSize: { cols: 2, rows: 2 }, component: ProposalsWidget },
  { id: "clients",         label: "Portal",   defaultSize: { cols: 1, rows: 2 }, component: ClientsWidget },
  { id: "gmail",           label: "Mail",     defaultSize: { cols: 2, rows: 2 }, component: GmailWidget },
  { id: "calendar",        label: "Calendar", defaultSize: { cols: 1, rows: 2 }, component: CalendarWidget },
  { id: "meeting-summary", label: "Meetings", defaultSize: { cols: 3, rows: 2 }, component: MeetingSummaryWidget },
  { id: "proof",           label: "Proof",    defaultSize: { cols: 1, rows: 1 }, component: ProofWidget },
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
      order:  Array.isArray(parsed.order)  ? (parsed.order  as WidgetId[]) : defaultState().order,
      hidden: Array.isArray(parsed.hidden) ? (parsed.hidden as WidgetId[]) : [],
      sizes:  parsed.sizes && typeof parsed.sizes === "object" ? parsed.sizes : {},
    };
  } catch { return defaultState(); }
}

function defaultState(): PersistedState {
  return { order: WIDGETS.map((w) => w.id), hidden: [], sizes: {} };
}

function saveState(s: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function getSizeFor(id: WidgetId, sizes: Record<string, WidgetSize>): WidgetSize {
  return sizes[id] ?? WIDGET_MAP[id].defaultSize;
}

// ─── Motion transition presets ────────────────────────────────────────────────

const SPRING = { type: "spring", stiffness: 380, damping: 28, mass: 0.7 } as const;
const TWEEN_FAST = { type: "tween", duration: 0.07, ease: "easeOut" } as const;
const INSTANT = { duration: 0 } as const;

// ─── Resize handle ────────────────────────────────────────────────────────────
// No DOM portal — Framer Motion layout animations handle the visual transitions.
// onResize fires only when the snapped cell count actually changes (infrequent).
// onResizeStart / onResizeEnd let BentoCard switch to a faster transition preset
// while the user's hand is on the handle.

interface ResizeHandleProps {
  widgetId: WidgetId;
  currentSize: WidgetSize;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onResize: (id: WidgetId, size: WidgetSize) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}

function ResizeHandle({
  widgetId, currentSize, gridRef, onResize, onResizeStart, onResizeEnd,
}: ResizeHandleProps) {
  const startPos  = useRef<{ x: number; y: number } | null>(null);
  const startSize = useRef<WidgetSize>(currentSize);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    startPos.current  = { x: e.clientX, y: e.clientY };
    startSize.current = currentSize;
    onResizeStart();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!startPos.current || !gridRef.current) return;
    const gridW = gridRef.current.getBoundingClientRect().width;
    const cellW = (gridW - 2 * GAP) / 3;
    const dx    = e.clientX - startPos.current.x;
    const dy    = e.clientY - startPos.current.y;

    // Width at N cols = N*cellW + (N-1)*GAP  →  N = (W + GAP) / (cellW + GAP)
    const startColW = startSize.current.cols * cellW + (startSize.current.cols - 1) * GAP;
    const startRowH = startSize.current.rows * ROW_HEIGHT + (startSize.current.rows - 1) * GAP;

    const newCols = Math.min(3, Math.max(1, Math.round((startColW + dx + GAP) / (cellW + GAP)))) as 1 | 2 | 3;
    const newRows = Math.min(3, Math.max(1, Math.round((startRowH + dy + GAP) / (ROW_HEIGHT + GAP)))) as 1 | 2 | 3;

    if (newCols !== currentSize.cols || newRows !== currentSize.rows) {
      onResize(widgetId, { cols: newCols, rows: newRows });
    }
  }

  function onPointerUp() {
    startPos.current = null;
    onResizeEnd();
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute bottom-1.5 right-1.5 z-10 flex h-5 w-5 cursor-se-resize items-center justify-center rounded-[4px] bg-[var(--accent)] opacity-0 transition-opacity group-hover/card:opacity-100"
      title="Drag to resize"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M7 1L1 7M7 4L4 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── Drag overlay card ────────────────────────────────────────────────────────

function DragOverlayCard({ def, size }: { def: WidgetDef; size: WidgetSize }) {
  const Component = def.component;
  return (
    <motion.div
      initial={{ scale: 1, rotate: 0 }}
      animate={{ scale: 1.04, rotate: 0.7 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="group/card relative overflow-hidden rounded-[12px] border border-[var(--accent)] bg-[var(--surface-0)] p-3 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]"
      style={{ cursor: "grabbing", willChange: "transform" }}
    >
      <div className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-[4px] bg-[var(--accent)] text-white">
        <Bars3Icon className="h-3 w-3" />
      </div>
      <Component size={size} />
    </motion.div>
  );
}

// ─── Bento card ───────────────────────────────────────────────────────────────

interface BentoCardProps {
  def: WidgetDef;
  size: WidgetSize;
  editMode: boolean;
  isDragActive: boolean;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onResize: (id: WidgetId, size: WidgetSize) => void;
  onHide: (id: WidgetId) => void;
}

function BentoCard({ def, size, editMode, isDragActive, gridRef, onResize, onHide }: BentoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition: dndTransition, isDragging } = useSortable({
    id: def.id,
    disabled: !editMode,
  });
  const [isResizing, setIsResizing] = useState(false);

  // Dual ref: dnd-kit needs setNodeRef, resize handle needs the DOM element
  const cardNodeRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => { setNodeRef(node); cardNodeRef.current = node; },
    [setNodeRef],
  );

  // Which Framer Motion transition to use:
  //  - During dnd drag: instant — dnd-kit owns the transforms, no FLIP needed
  //  - During resize: fast tween — responsive to each grid-snap while hand is moving
  //  - Otherwise: spring — elastic, delightful layout changes
  const motionTransition = isDragActive ? INSTANT : isResizing ? TWEEN_FAST : SPRING;

  const Component = def.component;

  return (
    <motion.div
      ref={setRefs}
      layout
      transition={motionTransition}
      // Grid sizing — Framer Motion FLIP interpolates the transition when these change
      style={{
        gridColumn: `span ${size.cols}`,
        gridRow:    `span ${size.rows}`,
        // Hand off transforms to dnd-kit only while a drag is active
        ...(isDragActive && transform
          ? { transform: CSS.Transform.toString(transform), transition: dndTransition }
          : {}),
        opacity:    isDragging ? 0 : 1,
        willChange: "transform",
      }}
      className={cn(
        "group/card relative overflow-hidden rounded-[12px] border bg-[var(--surface-0)] p-3",
        editMode && !isDragging
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]"
          : "border-[var(--border-1)]",
        isDragging && "border-2 border-dashed border-[var(--accent)] bg-[var(--surface-1)]",
      )}
    >
      {editMode && !isDragging && (
        <div
          {...listeners}
          {...attributes}
          className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-grab items-center justify-center rounded-[4px] bg-[var(--accent)] text-white active:cursor-grabbing"
          title="Drag to reorder"
        >
          <Bars3Icon className="h-3 w-3" />
        </div>
      )}

      {editMode && !isDragging && (
        <button
          onClick={() => onHide(def.id)}
          className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-[4px] bg-[var(--border-2)] text-[var(--text-3)] transition-colors hover:bg-red-100 hover:text-red-600"
          title="Hide widget"
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      )}

      {!isDragging && <Component size={size} />}

      {editMode && !isDragging && (
        <ResizeHandle
          widgetId={def.id}
          currentSize={size}
          gridRef={gridRef}
          onResize={onResize}
          onResizeStart={() => setIsResizing(true)}
          onResizeEnd={() => setIsResizing(false)}
        />
      )}
    </motion.div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function AppOverview() {
  const [hydrated, setHydrated]           = useState(false);
  const [state, setState]                 = useState<PersistedState>(defaultState);
  const [editMode, setEditMode]           = useState(false);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [activeId, setActiveId]           = useState<WidgetId | null>(null);
  const gridRef      = useRef<HTMLDivElement>(null);
  const editBaseline = useRef<PersistedState | null>(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  const updateDraft = useCallback((updater: (prev: PersistedState) => PersistedState) => {
    setState((prev) => updater(prev));
  }, []);

  function enterEditMode() {
    editBaseline.current = structuredClone(state);
    setEditMode(true);
  }

  function handleSave() {
    saveState(state);
    editBaseline.current = null;
    setEditMode(false);
    setShowWidgetPicker(false);
  }

  function handleCancel() {
    if (editBaseline.current) setState(editBaseline.current);
    editBaseline.current = null;
    setEditMode(false);
    setShowWidgetPicker(false);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as WidgetId);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateDraft((prev) => {
      const oldIndex = prev.order.indexOf(active.id as WidgetId);
      const newIndex = prev.order.indexOf(over.id as WidgetId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
    });
  }

  function handleDragCancel() { setActiveId(null); }

  function handleResize(id: WidgetId, size: WidgetSize) {
    updateDraft((prev) => ({ ...prev, sizes: { ...prev.sizes, [id]: size } }));
  }

  function handleHide(id: WidgetId) {
    updateDraft((prev) => ({ ...prev, hidden: [...prev.hidden, id] }));
  }

  function handleShow(id: WidgetId) {
    updateDraft((prev) => ({ ...prev, hidden: prev.hidden.filter((h) => h !== id) }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleIds = state.order.filter((id) => !state.hidden.includes(id));
  const hiddenIds  = state.hidden;
  const isDragActive = activeId !== null;

  if (!hydrated) {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: ROW_HEIGHT }}>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-1)]">Foundry HQ</h1>
          <p className="text-xs text-[var(--text-3)]">
            {editMode
              ? "Drag to reorder · resize from the corner · × to hide"
              : "Your workspace at a glance"}
          </p>
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

          <AnimatePresence mode="wait" initial={false}>
            {editMode ? (
              <motion.div
                key="edit-actions"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border-1)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)]"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 rounded-[8px] bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  Save layout
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="customise"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                onClick={enterEditMode}
                className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border-1)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-1)]"
              >
                <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
                Customise
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Hidden widget picker */}
      <AnimatePresence initial={false}>
        {showWidgetPicker && hiddenIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
              <p className="w-full text-[11px] font-medium text-[var(--text-3)]">
                Hidden widgets — click to restore
              </p>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
            <AnimatePresence initial={false}>
              {visibleIds.map((id) => {
                const def = WIDGET_MAP[id];
                if (!def) return null;
                return (
                  <BentoCard
                    key={id}
                    def={def}
                    size={getSizeFor(id, state.sizes)}
                    editMode={editMode}
                    isDragActive={isDragActive}
                    gridRef={gridRef}
                    onResize={handleResize}
                    onHide={handleHide}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </SortableContext>

        {/* Floating drag clone — spring lift on pickup, spring settle on drop */}
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
          {activeId ? (
            <DragOverlayCard
              def={WIDGET_MAP[activeId]}
              size={getSizeFor(activeId, state.sizes)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
