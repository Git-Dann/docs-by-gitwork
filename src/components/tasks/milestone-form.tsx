"use client";

import { useState } from "react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
} from "@/hooks/use-tasks";
import { FEATURE_BLOCK_COLORS, type MilestoneDTO } from "@/types/tasks";

const SWATCH: Record<string, string> = {
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};

export function MilestoneFormModal({
  milestone,
  clientId,
  onClose,
}: {
  milestone?: MilestoneDTO | null;
  clientId: string;
  onClose: () => void;
}) {
  const isEdit = Boolean(milestone);
  const create = useCreateMilestone();
  const update = useUpdateMilestone();
  const del = useDeleteMilestone();

  const [name, setName] = useState(milestone?.name ?? "");
  const [date, setDate] = useState(milestone?.date ? milestone.date.slice(0, 10) : "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [color, setColor] = useState<string>(milestone?.color ?? "violet");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!date) return setError("A date is required.");
    try {
      if (isEdit && milestone) {
        await update.mutateAsync({
          id: milestone.id,
          input: { name: name.trim(), date, description: description.trim() || null, color },
        });
      } else {
        await create.mutateAsync({
          clientId,
          name: name.trim(),
          date,
          description: description.trim() || undefined,
          color,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleDelete() {
    if (!milestone) return;
    await del.mutateAsync(milestone.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center px-4 py-8">
      <button type="button" className="app-dialog-backdrop absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="app-dialog-panel relative z-10 flex max-h-full w-full max-w-md flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
          <div>
            <p className="widget-data-label">{isEdit ? "EDIT MILESTONE" : "NEW MILESTONE"}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {isEdit ? "Update milestone" : "Add a milestone"}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-4)]">A single-date marker on the timeline.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-4)] hover:text-[var(--text-1)]">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Name</label>
            <input autoFocus className="app-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beta launch" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Date</label>
            <input type="date" className="app-input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Description <span className="text-[var(--text-4)]">(optional)</span>
            </label>
            <textarea className="app-textarea w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Colour</label>
            <div className="flex gap-2">
              {FEATURE_BLOCK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 transition",
                    SWATCH[c],
                    color === c ? "ring-2 ring-[var(--brand-600)]" : "ring-0 hover:opacity-80",
                  )}
                />
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-[var(--danger-500)]">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-2)] px-6 py-4">
          {isEdit ? (
            !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-4)] transition hover:text-[var(--danger-500)]"
              >
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-3)]">Delete milestone?</span>
                <Button type="button" variant="danger" onClick={handleDelete} loading={del.isPending}>
                  Yes
                </Button>
                <Button type="button" variant="tertiary" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
              </div>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleSave} loading={saving}>
              {isEdit ? "Save" : "Add milestone"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
