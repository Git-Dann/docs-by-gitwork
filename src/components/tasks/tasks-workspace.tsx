"use client";

import { useMemo, useState } from "react";
import { PlusIcon, Squares2X2Icon, ListBulletIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useClientList } from "@/hooks/use-proposals";
import { useTasks } from "@/hooks/use-tasks";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";

type View = "board" | "list";

export function TasksWorkspace({ initialClientId = "" }: { initialClientId?: string }) {
  const clientsQuery = useClientList();
  const clients = useMemo(() => clientsQuery.data?.clients ?? [], [clientsQuery.data]);

  const [clientId, setClientId] = useState(initialClientId);
  const [mineOnly, setMineOnly] = useState(false);
  const [view, setView] = useState<View>("board");
  const [creating, setCreating] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: tasks = [], isPending } = useTasks({
    clientId: clientId || undefined,
    assigneeId: mineOnly ? "me" : undefined,
  });

  const showClient = !clientId;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="app-select-compact"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
          />
          Mine only
        </label>

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-[6px] border border-[var(--border-2)]">
            <button
              type="button"
              onClick={() => setView("board")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition",
                view === "board"
                  ? "bg-[var(--surface-brand)] text-[var(--brand-800)]"
                  : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
              )}
            >
              <Squares2X2Icon className="h-4 w-4" /> Board
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 border-l border-[var(--border-2)] px-2.5 py-1.5 text-xs font-medium transition",
                view === "list"
                  ? "bg-[var(--surface-brand)] text-[var(--brand-800)]"
                  : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
              )}
            >
              <ListBulletIcon className="h-4 w-4" /> List
            </button>
          </div>
          <Button
            type="button"
            variant="primary"
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setCreating(true)}
          >
            New task
          </Button>
        </div>
      </div>

      {/* Content */}
      {isPending ? (
        <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} showClient={showClient} onCardClick={setOpenTaskId} />
      ) : (
        <TaskList tasks={tasks} showClient={showClient} onRowClick={setOpenTaskId} />
      )}

      {creating ? (
        <TaskFormModal
          defaultClientId={clientId || undefined}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {openTaskId ? (
        <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      ) : null}
    </div>
  );
}
