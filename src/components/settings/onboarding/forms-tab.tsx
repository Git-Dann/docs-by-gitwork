"use client";

import { useState } from "react";
import {
  PlusIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  TrashIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  useOnboardingForms,
  useCreateOnboardingForm,
  useDuplicateOnboardingForm,
  useDeleteOnboardingForm,
} from "@/hooks/use-onboarding-forms";
import type { OnboardingFormSummary } from "@/types/onboarding";
import { OnboardingFormBuilder } from "./form-builder";

export function OnboardingFormsTab() {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (editingId) {
    return <OnboardingFormBuilder formId={editingId} onBack={() => setEditingId(null)} />;
  }
  return <FormsList onEdit={setEditingId} />;
}

function FormsList({ onEdit }: { onEdit: (id: string) => void }) {
  const { data, isPending } = useOnboardingForms();
  const create = useCreateOnboardingForm();
  const duplicate = useDuplicateOnboardingForm();
  const remove = useDeleteOnboardingForm();
  const [newName, setNewName] = useState("");

  const forms = data?.forms ?? [];

  const handleCreate = async () => {
    const name = newName.trim() || "Untitled onboarding";
    const { form } = await create.mutateAsync({ name });
    setNewName("");
    onEdit(form.id);
  };

  const handleDelete = async (form: OnboardingFormSummary) => {
    if (form.isDefault) {
      window.alert("This is the default form. Make another form the default before deleting it.");
      return;
    }
    const willArchive = form.linkCount > 0;
    const msg = willArchive
      ? `"${form.name}" has ${form.linkCount} link(s) minted from it, so it will be archived (hidden) rather than deleted. Continue?`
      : `Delete "${form.name}"? This can't be undone.`;
    if (!window.confirm(msg)) return;
    await remove.mutateAsync(form.id);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-1)]">Onboarding forms</h2>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Customise the steps, copy and fields clients see at <code className="text-xs">/onboarding</code>. The
          <strong> default</strong> form is used for new links unless you pick another when minting one.
        </p>
      </div>

      {/* New form */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="app-field-label">New form name</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            className="app-input mt-1 text-sm"
            placeholder="e.g. Enterprise onboarding"
          />
        </label>
        <Button variant="primary" size="md" loading={create.isPending} onClick={() => void handleCreate()}>
          <PlusIcon className="h-4 w-4" />
          New form
        </Button>
      </div>

      {/* List */}
      {isPending ? (
        <p className="text-sm text-[var(--text-4)]">Loading forms…</p>
      ) : forms.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-sm text-[var(--text-4)]">
          No onboarding forms yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {forms.map((form) => (
            <li
              key={form.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">{form.name}</p>
                  {form.isDefault && (
                    <span className="rounded-full bg-[var(--brand-200)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-800)]">
                      Default
                    </span>
                  )}
                  {form.isArchived && (
                    <span className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-4)]">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-4)]">
                  {form.stepCount} step{form.stepCount === 1 ? "" : "s"} · {form.linkCount} link
                  {form.linkCount === 1 ? "" : "s"} minted
                  {form.description ? ` · ${form.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onEdit(form.id)}
                  className="app-button app-button-secondary app-button-sm"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => duplicate.mutate(form.id)}
                  className="app-button app-button-tertiary app-button-sm"
                  aria-label="Duplicate form"
                  title="Duplicate"
                >
                  <DocumentDuplicateIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(form)}
                  className="app-button app-button-tertiary app-button-sm text-[var(--text-4)] hover:text-[var(--danger-500)]"
                  aria-label={form.linkCount > 0 ? "Archive form" : "Delete form"}
                  title={form.linkCount > 0 ? "Archive" : "Delete"}
                >
                  {form.linkCount > 0 ? <ArchiveBoxIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
