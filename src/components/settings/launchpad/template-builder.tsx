"use client";

/**
 * Launchpad template builder — the operator edits modules and requirements here.
 *
 * Two conventions from DESIGN.md that this screen has to honour, both of which are
 * about the narrow column it renders in:
 *   · **Fields stack, they are never crammed horizontally.** Rows holding a select or
 *     a text input go label-above-control, full width.
 *   · **Container queries, not viewport breakpoints**, for the field grids — a
 *     `sm:grid-cols-2` here keys off the WINDOW, not off the panel, so it would put
 *     two fields side by side in a 340px column on a wide screen.
 *
 * Edits are held locally and saved explicitly. An autosave-per-keystroke on a master
 * template is the wrong trade: this is the document every future client kit is minted
 * from, so a half-typed label should not be what a new kit freezes.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { useToast } from "@/components/ui/toast";
import { useLaunchpadTemplate, useUpdateLaunchpadTemplate } from "@/hooks/use-launchpad";
import { LAUNCHPAD_FIELD_TYPE_REGISTRY } from "@/lib/launchpad/field-types";
import { allFields } from "@/lib/launchpad/structure";
import { LAUNCHPAD_DOC_KEYS } from "@/types/launchpad";
import type {
  LaunchpadFieldDef,
  LaunchpadFieldType,
  LaunchpadModule,
  LaunchpadStructure,
} from "@/types/launchpad";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** Types offered in the palette, in the order an operator reaches for them. */
const PALETTE: LaunchpadFieldType[] = [
  "checklist_item",
  "link",
  "short_text",
  "long_text",
  "email",
  "url",
  "select",
  "checkbox",
  "legal_doc",
  "static",
];

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** A structure-unique id. The id is the answer key AND the `LaunchpadItem.itemId`, so
 *  a collision would make two requirements share one status row. */
function freshId(structure: LaunchpadStructure, base: string): string {
  const taken = new Set(allFields(structure).map((f) => f.id));
  let candidate = base;
  for (let i = 2; taken.has(candidate); i += 1) candidate = `${base}_${i}`;
  return candidate;
}

