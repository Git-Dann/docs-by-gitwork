/**
 * The free tier of the public scanner: which findings a stranger sees in full.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * The workspace picks a set of checks (`Workspace.pulseEmbedCheckKeys`). Findings from
 * those checks are shown free, in full, with their evidence. Every other actionable
 * finding is COUNTED and named only by category — so the visitor knows it exists and
 * what it is about, but not what it says. That count is the sales hook.
 *
 *   null  → no limit (everything triaged is free). This is the default.
 *   [...] → only these checks are shown in full. An empty array shows none.
 *
 * ⚠️ THIS NEVER CHANGES THE SCORE. The public score is `computeScoreBreakdown` over the
 * FULL scan, so the free number always equals the paid one. An earlier version of this
 * feature rescored the chosen subset, which made a single check worth 7–14 points on the
 * public score against a fraction of a point internally — the teaser and the report were
 * different quantities wearing the same units. Only DISPLAY is limited here.
 *
 * Framework-free, so the settings picker, the scan routes, the result page and the
 * email all use the same rule and cannot disagree.
 */

export interface FreeTierFinding {
  checkKey: string;
  category: string;
}

export interface FreeTierSplit<T extends FreeTierFinding> {
  /** Findings shown in full. */
  shown: T[];
  /** How many actionable findings are held back. */
  lockedCount: number;
  /** Held-back findings by category, largest first — names the area, never the finding. */
  lockedByCategory: { category: string; count: number }[];
  /** True when a limit is in force at all (even if nothing ended up locked). */
  limited: boolean;
}

/**
 * Split actionable findings by the free set. `freeKeys === null` means no limit.
 * Order is preserved, so the worst-first ranking survives.
 */
export function splitByFreeSet<T extends FreeTierFinding>(
  findings: readonly T[],
  freeKeys: ReadonlySet<string> | null,
): FreeTierSplit<T> {
  if (freeKeys === null) return { shown: [...findings], lockedCount: 0, lockedByCategory: [], limited: false };
  const shown: T[] = [];
  const byCat = new Map<string, number>();
  let locked = 0;
  for (const f of findings) {
    if (freeKeys.has(f.checkKey)) shown.push(f);
    else {
      locked++;
      byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
    }
  }
  return {
    shown,
    lockedCount: locked,
    lockedByCategory: [...byCat.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    limited: true,
  };
}

/**
 * What is stored in `Workspace.pulseEmbedCheckKeys`: `{ keys: [...] }`, or null for no
 * limit.
 *
 * ⚠️ It is an OBJECT, not a bare array, on purpose. This column held a plain array for
 * the old picker (a curated ~10-check default) and was left in the database when that
 * picker went. Reading a bare array would have silently re-imposed a years-old selection
 * the moment this shipped. Anything that is not the object below — including every old
 * value — reads as "no limit", so shipping this changes nothing until someone chooses.
 */
export interface StoredFreeSet {
  keys: string[];
}

export function serialiseFreeKeys(keys: readonly string[] | null): StoredFreeSet | null {
  return keys === null ? null : { keys: [...new Set(keys)] };
}

/**
 * Read the stored value defensively. Anything unrecognised is "no limit" — a corrupt or
 * legacy column must open the tier up, not silently show nothing. Keys no longer in the
 * catalogue are dropped (a retired check cannot be shown anyway) and duplicates collapse.
 */
export function normaliseFreeKeys(raw: unknown, knownKeys: ReadonlySet<string>): string[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const keys = (raw as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return null;
  const out = new Set<string>();
  for (const k of keys) if (typeof k === "string" && knownKeys.has(k)) out.add(k);
  return [...out];
}

// ── Picker model ─────────────────────────────────────────────────────────────

export interface PickerCheck {
  key: string;
  category: string;
  label: string;
}

export interface PickerCategory {
  category: string;
  checks: PickerCheck[];
  selected: number;
}

export interface PickerDomain {
  domain: string;
  categories: PickerCategory[];
  total: number;
  selected: number;
}

/**
 * Build the grouped, searchable list the picker renders: domain → category → checks.
 *
 * Search matches label, key or category (all words must match, any order, case-
 * insensitive), so "ssl" and "legal cookie" both land where you would expect. With a
 * query the empty groups disappear, so what is left is only what matched. `onlySelected`
 * is the review view — "what have we actually put in the free tier".
 */
export function buildPickerModel(
  checks: readonly PickerCheck[],
  domainOf: (category: string) => string,
  domainOrder: readonly string[],
  opts: { query: string; selected: ReadonlySet<string>; onlySelected: boolean },
): PickerDomain[] {
  const words = opts.query.toLowerCase().split(/\s+/).filter(Boolean);
  const byDomain = new Map<string, Map<string, PickerCheck[]>>();

  for (const c of checks) {
    if (opts.onlySelected && !opts.selected.has(c.key)) continue;
    if (words.length) {
      const hay = `${c.label} ${c.key} ${c.category}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
    }
    const d = domainOf(c.category);
    if (!byDomain.has(d)) byDomain.set(d, new Map());
    const cats = byDomain.get(d)!;
    if (!cats.has(c.category)) cats.set(c.category, []);
    cats.get(c.category)!.push(c);
  }

  const rank = (d: string) => {
    const i = domainOrder.indexOf(d);
    return i === -1 ? domainOrder.length : i;
  };

  return [...byDomain.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([domain, cats]) => {
      const categories: PickerCategory[] = [...cats.entries()]
        .map(([category, list]) => ({
          category,
          checks: [...list].sort((x, y) => x.label.localeCompare(y.label)),
          selected: list.filter((c) => opts.selected.has(c.key)).length,
        }))
        .sort((x, y) => x.category.localeCompare(y.category));
      return {
        domain,
        categories,
        total: categories.reduce((n, c) => n + c.checks.length, 0),
        selected: categories.reduce((n, c) => n + c.selected, 0),
      };
    });
}
