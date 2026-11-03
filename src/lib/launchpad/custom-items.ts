/**
 * Per-client requirements — the §43.5 gap.
 *
 * Gitwork can add, edit and remove a requirement on ONE client's Launchpad. The
 * edit is written into THAT kit's `structureSnapshot`, never the master template
 * (Dan's call), so one client's bespoke ask — a liability-insurance certificate, a
 * specific retention policy — can never leak onto everyone else's kit.
 *
 * Pure and framework-free, so the server write path, the demo resolver and the tests
 * all run the same rules.
 *
 * Four rules, each pinned by a test:
 *
 *  1. Only a CUSTOM item is editable or removable here. A template item is part of
 *     the agreed kit; changing it per client belongs in the template.
 *  2. A custom item is marked twice: `custom: true` AND the `custom-` id prefix.
 *     The template schema has no `custom` key (zod strips it), so a template can
 *     never mint one, and the prefix means a generated id can never collide with a
 *     template id.
 *  3. Removing an item removes it from the SNAPSHOT only. Its `LaunchpadItem` row
 *     (status, link, note) and its files are kept — the same "stop reading, don't
 *     delete" rule re-assigning a template follows.
 *  4. Re-assigning a template carries custom items across (`carryCustomItems`), so
 *     switching a client's template never silently destroys the bespoke asks we
 *     made of them.
 */

import type { LaunchpadFieldDef, LaunchpadModule, LaunchpadStructure } from "@/types/launchpad";

export const CUSTOM_ITEM_PREFIX = "custom-";

/** The module a carried-over item lands in when its own module isn't in the new
 *  template. Only created if the new structure has no module at all to hold it. */
export const CUSTOM_FALLBACK_MODULE_ID = "custom-additional";

export interface CustomItemInput {
  label: string;
  helper?: string | null;
  hint?: string | null;
  /** Client-owned account/asset (true), Gitwork-held (false), or unspecified (null). */
  ownedByClient?: boolean | null;
}

export type CustomItemPatch = Partial<CustomItemInput>;

export function isCustomItem(field: Pick<LaunchpadFieldDef, "id" | "type" | "custom">): boolean {
  return (
    field.custom === true &&
    field.type === "checklist_item" &&
    field.id.startsWith(CUSTOM_ITEM_PREFIX)
  );
}

/** A fresh id that cannot collide with a template id (prefix) or another custom one. */
export function newCustomItemId(
  structure: LaunchpadStructure,
  random: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const taken = new Set(structure.modules.flatMap((m) => m.fields.map((f) => f.id)));
  for (let i = 0; i < 5; i += 1) {
    const id = `${CUSTOM_ITEM_PREFIX}${random()}`.slice(0, 64);
    if (!taken.has(id)) return id;
  }
  throw new Error("Could not mint a unique requirement id");
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildField(id: string, input: CustomItemInput): LaunchpadFieldDef {
  const field: LaunchpadFieldDef = {
    id,
    type: "checklist_item",
    label: input.label.trim(),
    custom: true,
  };
  const helper = clean(input.helper);
  const hint = clean(input.hint);
  if (helper) field.helper = helper;
  if (hint) field.hint = hint;
  if (typeof input.ownedByClient === "boolean") field.ownedByClient = input.ownedByClient;
  return field;
}

function mapModules(
  structure: LaunchpadStructure,
  fn: (module: LaunchpadModule) => LaunchpadModule,
): LaunchpadStructure {
  return { ...structure, modules: structure.modules.map(fn) };
}

function findField(structure: LaunchpadStructure, itemId: string): LaunchpadFieldDef | undefined {
  for (const mod of structure.modules) {
    const hit = mod.fields.find((f) => f.id === itemId);
    if (hit) return hit;
  }
  return undefined;
}

/** Add a requirement to one module. Null when the module isn't in this kit. */
export function addCustomItem(
  structure: LaunchpadStructure,
  moduleId: string,
  input: CustomItemInput,
  id: string,
): LaunchpadStructure | null {
  if (!structure.modules.some((m) => m.id === moduleId)) return null;
  if (!id.startsWith(CUSTOM_ITEM_PREFIX) || findField(structure, id)) return null;
  if (!input.label.trim()) return null;
  return mapModules(structure, (m) =>
    m.id === moduleId ? { ...m, fields: [...m.fields, buildField(id, input)] } : m,
  );
}

/** Edit a custom requirement's copy. Null when the id isn't a custom item here
 *  (rule 1 — a template item is never edited per client). */
export function updateCustomItem(
  structure: LaunchpadStructure,
  itemId: string,
  patch: CustomItemPatch,
): LaunchpadStructure | null {
  const existing = findField(structure, itemId);
  if (!existing || !isCustomItem(existing)) return null;
  const label = patch.label !== undefined ? patch.label.trim() : existing.label;
  if (!label) return null;
  const merged: CustomItemInput = {
    label,
    helper: patch.helper !== undefined ? patch.helper : existing.helper,
    hint: patch.hint !== undefined ? patch.hint : existing.hint,
    ownedByClient:
      patch.ownedByClient !== undefined ? patch.ownedByClient : (existing.ownedByClient ?? null),
  };
  return mapModules(structure, (m) => ({
    ...m,
    fields: m.fields.map((f) => (f.id === itemId ? buildField(itemId, merged) : f)),
  }));
}

/** Remove a custom requirement from the snapshot. Its item row and files are kept
 *  by the caller (rule 3). Null when the id isn't a custom item here. */
export function removeCustomItem(
  structure: LaunchpadStructure,
  itemId: string,
): LaunchpadStructure | null {
  const existing = findField(structure, itemId);
  if (!existing || !isCustomItem(existing)) return null;
  return mapModules(structure, (m) => ({
    ...m,
    fields: m.fields.filter((f) => f.id !== itemId),
  }));
}

/** Every custom item in a structure, with the module it sat in. */
export function customItemsOf(
  structure: LaunchpadStructure,
): Array<{ moduleId: string; field: LaunchpadFieldDef }> {
  return structure.modules.flatMap((m) =>
    m.fields.filter(isCustomItem).map((field) => ({ moduleId: m.id, field })),
  );
}

/**
 * Carry a kit's custom items onto a freshly assigned template structure (rule 4).
 *
 * Each lands in the module of the same id when the new template has one; otherwise
 * in the first always-on module (Foundations), else the first module, else a new
 * "Additional requirements" module. Never duplicated: an id already present in the
 * new structure is left alone.
 */
export function carryCustomItems(
  previous: LaunchpadStructure | null | undefined,
  next: LaunchpadStructure,
): LaunchpadStructure {
  if (!previous) return next;
  const carried = customItemsOf(previous);
  if (carried.length === 0) return next;

  const present = new Set(next.modules.flatMap((m) => m.fields.map((f) => f.id)));
  const modules: LaunchpadModule[] = next.modules.map((m) => ({ ...m, fields: [...m.fields] }));
  const fallback = (): LaunchpadModule => {
    const target = modules.find((m) => m.alwaysOn) ?? modules[0];
    if (target) return target;
    const created: LaunchpadModule = {
      id: CUSTOM_FALLBACK_MODULE_ID,
      title: "Additional requirements",
      alwaysOn: true,
      fields: [],
    };
    modules.push(created);
    return created;
  };

  for (const { moduleId, field } of carried) {
    if (present.has(field.id)) continue;
    const target = modules.find((m) => m.id === moduleId) ?? fallback();
    target.fields.push(field);
    present.add(field.id);
  }
  return { ...next, modules };
}
