"use client";

import { ListBulletIcon, Squares2X2Icon, StarIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import type { Ticket, TicketPriority, TicketStatus } from "@/types/support";
import { useBatchUpdateTickets, useSupportTickets, useTicketPerformance, useUpdateTicket } from "@/hooks/use-support";
import { TicketsKanban } from "./care-tickets-kanban";
import { PerformanceStrip } from "./care-performance-strip";
import { PRIORITY_TONE, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE, SourceIcon, formatShort } from "./care-shared";

export function TicketsTableView({ clientId }: { clientId: string }) {
  const [view, setView] = useState<"board" | "table">("table");
  const { data, isLoading } = useSupportTickets(clientId);
  const tickets = data?.tickets ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const updateTicket = useUpdateTicket(clientId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const batchUpdate = useBatchUpdateTickets(clientId);
  const [batchAssign, setBatchAssign] = useState("");
  const [batchError, setBatchError] = useState<string | null>(null);

  // Rolling 30-day performance window for the KPI strip.
  const { perfStart, perfEnd } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { perfStart: start.toISOString().slice(0, 10), perfEnd: end.toISOString().slice(0, 10) };
  }, []);
  const { data: perfData } = useTicketPerformance(clientId, perfStart, perfEnd);

  async function runBatch(data: Partial<{ status: string; priority: string; assignedTo: string }>) {
    setBatchError(null);
    try {
      await batchUpdate.mutateAsync({ ticketIds: Array.from(selectedIds), data });
      clearSelection();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch update failed");
    }
  }

  if (isLoading) {
    return (
      <div className="app-card overflow-hidden p-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={cn("h-12 animate-pulse bg-[var(--surface-1)]", i > 0 && "border-t border-[var(--border-2)]")} />
        ))}
      </div>
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  if (tickets.length === 0) {
    return (
      <div className="app-card flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
        No tickets for this client yet.
      </div>
    );
  }

  const open = tickets.filter((t) => t.status !== "resolved");
  const resolved = tickets.filter((t) => t.status === "resolved");
  const allIds = tickets.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function TicketTable({ rows }: { rows: Ticket[] }) {
    const rowIds = rows.map((t) => t.id);
    const allRowSelected = rowIds.every((id) => selectedIds.has(id));
    return (
      <div className="app-card overflow-hidden p-0">
        {/* column header */}
        <div className="grid grid-cols-[1.5rem_1fr_auto_auto_auto_auto] items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">
          <input
            type="checkbox"
            checked={allRowSelected}
            onChange={() => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                allRowSelected ? rowIds.forEach((id) => next.delete(id)) : rowIds.forEach((id) => next.add(id));
                return next;
              });
            }}
            className="h-3.5 w-3.5 cursor-pointer rounded"
          />
          <span>Title</span>
          <span className="w-20 text-center">Priority</span>
          <span className="w-24 text-right">Updated</span>
          <span className="w-8" />
          <span className="w-36 text-right">Status</span>
        </div>
        {rows.map((ticket) => {
          const isExpanded = expandedId === ticket.id;
          const isSelected = selectedIds.has(ticket.id);
          return (
            <div key={ticket.id} className={cn("border-b border-[var(--border-2)] last:border-b-0", isSelected && "bg-[var(--mist)]")}>
              {/* main row */}
              <div className="grid w-full grid-cols-[1.5rem_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-1)]">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(ticket.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3.5 w-3.5 cursor-pointer rounded"
                />
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">{ticket.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-4)]">{ticket.customerLabel}</span>
                    {ticket.issueType && (
                      <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                        {ticket.issueType}
                      </span>
                    )}
                    <span className="flex items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                      <SourceIcon source={ticket.source} className="h-3 w-3" />
                      {SOURCE_LABEL[ticket.source]}
                    </span>
                  </div>
                </button>
                <span className={cn("inline-flex w-20 items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold", PRIORITY_TONE[ticket.priority])}>
                  {ticket.priority}
                </span>
                <span className="w-24 text-right text-[11px] text-[var(--text-4)]">{formatShort(ticket.updatedAt)}</span>
                {/* chevron */}
                <button type="button" onClick={() => setExpandedId(isExpanded ? null : ticket.id)} className="flex w-8 justify-center text-[var(--text-4)]">
                  <svg className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {/* status dropdown */}
                <div className="flex w-36 justify-end">
                  <select
                    value={ticket.status}
                    onChange={(e) => updateTicket.mutate({ ticketId: ticket.id, data: { status: e.target.value as TicketStatus } })}
                    className={cn(
                      "app-select-chevron cursor-pointer rounded-md border py-0.5 pl-2 pr-6 text-[10px] font-semibold outline-none transition",
                      STATUS_TONE[ticket.status],
                    )}
                  >
                    {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* expanded detail */}
              {isExpanded && (
                <div className="border-t border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                    {ticket.nextAction && (
                      <div className="min-w-[12rem]">
                        <p className="font-semibold text-[var(--text-3)]">Next action</p>
                        <p className="mt-0.5 text-[var(--text-2)]">{ticket.nextAction}</p>
                      </div>
                    )}
                    {ticket.assignedTo && (
                      <div>
                        <p className="font-semibold text-[var(--text-3)]">Assigned to</p>
                        <p className="mt-0.5 text-[var(--text-2)]">{ticket.assignedTo}</p>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-[var(--text-3)]">Quality (CSAT)</p>
                      <div className="mt-1 flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            title={`Rate ${star}/5`}
                            onClick={() => updateTicket.mutate({
                              ticketId: ticket.id,
                              data: { csatScore: ticket.csatScore === star ? null : star },
                            })}
                            className={cn(
                              "transition",
                              (ticket.csatScore ?? 0) >= star
                                ? "text-amber-400"
                                : "text-[var(--border-2)] hover:text-amber-300",
                            )}
                          >
                            <StarIcon className="h-4 w-4 fill-current" />
                          </button>
                        ))}
                        {ticket.csatScore && (
                          <span className="ml-1.5 text-[10px] text-[var(--text-4)]">{ticket.csatScore}/5</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 30-day performance KPIs */}
      {perfData?.metrics && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
              PERFORMANCE // LAST 30 DAYS
            </span>
          </div>
          <PerformanceStrip metrics={perfData.metrics} />
        </div>
      )}

      {/* view toggle */}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setView("table")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-[6px] transition",
            view === "table" ? "bg-[var(--mist)] text-[var(--brand-700)]" : "text-[var(--text-4)] hover:bg-[var(--surface-1)]",
          )}
          title="List view"
        >
          <ListBulletIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setView("board")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-[6px] transition",
            view === "board" ? "bg-[var(--mist)] text-[var(--brand-700)]" : "text-[var(--text-4)] hover:bg-[var(--surface-1)]",
          )}
          title="Board view"
        >
          <Squares2X2Icon className="h-4 w-4" />
        </button>
      </div>

      {view === "board" ? (
        <TicketsKanban clientId={clientId} tickets={tickets} />
      ) : (
        <>
          {/* Select-all row */}
          {tickets.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--text-3)]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    setSelectedIds(allSelected ? new Set() : new Set(allIds));
                  }}
                  className="h-3.5 w-3.5 cursor-pointer rounded"
                />
                {allSelected ? "Deselect all" : "Select all"}
              </label>
              {someSelected && (
                <span className="text-[11px] text-[var(--text-4)]">{selectedIds.size} selected</span>
              )}
            </div>
          )}

          {open.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">
                Open · {open.length}
              </p>
              <TicketTable rows={open} />
            </div>
          )}
          {resolved.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-4)]">
                Resolved · {resolved.length}
              </p>
              <TicketTable rows={resolved} />
            </div>
          )}

          {/* Batch bar */}
          {someSelected && (
            <div className="sticky bottom-4 z-20 flex flex-col gap-1.5">
              {batchError && (
                <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-1 text-[11px] text-red-600">{batchError}</p>
              )}
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-2.5 shadow-lg">
                <span className="text-[11px] font-semibold text-[var(--text-2)]">{selectedIds.size} selected</span>
                <div className="h-4 w-px bg-[var(--border-2)]" />
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const val = e.target.value;
                    e.target.value = "";
                    void runBatch({ status: val });
                  }}
                  className="app-select-compact h-7 !min-h-0 w-auto bg-[var(--surface-1)] text-[11px]"
                >
                  <option value="">Set status…</option>
                  {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const val = e.target.value;
                    e.target.value = "";
                    void runBatch({ priority: val });
                  }}
                  className="app-select-compact h-7 !min-h-0 w-auto bg-[var(--surface-1)] text-[11px]"
                >
                  <option value="">Set priority…</option>
                  {(["urgent", "high", "normal", "low"] as TicketPriority[]).map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <input
                    value={batchAssign}
                    onChange={(e) => setBatchAssign(e.target.value)}
                    placeholder="Assign to…"
                    className="h-7 w-32 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-[11px] text-[var(--text-1)] outline-none focus:border-[var(--brand-700)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && batchAssign.trim()) {
                        void runBatch({ assignedTo: batchAssign.trim() }).then(() => setBatchAssign(""));
                      }
                    }}
                  />
                  {batchAssign.trim() && (
                    <button
                      type="button"
                      onClick={() => void runBatch({ assignedTo: batchAssign.trim() }).then(() => setBatchAssign(""))}
                      className="h-7 rounded-[6px] border border-[var(--border-2)] bg-[var(--brand-700)] px-2 text-[11px] font-medium text-white transition hover:bg-[var(--brand-800)]"
                    >
                      Assign
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-4)] hover:bg-[var(--surface-1)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
