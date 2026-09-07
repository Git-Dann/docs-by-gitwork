/**
 * Pure helpers for walking a `LaunchpadStructure`, plus the item status machine
 * and the completeness roll-up.
 *
 * Framework-free and Prisma-free so the server (answer routing, the client-card
 * signal, the HQ widget) and the renderer (the wiki section, the builder preview)
 * share one implementation — the same split that makes onboarding's `structure.ts`
 * safe to import from either side.
 */

import { isFieldVisible } from "@/lib/onboarding/structure";
import { collectsFlatAnswer, isChecklistItem, isLegalDoc } from "@/lib/launchpad/field-types";
import type { OnboardingAnswers } from "@/types/onboarding";
import type {
  LaunchpadAnswers,
  LaunchpadCompleteness,
  LaunchpadFieldDef,
  LaunchpadItemState,
  LaunchpadItemStatus,
  LaunchpadModule,
  LaunchpadStructure,
} from "@/types/launchpad";
import { LAUNCHPAD_ITEM_STATUSES } from "@/types/launchpad";

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Coerce an unknown JSON snapshot into a structure. Mirrors onboarding's
 * `isFormStructure`: a stored snapshot is JSON that app code wrote, so this
 * guards against malformed or hand-edited data rather than validating deeply.
 */
export function isLaunchpadStructure(value: unknown): value is LaunchpadStructure {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const modules = (value as { modules?: unknown }).modules;
  if (!Array.isArray(modules)) return false;
  return modules.every(
    (m) =>
      !!m &&
      typeof m === "object" &&
      typeof (m as { id?: unknown }).id === "string" &&
      Array.isArray((m as { fields?: unknown }).fields),
  );
}

export function isLaunchpadItemStatus(value: unknown): value is LaunchpadItemStatus {
  return (
    typeof value === "string" &&
    (LAUNCHPAD_ITEM_STATUSES as readonly string[]).includes(value)
  );
}

// ─── Walkers ──────────────────────────────────────────────────────────────────

/** Every field across every module, in order (ignores module enablement). */
export function allFields(structure: LaunchpadStructure): LaunchpadFieldDef[] {
  return structure.modules.flatMap((m) => m.fields);
}

/** Map of field id → def, across all modules. */
export function fieldsById(structure: LaunchpadStructure): Map<string, LaunchpadFieldDef> {
  const map = new Map<string, LaunchpadFieldDef>();
  for (const field of allFields(structure)) map.set(field.id, field);
  return map;
}

/** Set of all field ids (for dangling-showIf detection). */
export function fieldIdSet(structure: LaunchpadStructure): Set<string> {
  return new Set(allFields(structure).map((f) => f.id));
}

/**
 * Whether a module is switched on for this client. An `alwaysOn` module (Foundations)
 * is on regardless of what `enabledModules` says — including when that list is
 * empty, which is the state a freshly-assigned kit starts in, so a client always
 * has something to fill in rather than a blank page.
 */
export function isModuleEnabled(module: LaunchpadModule, enabledModules: string[]): boolean {
  return Boolean(module.alwaysOn) || enabledModules.includes(module.id);
}

/** The enabled modules, in structure order. */
export function enabledModulesOf(
  structure: LaunchpadStructure,
  enabledModules: string[],
): LaunchpadModule[] {
  return structure.modules.filter((m) => isModuleEnabled(m, enabledModules));
}

/** Module ids a client may toggle (everything bar the always-on ones). */
export function toggleableModuleIds(structure: LaunchpadStructure): string[] {
  return structure.modules.filter((m) => !m.alwaysOn).map((m) => m.id);
}

/**
 * Fields that actually render: in an enabled module, and visible given current
 * answers. Reuses onboarding's `isFieldVisible`, so a `showIf` pointing at a
 * deleted field falls open here too rather than trapping copy behind it.
 */
export function visibleFields(
  structure: LaunchpadStructure,
  enabledModules: string[],
  answers: LaunchpadAnswers,
): LaunchpadFieldDef[] {
  const known = fieldIdSet(structure);
  return enabledModulesOf(structure, enabledModules).flatMap((m) =>
    m.fields.filter((f) =>
      isFieldVisible(
        f as unknown as Parameters<typeof isFieldVisible>[0],
        answers as OnboardingAnswers,
        known,
      ),
    ),
  );
}

/** The tracked requirements that count — visible `checklist_item`s in enabled modules. */
export function trackedItems(
  structure: LaunchpadStructure,
  enabledModules: string[],
  answers: LaunchpadAnswers = {},
): LaunchpadFieldDef[] {
  return visibleFields(structure, enabledModules, answers).filter(isChecklistItem);
}

/** The legal-doc fields that render — visible, in an enabled module, with a `docKey`. */
export function trackedDocs(
  structure: LaunchpadStructure,
  enabledModules: string[],
  answers: LaunchpadAnswers = {},
): LaunchpadFieldDef[] {
  return visibleFields(structure, enabledModules, answers).filter(isLegalDoc);
}

/** Field ids whose value belongs in the flat `answers` map. */
export function flatAnswerFieldIds(structure: LaunchpadStructure): Set<string> {
  return new Set(
    allFields(structure)
      .filter((f) => collectsFlatAnswer(f.type))
      .map((f) => f.id),
  );
}

