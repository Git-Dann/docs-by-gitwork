"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useSaveBoardColumns } from "@/hooks/use-tasks";
import {
  BOARD_COLUMN_LIMITS,
  columnNameKey,
  newBoardColumnId,
  type BoardColumnDef,
} from "@/lib/tasks/board-columns";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/types/tasks";

/**
 * Add, rename and remove this client's own board columns. Edits are a draft: nothing changes
 * on the board until Save. Removing a column never touches a task — its cards go back to the
 * status column they already count as.
 */
export function BoardColumnsModal({
  clientId,
  columns,
  onClose,
}: {
  clientId: string;
  columns: BoardColumnDef[];
  onClose: () => void;
}) {
  const save = useSaveBoardColumns(clientId);
  const [draft, setDraft] = useState<BoardColumnDef[]>(columns);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<TaskStatus>("DOING");

  const full = draft.length >= BOARD_COLUMN_LIMITS.columns;
  const taken = new Set([
    ...TASK_STATUSES.map((s) => columnNameKey(TASK_STATUS_LABELS[s])),
    ...draft.map((c) => columnNameKey(c.name)),
  ]);
  const clash = Boolean(name.trim()) && taken.has(columnNameKey(name));
  const pending = name.trim() && !full && !clash ? name.trim().slice(0, BOARD_COLUMN_LIMITS.name) : null;
  // A name typed but not yet added is saved too, rather than silently dropped.
  const final = pending ? [...draft, { id: newBoardColumnId(), name: pending, stage }] : draft;
  const keys = final.map((c) => columnNameKey(c.name));
  const named =
    final.every((c) => c.name.trim()) &&
    new Set(keys).size === keys.length &&
    !keys.some((k) => TASK_STATUSES.some((s) => columnNameKey(TASK_STATUS_LABELS[s]) === k));
  const changed = JSON.stringify(final) !== JSON.stringify(columns);

  function add() {
    if (!pending) return;
    setDraft(final);
    setName("");
  }

  const patch = (id: string, p: Partial<BoardColumnDef>) =>
    setDraft((d) => d.map((c) => (c.id === id ? { ...c, ...p } : c)));

  return (
    <Modal open onClose={onClose} title="Board columns" panelClassName="app-dialog-fixed w-full max-w-lg">
      <p className="shrink-0 border-b border-[var(--border-2)] px-5 py-3 text-[13px] text-[var(--text-2)]">
        Each column sits inside a status, so “QA” can count as In review. Standups, the timeline and the
        client&apos;s Delivery page still see the status.
      </p>

      <ul className="min-h-0 flex-1 divide-y divide-[var(--border-2)] overflow-y-auto">
        {draft.length === 0 ? (
          <li className="px-5 py-8 text-center text-[13px] text-[var(--text-4)]">
            Only the five status columns so far. Add one below.
          </li>
        ) : (
          draft.map((c) => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-5 py-2.5 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-center">
              <input
                aria-label="Column name"
                className="app-input text-[16px] sm:text-[13px]"
                value={c.name}
                maxLength={BOARD_COLUMN_LIMITS.name}
                onChange={(e) => patch(c.id, { name: e.target.value })}
              />
              <StageSelect
                value={c.stage}
                onChange={(s) => patch(c.id, { stage: s })}
                className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
              />
              <button
                type="button"
                aria-label={`Remove ${c.name || "column"}`}
                title="Remove — its tasks go back to their status column"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== c.id))}
                className="col-start-2 row-start-1 rounded-[6px] p-2 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)] sm:col-start-auto sm:row-start-auto"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))
        )}
      </ul>

      <form
        className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-[var(--border-2)] px-5 py-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New column name"
          placeholder={full ? `Up to ${BOARD_COLUMN_LIMITS.columns} columns` : "New column, e.g. QA"}
          className="app-input text-[16px] sm:text-[13px]"
          value={name}
          disabled={full}
          maxLength={BOARD_COLUMN_LIMITS.name}
          onChange={(e) => setName(e.target.value)}
        />
        <StageSelect value={stage} onChange={setStage} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          disabled={!pending}
          className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
        >
          Add
        </Button>
      </form>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        {clash || !named ? (
          <p className="mr-auto text-[12px] text-[var(--danger-500)]">Each column needs its own name.</p>
        ) : null}
        <Button type="button" variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!changed || !named}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              final.map((c) => ({ ...c, name: c.name.trim() })),
              { onSuccess: onClose },
            )
          }
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}

function StageSelect({
  value,
  onChange,
  className,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="Counts as"
      className={`app-select w-full ${className ?? ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          Counts as {TASK_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
