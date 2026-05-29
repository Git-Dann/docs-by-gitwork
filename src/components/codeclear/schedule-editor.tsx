"use client";

import { ArrowPathIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCodeClearCandidate,
  useCreatePlacement,
  useDeletePlacement,
  useUpdatePlacement,
} from "@/hooks/use-codeclear";
import { useClientList } from "@/hooks/use-proposals";
import { cn, formatDate } from "@/lib/format";
import type { CodeClearPlacementRecord } from "@/types/codeclear";

/**
 * Dev-scoped schedule editor. Lists every placement (active + upcoming +
 * closed) with inline edit for client, project, dates, allocation %, notes.
 * Add new row + delete. Used by:
 *   - Pipeline (opens in a modal scoped to one dev)
 *   - The dev profile page (Engagements / schedule section)
 *
 * Edits go through the standard Placement endpoints; React Query
 * invalidation in the hooks fans the update out to every surface
 * (registry, Pipeline, profile, Portal client page).
 *
 * Optional `lockClientId` pins the editor to a single client — used by
 * the Portal client view so admins can't accidentally reassign a dev
 * to a different client from inside the client's own page.
 */
export function ScheduleEditor({
  candidateId,
  lockClientId,
  showCandidateColumn = false,
}: {
  candidateId: string;
  /** When set, the client picker is hidden and any new row is created against this clientId. */
  lockClientId?: string;
  /** True when shown inside a Portal client view — surfaces the dev name in the header. */
  showCandidateColumn?: boolean;
}) {
  const candidateQuery = useCodeClearCandidate(candidateId);
  const clientsQuery = useClientList();
  const createMutation = useCreatePlacement(candidateId);
  const updateMutation = useUpdatePlacement(candidateId);
  const deleteMutation = useDeletePlacement(candidateId);

  const candidate = candidateQuery.data?.candidate ?? null;
  const clients = clientsQuery.data?.clients ?? [];
  const placements = candidate?.placements ?? [];

  const [newRowOpen, setNewRowOpen] = useState(false);

  return (
    <div className="space-y-3">
      {showCandidateColumn && candidate ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{candidate.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--text-4)]">
              @{candidate.githubHandle}
            </p>
          </div>
        </div>
      ) : null}

      {candidateQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-12 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
          <div className="h-12 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        </div>
      ) : placements.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
          No scheduled blocks yet. Add one below.
        </div>
      ) : (
        <ul className="space-y-2">
          {placements.map((placement) => (
            <PlacementRow
              key={placement.id}
              placement={placement}
              clients={clients}
              lockClientId={lockClientId}
              isMutating={updateMutation.isPending || deleteMutation.isPending}
              onSave={(input) =>
                updateMutation.mutateAsync({ placementId: placement.id, input })
              }
              onDelete={() => {
                if (window.confirm("Remove this scheduled block?")) {
                  deleteMutation.mutate(placement.id);
                }
              }}
            />
          ))}
        </ul>
      )}

      {newRowOpen ? (
        <NewPlacementRow
          clients={clients}
          lockClientId={lockClientId}
          isSaving={createMutation.isPending}
          onCancel={() => setNewRowOpen(false)}
          onSave={async (input) => {
            await createMutation.mutateAsync({
              clientId: input.clientId,
              clientName: input.clientName,
              projectName: input.projectName,
              startDate: input.startDate,
              endDate: input.endDate,
              allocationPercent: input.allocationPercent,
              notes: input.notes,
            });
            setNewRowOpen(false);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() => setNewRowOpen(true)}
        >
          Add scheduled block
        </Button>
      )}
    </div>
  );
}

// ─── Row components ───────────────────────────────────────────────────────────

type EditFormValue = {
  clientId: string | null;
  clientName: string;
  projectName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // "" or YYYY-MM-DD
  allocationPercent: string; // string for controlled inputs
  notes: string;
};

function toEditValue(placement: CodeClearPlacementRecord): EditFormValue {
  return {
    clientId: placement.clientId,
    clientName: placement.clientName,
    projectName: placement.projectName,
    startDate: placement.startDate.slice(0, 10),
    endDate: placement.endDate ? placement.endDate.slice(0, 10) : "",
    allocationPercent: String(placement.allocationPercent),
    notes: placement.notes ?? "",
  };
}

