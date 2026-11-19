"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { cn } from "@/lib/format";
import { useUpdateTicket } from "@/hooks/use-support";
import type { Ticket, TicketStatus, TicketPriority } from "@/types/support";

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "open",              label: "Open" },
  { status: "in_progress",      label: "In Progress" },
  { status: "dev_review",       label: "Dev Review" },
  { status: "awaiting_customer", label: "Awaiting" },
  { status: "resolved",          label: "Resolved" },
];

const PRIORITY_TONE: Record<TicketPriority, string> = {
  urgent:  "bg-red-100 text-red-700 border-red-200",
  high:    "bg-orange-100 text-orange-700 border-orange-200",
  normal:  "bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border-2)]",
  low:     "bg-[var(--surface-1)] text-[var(--text-4)] border-[var(--border-2)]",
};

const COLUMN_ACCENT: Record<TicketStatus, string> = {
  open:               "border-t-blue-400",
  in_progress:        "border-t-violet-400",
  dev_review:         "border-t-amber-400",
  awaiting_customer:  "border-t-orange-400",
  resolved:           "border-t-emerald-400",
};

// ─── Draggable card ───────────────────────────────────────────────────────────

function TicketCard({ ticket, overlay = false }: { ticket: Ticket; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2.5 shadow-sm transition select-none",
        isDragging && !overlay && "opacity-30",
        overlay && "shadow-md rotate-1 cursor-grabbing",
      )}
    >
      <p className="line-clamp-2 text-xs font-semibold text-[var(--text-1)]">{ticket.title}</p>
      <p className="mt-1 truncate text-[10px] text-[var(--text-4)]">{ticket.customerLabel}</p>
      <div className="mt-2 flex items-center justify-between gap-1">
        <span className={cn("rounded border px-1.5 py-px text-[9px] font-semibold uppercase", PRIORITY_TONE[ticket.priority])}>
          {ticket.priority}
        </span>
        {ticket.issueType && (
          <span className="truncate rounded border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-px text-[9px] text-[var(--text-4)]">
            {ticket.issueType}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Droppable column ─────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  label,
  tickets,
}: {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[12rem] w-[11.5rem] shrink-0 flex-col rounded-[10px] border-t-2 border border-[var(--border-2)] bg-[var(--surface-1)] transition",
        COLUMN_ACCENT[status],
        isOver && "bg-[var(--mist)]",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{label}</span>
        <span className="font-mono text-[10px] text-[var(--text-4)]">{tickets.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tickets.map((t) => <TicketCard key={t.id} ticket={t} />)}
        {tickets.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-[10px] text-[var(--text-4)]">empty</div>
        )}
      </div>
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

export function TicketsKanban({ clientId, tickets }: { clientId: string; tickets: Ticket[] }) {
  const updateTicket = useUpdateTicket(clientId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Optimistic overrides so the card moves instantly before the mutation settles
  const [overrides, setOverrides] = useState<Record<string, TicketStatus>>({});

  const displayed = tickets.map((t) => overrides[t.id] ? { ...t, status: overrides[t.id] } : t);
  const activeTicket = displayed.find((t) => t.id === activeId) ?? null;

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const ticketId = String(active.id);
    const newStatus = String(over.id) as TicketStatus;
    const current = displayed.find((t) => t.id === ticketId);
    if (!current || current.status === newStatus) return;

    setOverrides((prev) => ({ ...prev, [ticketId]: newStatus }));
    updateTicket.mutate(
      { ticketId, data: { status: newStatus } },
      {
        onSettled: () => setOverrides((prev) => {
          const next = { ...prev };
          delete next[ticketId];
          return next;
        }),
      },
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {COLUMNS.map(({ status, label }) => (
          <KanbanColumn
            key={status}
            status={status}
            label={label}
            tickets={displayed.filter((t) => t.status === status)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTicket && <TicketCard ticket={activeTicket} overlay />}
      </DragOverlay>
    </DndContext>
  );
}
