"use client";

/**
 * Settings → Launchpad. The list half; `LaunchpadTemplateBuilder` is the editor.
 *
 * Deliberately the same shape as Settings → Onboarding (`forms-tab.tsx`), down to the
 * archive-when-assigned copy, because they are the same operator task: maintaining a
 * master template that live client records have snapshotted.
 */

import { useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  useCreateLaunchpadTemplate,
  useDeleteLaunchpadTemplate,
  useDuplicateLaunchpadTemplate,
  useLaunchpadTemplates,
} from "@/hooks/use-launchpad";
import type { LaunchpadTemplateSummary } from "@/types/launchpad";
import { LaunchpadTemplateBuilder } from "./template-builder";

export function LaunchpadTemplatesTab() {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (editingId) {
    return <LaunchpadTemplateBuilder templateId={editingId} onBack={() => setEditingId(null)} />;
  }
  return <TemplatesList onEdit={setEditingId} />;
}

function TemplatesList({ onEdit }: { onEdit: (id: string) => void }) {
  const { data, isPending } = useLaunchpadTemplates();
  const create = useCreateLaunchpadTemplate();
  const duplicate = useDuplicateLaunchpadTemplate();
  const remove = useDeleteLaunchpadTemplate();
  const [newName, setNewName] = useState("");

  const templates = data?.templates ?? [];

  const handleCreate = async () => {
    const name = newName.trim() || "Untitled Launchpad";
    const { template } = await create.mutateAsync({ name });
    setNewName("");
    onEdit(template.id);
  };

  const handleDelete = async (template: LaunchpadTemplateSummary) => {
    if (template.isDefault) {
      window.alert(
        "This is the default template. Make another template the default before deleting it.",
      );
      return;
    }
    const willArchive = template.kitCount > 0;
    const msg = willArchive
      ? `"${template.name}" is assigned to ${template.kitCount} client${template.kitCount === 1 ? "" : "s"}, so it will be archived (hidden) rather than deleted — their kits keep working from their own frozen copy. Continue?`
      : `Delete "${template.name}"? This can't be undone.`;
    if (!window.confirm(msg)) return;
    await remove.mutateAsync(template.id);
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        number="01"
        title="Launchpad templates"
        right={`${templates.length} total`}
        bodyClassName="space-y-5"
      >
        <p className="text-sm leading-6 text-[var(--text-3)]">
          A Launchpad is the tracked list of everything we need <strong>from</strong> a client to
          start and ship — accounts, assets, legal copy — plus the fillable boilerplate policies.
          Edit the modules and requirements here; each client&apos;s kit <strong>freezes a copy</strong>{" "}
          when it is assigned, so changes you make never disturb a client already working through
          theirs.
        </p>

        <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
          <label className="block min-w-0 flex-1">
            <span className="app-field-label">New template name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              className="app-input mt-1 text-sm"
              placeholder="e.g. Mobile-only Launchpad"
            />
          </label>
          <Button
            variant="primary"
            size="md"
            loading={create.isPending}
            onClick={() => void handleCreate()}
          >
            New template
          </Button>
        </div>

        {isPending ? (
          <p className="text-sm text-[var(--text-4)]">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-sm text-[var(--text-4)]">
            No Launchpad templates yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-1)]">{template.name}</p>
                      {template.isDefault ? (
                        <span className="rounded-[4px] bg-[var(--brand-200)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                          DEFAULT
                        </span>
                      ) : null}
                      {template.isArchived ? (
                        <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                          ARCHIVED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-4)]">
                      {template.moduleCount} module{template.moduleCount === 1 ? "" : "s"} ·{" "}
                      {template.itemCount} requirement{template.itemCount === 1 ? "" : "s"} ·{" "}
                      {template.kitCount} client{template.kitCount === 1 ? "" : "s"} assigned
                      {template.description ? ` · ${template.description}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => duplicate.mutate(template.id)}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      onClick={() => void handleDelete(template)}
                    >
                      {template.kitCount > 0 ? "Archive" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leadingIcon={<PencilIcon className="h-3.5 w-3.5" />}
                      onClick={() => onEdit(template.id)}
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
