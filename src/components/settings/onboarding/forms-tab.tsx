"use client";

import { useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
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
    <div className="space-y-6">
      <SettingsCard
        number="01"
        title="Onboarding forms"
        right={`${forms.length} total`}
        bodyClassName="space-y-5"
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          Each onboarding link is minted from a form. Customise the steps, copy and fields clients
          see at <code className="font-mono text-xs">/onboarding</code> — edit one, or duplicate it
          for a variant. The <strong>Default</strong> form is used for new links unless you pick
          another when minting one.
        </p>

        {/* New form */}
        <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
          <label className="block min-w-0 flex-1">
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
              <li key={form.id} className="rounded-[10px] border border-[var(--border-2)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-1)]">{form.name}</p>
                      {form.isDefault ? (
                        <span className="rounded-[4px] bg-[var(--brand-200)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                          DEFAULT
                        </span>
                      ) : null}
                      {form.isArchived ? (
                        <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                          ARCHIVED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-4)]">
                      {form.stepCount} step{form.stepCount === 1 ? "" : "s"} · {form.linkCount} link
                      {form.linkCount === 1 ? "" : "s"} minted
                      {form.description ? ` · ${form.description}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => duplicate.mutate(form.id)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      onClick={() => void handleDelete(form)}
                    >
                      {form.linkCount > 0 ? "Archive" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leadingIcon={<PencilIcon className="h-3.5 w-3.5" />}
                      onClick={() => onEdit(form.id)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}
