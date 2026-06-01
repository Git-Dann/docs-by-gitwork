"use client";

import { useState } from "react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  useCreateFeatureBlock,
  useUpdateFeatureBlock,
  useDeleteFeatureBlock,
} from "@/hooks/use-tasks";
import { FEATURE_BLOCK_COLORS, type FeatureBlockDTO } from "@/types/tasks";

const SWATCH: Record<string, string> = {
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
};

export function FeatureBlockFormModal({
  block,
  clientId,
  onClose,
}: {
  block?: FeatureBlockDTO | null;
  clientId: string;
  onClose: () => void;
}) {
  const isEdit = Boolean(block);
  const create = useCreateFeatureBlock();
  const update = useUpdateFeatureBlock();
  const del = useDeleteFeatureBlock();

  const [name, setName] = useState(block?.name ?? "");
  const [description, setDescription] = useState(block?.description ?? "");
  const [startDate, setStartDate] = useState(block?.startDate ? block.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(block?.endDate ? block.endDate.slice(0, 10) : "");
  const [color, setColor] = useState<string>(block?.color ?? "blue");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!startDate || !endDate) return setError("Start and end dates are required.");
    if (new Date(endDate) < new Date(startDate)) return setError("End date must be on or after the start date.");
    try {
      if (isEdit && block) {
        await update.mutateAsync({
          id: block.id,
          input: { name: name.trim(), description: description.trim() || null, startDate, endDate, color },
        });
      } else {
        await create.mutateAsync({
          clientId,
          name: name.trim(),
          description: description.trim() || undefined,
          startDate,
          endDate,
          color,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleDelete() {
    if (!block) return;
    await del.mutateAsync(block.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center px-4 py-8">
      <button type="button" className="app-dialog-backdrop absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="app-dialog-panel relative z-10 flex max-h-full w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-6 py-4">
          <div>
            <p className="widget-data-label">{isEdit ? "EDIT BLOCK" : "NEW FEATURE BLOCK"}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {isEdit ? "Update feature block" : "Add a feature block"}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-4)]">
              A block (“list”) is one bar on the timeline. Tasks live inside it.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-4)] hover:text-[var(--text-1)]">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Name</label>
            <input autoFocus className="app-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Onboarding flow" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Description <span className="text-[var(--text-4)]">(optional)</span>
            </label>
            <textarea className="app-textarea w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Start</label>
              <input type="date" className="app-input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">End</label>
              <input type="date" className="app-input w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
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
                <TrashIcon className="h-4 w-4" /> Delete block
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-3)]">Delete? Tasks stay (unassigned).</span>
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
              {isEdit ? "Save" : "Add block"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
