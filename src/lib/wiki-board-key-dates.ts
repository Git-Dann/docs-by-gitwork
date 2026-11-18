/**
 * Key dates on the Board's Schedule: dated events that aren't cards (a content drop, a launch, an
 * event). Pure rules, shared by the validators, the server (src/server/wiki-board-key-dates.ts),
 * the import from the client's planning tool and the demo.
 */

export const KEY_DATE_LIMITS = {
  title: 120,
  note: 1000,
} as const;

/** "2026-11-31" is the right shape and no day at all. */
export function isRealDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The importer's key for a planning-tool date, so a re-run never makes a second copy. */
export function forgeKeyDateRef(forgeId: string): string {
  return `forge-date:${forgeId}`;
}

export interface KeyDateToImport {
  externalRef: string;
  title: string;
  date: string;
}

export interface KeyDateImportPlan {
  create: KeyDateToImport[];
  /** Already imported (live, or deleted here: a date someone removed is not brought back). */
  existing: number;
  /** Feed entries with no usable title or date. */
  skipped: number;
}

/**
 * Which of the planning tool's dates to create. `known` is every externalRef already on this
 * client, INCLUDING deleted ones: deleting a key date in Foundry is a decision, and an import that
 * brought it back would undo it. Pure.
 */
export function planKeyDateImport(
  dates: ReadonlyArray<{ id: string; title: string; date: string | null }>,
  known: ReadonlySet<string>,
): KeyDateImportPlan {
  const create: KeyDateToImport[] = [];
  const seen = new Set<string>();
  let existing = 0;
  let skipped = 0;
  for (const d of dates) {
    const title = d.title.trim().slice(0, KEY_DATE_LIMITS.title).trim();
    if (!title || !d.date || !isRealDay(d.date)) {
      skipped++;
      continue;
    }
    const externalRef = forgeKeyDateRef(d.id);
    if (known.has(externalRef) || seen.has(externalRef)) {
      existing++;
      continue;
    }
    seen.add(externalRef);
    create.push({ externalRef, title, date: d.date });
  }
  return { create, existing, skipped };
}
