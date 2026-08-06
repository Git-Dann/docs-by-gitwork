/**
 * Decides what a document save should do to the `DocumentSection` table.
 *
 * This is pure so it can be tested without a database — the same shape as the Curator's
 * `decideStarterTransition` and the Foreman's `detectFindings`. `updateDocument` executes the
 * plan; every rule about *what* to write lives here.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────────────────
 * The save path used to be `deleteMany` + `createMany`, which minted a brand new cuid for every
 * section on every autosave — roughly every 900ms while someone types. Two things reference
 * those ids: `Asset.sectionId` is a real FK with `onDelete: SetNull`, so a section-anchored
 * asset was cut loose on a timer; and `DocumentComment.sectionId` is a loose reference to the
 * same ids, so a comment on a section quietly stopped resolving. The sibling `CostLineItem`
 * write already passed `id` through — sections never did.
 *
 * Stable ids are also the precondition for anything incremental: per-section saves, comment
 * anchoring, and any future operation log for concurrent editing.
 */

import { canonicalise } from "@/server/provenance/digest";

/** The fields a save can actually move. `documentId` is supplied by the caller. */
export interface SectionFields {
  key: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  speakerNotes: string | null;
  fontSize: string | null;
  data: unknown;
}

/** A section row as we currently hold it. */
export interface ExistingSection extends SectionFields {
  id: string;
}

/** A section as the editor sends it. `id` is absent, or client-minted, for a new block. */
export interface IncomingSection extends Omit<SectionFields, "description" | "speakerNotes" | "fontSize"> {
  id?: string;
  description?: string | null;
  speakerNotes?: string | null;
  fontSize?: string | null;
}

export interface SectionWritePlan {
  updates: Array<{ id: string; fields: SectionFields }>;
  creates: SectionFields[];
  deleteIds: string[];
}

function normalise(section: IncomingSection, index: number): SectionFields {
  return {
    key: section.key,
    title: section.title,
    description: section.description ?? null,
    sortOrder: section.sortOrder ?? index,
    isVisible: section.isVisible,
    speakerNotes: section.speakerNotes ?? null,
    fontSize: section.fontSize ?? null,
    data: section.data,
  };
}

/**
 * True when nothing about this section moved, so the UPDATE can be skipped entirely.
 *
 * `canonicalise` rather than `JSON.stringify` because `data` round-trips through Postgres
 * jsonb, which does not preserve key insertion order. A plain stringify would report every
 * section as changed on every save and this skip would never once fire.
 */
export function sectionUnchanged(current: SectionFields, next: SectionFields): boolean {
  return (
    current.key === next.key &&
    current.title === next.title &&
    (current.description ?? null) === next.description &&
    current.sortOrder === next.sortOrder &&
    current.isVisible === next.isVisible &&
    (current.speakerNotes ?? null) === next.speakerNotes &&
    (current.fontSize ?? null) === next.fontSize &&
    canonicalise(current.data) === canonicalise(next.data)
  );
}

/**
 * @param preserveCostingData when the editor cannot see costs, their blanked costing payload
 *   must not overwrite the real one. Pass the stored `data` to pin it; omit to accept theirs.
 */
export function planSectionWrites(
  existing: ExistingSection[],
  incoming: IncomingSection[],
  options: { preserveCostingData?: unknown } = {},
): SectionWritePlan {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set<string>();
  const plan: SectionWritePlan = { updates: [], creates: [], deleteIds: [] };

  incoming.forEach((section, index) => {
    const fields = normalise(section, index);
    if (section.key === "costing" && options.preserveCostingData !== undefined) {
      fields.data = options.preserveCostingData;
    }

    // Trust the id only when it names a row we actually hold. The editor mints
    // `draft-section-<uuid>` for a block added since the last refetch, so an unknown id means
    // "new", not "missing" — it becomes a create and the database assigns the real cuid.
    // Testing membership rather than the id's *shape* also means a stale id, or one belonging
    // to another document, can never address a row here.
    const current = section.id ? existingById.get(section.id) : undefined;
    if (!current) {
      plan.creates.push(fields);
      return;
    }

    keptIds.add(current.id);
    // A typical autosave touches one block. Skipping the untouched ones turns ~38 UPDATEs
    // into one, which is the difference between this diff being cheaper than the old
    // delete-all/recreate and being more expensive.
    if (!sectionUnchanged(current, fields)) {
      plan.updates.push({ id: current.id, fields });
    }
  });

  plan.deleteIds = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
  return plan;
}
