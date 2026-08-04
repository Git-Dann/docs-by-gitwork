/**
 * The guard behind the raw block-payload editor in Document details.
 *
 * Editing sections as raw JSON is genuinely useful — it is the only way to fix a malformed block,
 * bulk-retitle, or reorder without dragging. It is also the single easiest way to destroy a
 * document, because a paste with one missing entry silently deletes a block and its content.
 *
 * So the editor is not "apply whatever JSON you pasted". This module reconciles the edited
 * payload against the document's ACTUAL sections and permits exactly one class of change:
 *
 *   ALLOWED   reorder · retitle · re-caption · hide/show · rewrite a block's `data`
 *   REFUSED   adding a block · deleting a block · inventing a key the document doesn't have
 *
 * The distinction is what makes the feature safe: everything permitted is recoverable by editing
 * again, and everything refused is not. Adding and deleting blocks stay in the outline, where
 * they are deliberate single actions with an undo behind them.
 *
 * Pure and framework-free so it is unit-testable without a DOM or a database — the reason it can
 * be trusted at all. Nothing here reads Prisma, React or the network.
 */

/** The subset of a section this editor may touch. */
export interface EditableSection {
  id: string;
  key: string;
  title: string;
  description?: string | null;
  isVisible: boolean;
  sortOrder: number;
  data: unknown;
}

export interface ReconcileOk {
  ok: true;
  /** The reconciled sections, in the edited order, with `sortOrder` renumbered from 0. */
  sections: EditableSection[];
  /** Human-readable summary of what changed, for a confirm step. Empty when nothing changed. */
  changes: string[];
}

export interface ReconcileError {
  ok: false;
  /** Every problem found, not just the first — a paste usually has one cause and many symptoms. */
  errors: string[];
}

export type ReconcileResult = ReconcileOk | ReconcileError;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `"a", "b" and "c"` — errors read as prose, since they are shown to whoever pasted the JSON. */
function list(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/**
 * Reconcile an edited payload against the document's real sections.
 *
 * Identity is `id`, not `key` or array position: a document can legitimately carry two blocks of
 * the same key (two `prose` sections), so keying on `key` would collapse them, and keying on
 * position would make reordering indistinguishable from rewriting.
 */
export function reconcileSectionPayload(
  current: ReadonlyArray<EditableSection>,
  edited: unknown,
): ReconcileResult {
  const errors: string[] = [];

  if (!Array.isArray(edited)) {
    return { ok: false, errors: ["The payload must be an array of blocks."] };
  }

  const byId = new Map(current.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const unknown: string[] = [];
  const duplicated: string[] = [];
  const malformed: number[] = [];

  const next: EditableSection[] = [];

  edited.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
      malformed.push(index);
      return;
    }

    const original = byId.get(entry.id);
    if (!original) {
      // Either an invented block or a mangled id. Both are "add", which is refused.
      unknown.push(entry.id);
      return;
    }
    if (seen.has(entry.id)) {
      duplicated.push(entry.id);
      return;
    }
    seen.add(entry.id);

    next.push({
      ...original,
      // `key` is NEVER taken from the payload: it selects the renderer and the editor, so a
      // changed key turns a block into a different type while keeping data shaped for the old
      // one. Changing a block's type is a create + delete, which this editor does not do.
      key: original.key,
      title: typeof entry.title === "string" ? entry.title : original.title,
      description:
        typeof entry.description === "string" || entry.description === null
          ? (entry.description as string | null)
          : original.description,
      isVisible: typeof entry.isVisible === "boolean" ? entry.isVisible : original.isVisible,
      data: "data" in entry ? entry.data : original.data,
      sortOrder: next.length,
    });
  });

  if (malformed.length) {
    errors.push(
      `${malformed.length === 1 ? "Block" : "Blocks"} at position ${list(
        malformed.map(String),
      )} ${malformed.length === 1 ? "has" : "have"} no \`id\`. Every block must keep its id.`,
    );
  }
  if (unknown.length) {
    errors.push(
      `This document has no block with id ${list(unknown.map((id) => `\`${id}\``))}. ` +
        `Blocks can't be added here — use the outline.`,
    );
  }
  if (duplicated.length) {
    errors.push(`Block id ${list(duplicated.map((id) => `\`${id}\``))} appears more than once.`);
  }

  const missing = current.filter((section) => !seen.has(section.id));
  if (missing.length) {
    errors.push(
      `${missing.length === 1 ? "Block" : "Blocks"} ${list(
        missing.map((section) => `"${section.title}"`),
      )} ${missing.length === 1 ? "is" : "are"} missing. Blocks can't be deleted here — use the outline.`,
    );
  }

  if (errors.length) return { ok: false, errors };

  return { ok: true, sections: next, changes: describeChanges(current, next) };
}

/** What actually changed, so the editor can show it before applying. */
function describeChanges(
  current: ReadonlyArray<EditableSection>,
  next: ReadonlyArray<EditableSection>,
): string[] {
  const changes: string[] = [];
  const byId = new Map(current.map((section) => [section.id, section]));

  const reordered = next.some((section, index) => current[index]?.id !== section.id);
  if (reordered) changes.push("Reordered blocks");

  for (const section of next) {
    const before = byId.get(section.id);
    if (!before) continue;
    if (before.title !== section.title) {
      changes.push(`Retitled "${before.title}" → "${section.title}"`);
    }
    if ((before.description ?? null) !== (section.description ?? null)) {
      changes.push(`Changed the caption on "${section.title}"`);
    }
    if (before.isVisible !== section.isVisible) {
      changes.push(`${section.isVisible ? "Showed" : "Hid"} "${section.title}"`);
    }
    if (JSON.stringify(before.data) !== JSON.stringify(section.data)) {
      changes.push(`Rewrote the contents of "${section.title}"`);
    }
  }

  return changes;
}