export function LaunchpadTemplateBuilder({
  templateId,
  onBack,
}: {
  templateId: string;
  onBack: () => void;
}) {
  const { data, isPending } = useLaunchpadTemplate(templateId);
  const update = useUpdateLaunchpadTemplate();
  const toast = useToast();

  const [structure, setStructure] = useState<LaunchpadStructure | null>(null);
  const [name, setName] = useState("");
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const template = data?.template;

  useEffect(() => {
    if (!template) return;
    setStructure(template.structure);
    setName(template.name);
    setOpenModule(template.structure.modules[0]?.id ?? null);
    setDirty(false);
  }, [template]);

  const itemCount = useMemo(
    () =>
      structure ? allFields(structure).filter((f) => f.type === "checklist_item").length : 0,
    [structure],
  );

  const edit = (next: LaunchpadStructure) => {
    setStructure(next);
    setDirty(true);
  };

  const patchModule = (moduleId: string, patch: Partial<LaunchpadModule>) => {
    if (!structure) return;
    edit({
      modules: structure.modules.map((m) => (m.id === moduleId ? { ...m, ...patch } : m)),
    });
  };

  const patchField = (moduleId: string, fieldId: string, patch: Partial<LaunchpadFieldDef>) => {
    if (!structure) return;
    edit({
      modules: structure.modules.map((m) =>
        m.id === moduleId
          ? { ...m, fields: m.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
          : m,
      ),
    });
  };

  const addField = (moduleId: string, type: LaunchpadFieldType) => {
    if (!structure) return;
    const base = LAUNCHPAD_FIELD_TYPE_REGISTRY[type].makeDefault();
    const id = freshId(structure, type === "checklist_item" ? "requirement" : type);
    edit({
      modules: structure.modules.map((m) =>
        m.id === moduleId ? { ...m, fields: [...m.fields, { ...base, id }] } : m,
      ),
    });
  };

  const removeField = (moduleId: string, fieldId: string) => {
    if (!structure) return;
    edit({
      modules: structure.modules.map((m) =>
        m.id === moduleId ? { ...m, fields: m.fields.filter((f) => f.id !== fieldId) } : m,
      ),
    });
  };

  const moveField = (moduleId: string, index: number, delta: number) => {
    if (!structure) return;
    edit({
      modules: structure.modules.map((m) =>
        m.id === moduleId ? { ...m, fields: move(m.fields, index, index + delta) } : m,
      ),
    });
  };

  const addModule = () => {
    if (!structure) return;
    const taken = new Set(structure.modules.map((m) => m.id));
    let id = "module";
    for (let i = 2; taken.has(id); i += 1) id = `module_${i}`;
    edit({
      modules: [...structure.modules, { id, title: "New module", blurb: "", fields: [] }],
    });
    setOpenModule(id);
  };

  const removeModule = (moduleId: string) => {
    if (!structure) return;
    // Named `target`, not `module` — `no-assign-module-variable` forbids assigning to
    // `module` because it shadows the CommonJS binding Next relies on.
    const target = structure.modules.find((m) => m.id === moduleId);
    if (!target) return;
    if (
      !window.confirm(
        `Remove "${target.title}" and its ${target.fields.length} field(s) from this template? Kits already assigned keep their own frozen copy.`,
      )
    )
      return;
    edit({ modules: structure.modules.filter((m) => m.id !== moduleId) });
  };

  const save = async () => {
    if (!structure) return;
    try {
      await update.mutateAsync({ id: templateId, name: name.trim() || "Untitled Launchpad", structure });
      setDirty(false);
      toast.success("Template saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the template.");
    }
  };

  if (isPending || !structure || !template) {
    return <p className="text-sm text-[var(--text-4)]">Loading template…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          leadingIcon={<ArrowLeftIcon className="h-3.5 w-3.5" />}
          onClick={onBack}
        >
          All templates
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span className="text-xs text-[var(--warning-500)]" style={{ fontFamily: MONO }}>
              UNSAVED CHANGES
            </span>
          ) : null}
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={update.isPending}
            disabled={!dirty}
            onClick={() => void save()}
          >
            Save template
          </Button>
        </div>
      </div>

      <SettingsCard number="01" title="Template" bodyClassName="space-y-4">
        {/* Stacked, not crammed — DESIGN.md's rail rule. */}
        <label className="block">
          <span className="app-field-label">Name</span>
          <input
            className="app-input mt-1 text-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <p className="text-xs text-[var(--text-4)]">
          {structure.modules.length} module{structure.modules.length === 1 ? "" : "s"} ·{" "}
          {itemCount} requirement{itemCount === 1 ? "" : "s"} · assigned to {template.kitCount}{" "}
          client{template.kitCount === 1 ? "" : "s"}
        </p>
        {template.kitCount > 0 ? (
          <p className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs leading-relaxed text-[var(--text-3)]">
            {template.kitCount} client kit{template.kitCount === 1 ? "" : "s"} were minted from this
            template and hold their own frozen copy. Saving changes here affects{" "}
            <strong>new assignments only</strong> — nobody mid-way through their Launchpad will see
            their questions change under them.
          </p>
        ) : null}
      </SettingsCard>

      <SettingsCard
        number="02"
        title="Modules"
        right={
          <button
            type="button"
            onClick={addModule}
            className="app-button app-button-secondary app-button-xs"
          >
            <PlusIcon className="h-3 w-3" />
            Module
          </button>
        }
        bodyClassName="space-y-2"
      >
        {structure.modules.map((module, moduleIndex) => {
          const open = openModule === module.id;
          return (
            <div
              key={module.id}
              className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]"
            >
              {/* Header row: controls sit in their own row, never beside the fields. */}
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenModule(open ? null : module.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-sm font-medium text-[var(--text-1)]">{module.title}</span>
                  <span className="ml-2 text-xs text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                    {module.fields.length} FIELD{module.fields.length === 1 ? "" : "S"}
                    {module.alwaysOn ? " · ALWAYS ON" : ""}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Move module up"
                    className="app-button app-button-tertiary app-button-icon-sm"
                    onClick={() => edit({ modules: move(structure.modules, moduleIndex, moduleIndex - 1) })}
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move module down"
                    className="app-button app-button-tertiary app-button-icon-sm"
                    onClick={() => edit({ modules: move(structure.modules, moduleIndex, moduleIndex + 1) })}
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove module"
                    className="app-button app-button-tertiary app-button-icon-sm"
                    onClick={() => removeModule(module.id)}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {open ? (
                <div className="space-y-4 border-t border-[var(--border-1)] p-3">
                  <label className="block">
                    <span className="app-field-label">Module title</span>
                    <input
                      className="app-input mt-1 text-sm"
                      value={module.title}
                      onChange={(e) => patchModule(module.id, { title: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="app-field-label">Intro line</span>
                    <textarea
                      className="app-textarea mt-1 text-sm"
                      rows={2}
                      value={module.blurb ?? ""}
                      onChange={(e) => patchModule(module.id, { blurb: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={Boolean(module.alwaysOn)}
                      onChange={(e) => patchModule(module.id, { alwaysOn: e.target.checked })}
                    />
                    <span className="text-sm text-[var(--text-2)]">
                      Always on — can&apos;t be switched off per client
                    </span>
                  </label>

                  <div className="space-y-2">
                    {module.fields.map((field, fieldIndex) => (
                      <FieldEditor
                        key={field.id}
                        field={field}
                        onPatch={(patch) => patchField(module.id, field.id, patch)}
                        onRemove={() => removeField(module.id, field.id)}
                        onMove={(delta) => moveField(module.id, fieldIndex, delta)}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-1)] pt-3">
                    <span
                      className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]"
                      style={{ fontFamily: MONO }}
                    >
                      Add
                    </span>
                    {PALETTE.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addField(module.id, type)}
                        className="app-button app-button-secondary app-button-xs"
                      >
                        {LAUNCHPAD_FIELD_TYPE_REGISTRY[type].displayName}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </SettingsCard>
    </div>
  );
}

function FieldEditor({
  field,
  onPatch,
  onRemove,
  onMove,
}: {
  field: LaunchpadFieldDef;
  onPatch: (patch: Partial<LaunchpadFieldDef>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const meta = LAUNCHPAD_FIELD_TYPE_REGISTRY[field.type];

  return (
    <div className="rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-2.5">
      {/* ItemCard grammar: move/delete in a header row, label min-w-0 truncate. */}
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-4)]"
          style={{ fontFamily: MONO }}
        >
          {meta.displayName}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-3)]">{field.id}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="Move field up"
            className="app-button app-button-tertiary app-button-icon-sm"
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Move field down"
            className="app-button app-button-tertiary app-button-icon-sm"
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Remove field"
            className="app-button app-button-tertiary app-button-icon-sm"
            onClick={onRemove}
          >
            <TrashIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Fields stack full-width below the header. */}
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="app-field-label">Label</span>
          <input
            className="app-input mt-1 text-sm"
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="app-field-label">Why we need it / how to get it</span>
          <textarea
            className="app-textarea mt-1 text-sm"
            rows={2}
            value={field.helper ?? ""}
            placeholder="The one line that stops the client having to guess."
            onChange={(e) => onPatch({ helper: e.target.value })}
          />
        </label>

        {field.type === "checklist_item" ? (
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              className="app-checkbox"
              checked={field.ownedByClient ?? false}
              onChange={(e) => onPatch({ ownedByClient: e.target.checked })}
            />
            <span className="text-sm text-[var(--text-2)]">
              The client owns this account or asset
            </span>
          </label>
        ) : null}

        {field.type === "legal_doc" ? (
          <label className="block">
            <span className="app-field-label">Which document</span>
            <select
              // pr-9 clears app-select-chevron's arrow (audit:ui SELECT-PAD).
              className="app-select app-select-chevron mt-1 w-full pr-9 text-sm"
              value={field.docKey ?? ""}
              onChange={(e) =>
                onPatch({ docKey: (e.target.value || undefined) as LaunchpadFieldDef["docKey"] })
              }
            >
              <option value="">Select…</option>
              {LAUNCHPAD_DOC_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {meta.supportsOptions ? (
          <label className="block">
            <span className="app-field-label">Options — one per line</span>
            <textarea
              className="app-textarea mt-1 font-mono text-xs"
              rows={3}
              value={(field.options ?? []).map((o) => o.label).join("\n")}
              onChange={(e) =>
                onPatch({
                  options: e.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((label, i) => ({
                      id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || `opt_${i}`,
                      label,
                    })),
                })
              }
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
