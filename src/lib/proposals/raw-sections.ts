/**
 * Parse + validate a hand-edited RAW section payload (the "edit the raw document" escape hatch on
 * the Document details page).
 *
 * This is the one place in Docs where a human types the document's data structure directly, so it is
 * deliberately paranoid and deliberately PURE (no React, no Prisma) — the whole point is that it can
 * be unit-tested, because there is no safe way to discover its edge cases by hand on a real client
 * document. Rules:
 *
 *  1. **Nothing is created or destroyed by accident.** A raw edit may only reorder, retitle, retype,
 *     show/hide and rewrite the `data` of blocks. The number of blocks must match, and every block
 *     must be one of the blocks already in the document, matched by `id`. That makes the whole
 *     operation reversible by ⌘Z and impossible to use as an accidental "delete everything" button.
 *  2. **Unknown block keys are rejected**, because the canvas dispatches on `key` through the section
 *     registry and an unregistered key renders as literally nothing — a silently blank document.
 *  3. **`data` must be a JSON object**, never a string/array/null: every section preview reads it as
 *     a record and would throw on the canvas otherwise.
 *  4. **`sortOrder` is re-derived from the array order**, so the order you see in the JSON is the
 *     order the document renders in — hand-maintained numbers can't drift out of step with it.
 *
 * Errors are returned, never thrown, and are phrased for the person who typed the JSON.
 */

import type { ProposalSection } from "@/types/proposal";

export interface RawSectionsResult {
  ok: boolean;
  /** Present when `ok` — the sections to write back to the draft, in array order. */
  sections?: ProposalSection[];
  /** Present when `!ok` — a message to show under the editor. */
  error?: string;
}

/** The subset of a section that a raw edit is allowed to set. */
interface RawSection {
  id?: unknown;
  key?: unknown;
  title?: unknown;
  description?: unknown;
  isVisible?: unknown;
  data?: unknown;
  speakerNotes?: unknown;
}

/** What the editor shows: the current sections, in render order, minus derived noise. */
export function serialiseRawSections(sections: ProposalSection[]): string {
  return JSON.stringify(
    [...sections]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        id: section.id,
        key: section.key,
        title: section.title,
        description: section.description ?? "",
        isVisible: section.isVisible,
        data: section.data,
        ...(section.speakerNotes ? { speakerNotes: section.speakerNotes } : {}),
      })),
    null,
    2,
  );
}

export function parseRawSections(
  text: string,
  current: ProposalSection[],
  /** Registered block keys — injected so this module stays free of the React section registry. */
  knownKeys: ReadonlyArray<string>,
): RawSectionsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `That isn't valid JSON — ${(error as Error).message}` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "The payload must be an ARRAY of blocks." };
  }
  if (parsed.length !== current.length) {
    return {
      ok: false,
      error: `Expected ${current.length} block${current.length === 1 ? "" : "s"}, got ${parsed.length}. Add and remove blocks in the editor — a raw edit only changes the blocks that are already here.`,
    };
  }

  const byId = new Map(current.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const next: ProposalSection[] = [];

  for (let index = 0; index < parsed.length; index += 1) {
    const raw = parsed[index] as RawSection;
    const at = `Block ${index + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `${at}: each entry must be an object.` };
    }
    if (typeof raw.id !== "string" || !byId.has(raw.id)) {
      return { ok: false, error: `${at}: unknown or missing "id". Keep the ids exactly as they are.` };
    }
    if (seen.has(raw.id)) {
      return { ok: false, error: `${at}: duplicate id "${raw.id}".` };
    }
    if (typeof raw.key !== "string" || !knownKeys.includes(raw.key)) {
      return {
        ok: false,
        error: `${at}: "${String(raw.key)}" is not a known block type, so it would render as nothing.`,
      };
    }
    if (typeof raw.title !== "string") {
      return { ok: false, error: `${at}: "title" must be a string.` };
    }
    if (raw.description !== undefined && typeof raw.description !== "string") {
      return { ok: false, error: `${at}: "description" must be a string.` };
    }
    if (raw.isVisible !== undefined && typeof raw.isVisible !== "boolean") {
      return { ok: false, error: `${at}: "isVisible" must be true or false.` };
    }
    if (raw.speakerNotes !== undefined && typeof raw.speakerNotes !== "string") {
      return { ok: false, error: `${at}: "speakerNotes" must be a string.` };
    }
    if (!raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) {
      return { ok: false, error: `${at}: "data" must be a JSON object.` };
    }

    seen.add(raw.id);
    const existing = byId.get(raw.id)!;
    next.push({
      ...existing,
      key: raw.key as ProposalSection["key"],
      title: raw.title,
      description: raw.description === undefined ? existing.description : (raw.description as string),
      isVisible: raw.isVisible === undefined ? existing.isVisible : (raw.isVisible as boolean),
      // Re-derived, so the array order IS the document order.
      sortOrder: index,
      data: raw.data as ProposalSection["data"],
      speakerNotes:
        raw.speakerNotes === undefined ? existing.speakerNotes : (raw.speakerNotes as string),
    });
  }

  return { ok: true, sections: next };
}
