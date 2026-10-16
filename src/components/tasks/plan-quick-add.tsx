"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { useClientList } from "@/hooks/use-proposals";
import { useTasks } from "@/hooks/use-tasks";
import { matchPlannedTasks } from "@/lib/tasks/plan-match";
import { PlanMatchList } from "@/components/tasks/plan-matches";
import { TaskFormModal } from "@/components/tasks/task-form";
import type { TaskDTO } from "@/types/tasks";

/**
 * My Day's "What are you working on?" — the place a developer reaches for when the day
 * starts. Typing checks the client's board first and offers the planned task to pick up;
 * only when it really is new work does it open the task form (with the category step).
 *
 * This replaces the habit the October 2026 audit found: open the board, create a task
 * named after today's work, close it at 6pm. The work was real; it just never touched
 * the plan.
 */
export function PlanQuickAdd({ myTasks }: { myTasks: TaskDTO[] }) {
  const me = useAccount().data?.id ?? null;
  const clientsQuery = useClientList();
  const allClients = useMemo(() => clientsQuery.data?.clients ?? [], [clientsQuery.data]);

  // The clients this developer is actually working on, busiest first; then everyone else.
  const clients = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of myTasks) counts.set(t.client.id, (counts.get(t.client.id) ?? 0) + 1);
    return [...allClients].sort(
      (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name),
    );
  }, [allClients, myTasks]);
  const busiest = clients[0]?.id ?? "";

  const [title, setTitle] = useState("");
  const [chosenClient, setChosenClient] = useState<string | null>(null);
  const clientId = chosenClient ?? busiest;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const board = useTasks({ clientId: clientId || undefined }, { enabled: Boolean(clientId) });
  const deferred = useDeferredValue(title);
  const clientName = clients.find((c) => c.id === clientId)?.name;
  const matches = useMemo(() => {
    if (deferred.trim() === dismissedFor) return [];
    const open = (board.data ?? []).filter((t) => t.status !== "DONE" && !t.archivedAt && !t.parentId);
    return matchPlannedTasks(
      deferred,
      open.map((t) => ({ ...t, categoryName: t.featureBlock?.name ?? null })),
      { ignoreWords: clientName },
    );
  }, [board.data, deferred, dismissedFor, clientName]);

  const typed = title.trim();
  function addNew() {
    if (!typed || !clientId) return;
    setCreating(typed);
  }

  if (clients.length === 0) return null;

  return (
    <div className="space-y-2">
      <label htmlFor="plan-quick-add" className="block text-xs font-semibold text-[var(--text-1)]">
        What are you working on?
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="plan-quick-add"
          className="app-input min-w-[200px] flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches.length === 0) {
              e.preventDefault();
              addNew();
            }
          }}
          placeholder="e.g. Audio download progress indicator"
        />
        {clients.length > 1 ? (
          <select
            aria-label="Client"
            className="app-select w-auto max-w-[180px]"
            value={clientId}
            onChange={(e) => setChosenClient(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <PlanMatchList
        matches={matches}
        onDismiss={() => setDismissedFor(deferred.trim())}
        onPickedUp={() => {
          setTitle("");
          setDismissedFor(null);
        }}
      />
      {typed ? (
        <Button
          type="button"
          size="sm"
          variant={matches.length > 0 ? "tertiary" : "secondary"}
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={addNew}
          disabled={!clientId}
        >
          {matches.length > 0 ? "None of these — add it as a new task" : "Add as a new task"}
        </Button>
      ) : null}
      {creating !== null ? (
        <TaskFormModal
          defaultClientId={clientId}
          defaultTitle={creating}
          defaultStatus="DOING"
          defaultAssigneeIds={me ? [me] : []}
          skipPlanMatches
          onSaved={() => {
            setTitle("");
            setDismissedFor(null);
          }}
          onClose={() => setCreating(null)}
        />
      ) : null}
    </div>
  );
}