function PlacementRow({
  placement,
  clients,
  lockClientId,
  isMutating,
  onSave,
  onDelete,
}: {
  placement: CodeClearPlacementRecord;
  clients: Array<{ id: string; name: string }>;
  lockClientId?: string;
  isMutating: boolean;
  onSave: (input: {
    clientId?: string | null;
    clientName?: string;
    projectName?: string;
    startDate?: string;
    endDate?: string | null;
    allocationPercent?: number;
    notes?: string | null;
  }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<EditFormValue>(() => toEditValue(placement));

  function startEdit() {
    setValue(toEditValue(placement));
    setEditing(true);
  }

  async function commit() {
    const next: Parameters<typeof onSave>[0] = {
      projectName: value.projectName,
      startDate: value.startDate,
      endDate: value.endDate || null,
      allocationPercent: Number(value.allocationPercent) || 100,
      notes: value.notes || null,
    };
    if (!lockClientId) {
      next.clientId = value.clientId;
      const matched = clients.find((c) => c.id === value.clientId);
      if (matched) next.clientName = matched.name;
    }
    await onSave(next);
    setEditing(false);
  }

  const isOpenEnded = !placement.endDate;
  const isUpcoming = new Date(placement.startDate).getTime() > Date.now();

  if (!editing) {
    return (
      <li className="flex items-start gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3">
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            placement.endDate
              ? "bg-[var(--text-4)]"
              : isUpcoming
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm font-semibold text-[var(--text-1)]">{placement.clientName}</p>
            <span className="text-xs text-[var(--text-4)]">·</span>
            <p className="truncate text-xs text-[var(--text-3)]">{placement.projectName}</p>
            <span className="ml-auto inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
              {placement.allocationPercent}%
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-[var(--text-4)]">
            {formatDate(placement.startDate)}
            {isOpenEnded ? " → present" : ` → ${formatDate(placement.endDate!)}`}
          </p>
          {placement.notes ? (
            <p className="mt-1 text-xs italic text-[var(--text-4)]">{placement.notes}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="secondary" size="xs" onClick={startEdit}>
            Edit
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="xs"
            leadingIcon={<TrashIcon className="h-3 w-3" />}
            onClick={onDelete}
            disabled={isMutating}
          >
            Delete
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-4 py-3">
      <PlacementEditFields
        value={value}
        onChange={setValue}
        clients={clients}
        lockClientId={lockClientId}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={commit}
          disabled={isMutating || !value.startDate || !value.projectName.trim()}
        >
          Save
        </Button>
      </div>
    </li>
  );
}

function NewPlacementRow({
  clients,
  lockClientId,
  isSaving,
  onSave,
  onCancel,
}: {
  clients: Array<{ id: string; name: string }>;
  lockClientId?: string;
  isSaving: boolean;
  onSave: (input: {
    clientId: string | undefined;
    clientName: string;
    projectName: string;
    startDate: string;
    endDate: string | null;
    allocationPercent: number;
    notes: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [value, setValue] = useState<EditFormValue>({
    clientId: lockClientId ?? null,
    clientName: lockClientId
      ? (clients.find((c) => c.id === lockClientId)?.name ?? "")
      : "",
    projectName: "Active engagement",
    startDate: today,
    endDate: "",
    allocationPercent: "100",
    notes: "",
  });

  async function commit() {
    const matched = clients.find((c) => c.id === value.clientId);
    const clientName = lockClientId
      ? (clients.find((c) => c.id === lockClientId)?.name ?? value.clientName)
      : (matched?.name ?? value.clientName);
    if (!clientName.trim() || !value.projectName.trim() || !value.startDate) return;
    await onSave({
      clientId: value.clientId ?? undefined,
      clientName,
      projectName: value.projectName,
      startDate: value.startDate,
      endDate: value.endDate || null,
      allocationPercent: Number(value.allocationPercent) || 100,
      notes: value.notes || null,
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-4 py-3">
      <PlacementEditFields
        value={value}
        onChange={setValue}
        clients={clients}
        lockClientId={lockClientId}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={commit}
          loading={isSaving}
          disabled={
            isSaving ||
            !value.projectName.trim() ||
            !value.startDate ||
            (!lockClientId && !value.clientId)
          }
          leadingIcon={isSaving ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : null}
        >
          Add block
        </Button>
      </div>
    </div>
  );
}

function PlacementEditFields({
  value,
  onChange,
  clients,
  lockClientId,
}: {
  value: EditFormValue;
  onChange: (next: EditFormValue) => void;
  clients: Array<{ id: string; name: string }>;
  lockClientId?: string;
}) {
  function patch<K extends keyof EditFormValue>(key: K, next: EditFormValue[K]) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {lockClientId ? null : (
        <label className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
            Client
          </span>
          <select
            value={value.clientId ?? ""}
            onChange={(event) => patch("clientId", event.target.value || null)}
            className="app-select h-9 w-full text-xs"
          >
            <option value="">Select a client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Project
        </span>
        <input
          value={value.projectName}
          onChange={(event) => patch("projectName", event.target.value)}
          className="app-input h-9 w-full text-xs"
          placeholder="e.g. Sprint 2 platform"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Start
        </span>
        <input
          type="date"
          value={value.startDate}
          onChange={(event) => patch("startDate", event.target.value)}
          className="app-input h-9 w-full text-xs"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          End <span className="text-[var(--text-4)] normal-case">(blank = open)</span>
        </span>
        <input
          type="date"
          value={value.endDate}
          onChange={(event) => patch("endDate", event.target.value)}
          className="app-input h-9 w-full text-xs"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Allocation %
        </span>
        <input
          type="number"
          min={1}
          max={100}
          value={value.allocationPercent}
          onChange={(event) => patch("allocationPercent", event.target.value)}
          className="app-input h-9 w-full text-xs"
        />
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Notes
        </span>
        <input
          value={value.notes}
          onChange={(event) => patch("notes", event.target.value)}
          className="app-input h-9 w-full text-xs"
          placeholder="Optional"
        />
      </label>
    </div>
  );
}