// ─── The item status machine ──────────────────────────────────────────────────

/**
 * An item with NO row at all is `NEEDED`.
 *
 * This is the opposite call from Care's reply state (CLAUDE.md §42.2), and
 * deliberately so: there, absence of evidence had to not become a claim. Here the
 * template ASKED for the thing, so "nobody has touched this" genuinely does mean
 * "still outstanding". Defaulting to anything else would report a client as ready
 * on work they have never seen.
 */
export const DEFAULT_ITEM_STATUS: LaunchpadItemStatus = "NEEDED";

export function resolveItemStatus(state: LaunchpadItemState | undefined | null): LaunchpadItemStatus {
  return state?.status ?? DEFAULT_ITEM_STATUS;
}

/** `PROVIDED` and `NA` are both resolved — `NA` is an answer, not a gap. */
export function isResolved(status: LaunchpadItemStatus): boolean {
  return status === "PROVIDED" || status === "NA";
}

export interface ItemPatch {
  status?: LaunchpadItemStatus;
  /** Empty string clears the link; undefined leaves it alone. */
  link?: string | null;
  note?: string | null;
  ownedByClient?: boolean | null;
}

export interface ItemStateValues {
  status: LaunchpadItemStatus;
  link: string | null;
  note: string | null;
  ownedByClient: boolean | null;
}

/**
 * Apply a patch to one requirement. Four rules, each with a failure mode worth
 * naming — this is why the transition is a function rather than a field write:
 *
 *  1. Pasting a link while `NEEDED` auto-advances to `PROVIDED`. Requiring a
 *     second click leaves items sitting at NEEDED with a link already in them,
 *     which reads to the team as unprovided when it is not.
 *  2. Clearing the link on a `PROVIDED` item reverts it to `NEEDED` — otherwise
 *     the kit claims provided with the evidence deleted.
 *  3. An EXPLICIT status always wins over both inferences, so a client can mark
 *     something provided by other means (access granted in a vault, say) with no
 *     link, and can mark `NA` whatever the link says.
 *  4. `NA` never clears a stored link, so flipping back doesn't lose what they
 *     already pasted.
 *
 * Every status is reachable from every other on purpose: this is a checklist, not
 * an approval workflow, and a client who mis-marks something must be able to undo
 * it without asking us.
 */
export function applyItemPatch(current: ItemStateValues, patch: ItemPatch): ItemStateValues {
  const next: ItemStateValues = { ...current };

  if (patch.note !== undefined) next.note = patch.note?.trim() ? patch.note : null;
  if (patch.ownedByClient !== undefined) next.ownedByClient = patch.ownedByClient;

  const linkChanged = patch.link !== undefined;
  if (linkChanged) {
    const trimmed = patch.link?.trim() ?? "";
    next.link = trimmed === "" ? null : trimmed;
  }

  if (patch.status !== undefined) {
    // Rule 3 — explicit wins. Rule 4 falls out of not touching `link` here.
    next.status = patch.status;
    return next;
  }

  if (linkChanged) {
    // Rule 1 — a link arriving on an untouched requirement resolves it.
    if (next.link && current.status === "NEEDED") next.status = "PROVIDED";
    // Rule 2 — evidence withdrawn, so the claim goes with it.
    else if (!next.link && current.status === "PROVIDED") next.status = "NEEDED";
  }

  return next;
}

// ─── Completeness ─────────────────────────────────────────────────────────────

/**
 * Completeness across the ENABLED modules only. A disabled module's items are not
 * owed, so counting them would report a client as behind on work nobody asked
 * them for.
 *
 * Legal docs are deliberately NOT in the percentage. They are advisory drafts
 * pending the client's own lawyer, so an unapproved policy is not a blocker on
 * Gitwork in the way a missing Apple Developer account is — folding the two
 * together would make the number stop meaning "can the devs start?". Their status
 * is surfaced separately.
 */
export function computeCompleteness(
  structure: LaunchpadStructure,
  enabledModules: string[],
  items: LaunchpadItemState[],
  answers: LaunchpadAnswers = {},
): LaunchpadCompleteness {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const tracked = trackedItems(structure, enabledModules, answers);

  let provided = 0;
  let na = 0;
  const outstanding: string[] = [];

  for (const field of tracked) {
    const status = resolveItemStatus(byId.get(field.id));
    if (status === "PROVIDED") provided += 1;
    else if (status === "NA") na += 1;
    else outstanding.push(field.label || field.id);
  }

  const total = tracked.length;
  const needed = outstanding.length;
  // An empty kit is 100% rather than 0% — there is nothing outstanding, and
  // reporting 0% would flag a client who owes us nothing as the worst on the board.
  const percent = total === 0 ? 100 : Math.round(((provided + na) / total) * 100);

  return { total, provided, na, needed, percent, outstanding };
}

/** The "outstanding: app icons, Apple Developer account" line, capped so a long
 *  tail never blows out a card. Returns null when nothing is outstanding. */
export function outstandingSummary(
  completeness: LaunchpadCompleteness,
  max = 3,
): string | null {
  if (completeness.outstanding.length === 0) return null;
  const shown = completeness.outstanding.slice(0, max);
  const rest = completeness.outstanding.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}
