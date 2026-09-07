/**
 * Per-client Requests categories.
 *
 * A client's own vocabulary for raising requests ("Quick Design fix (V1)",
 * "Content tweak", "Feature → 1.1") rather than our four fixed types. The point
 * is that adding a client's categories is DATA, never a code change or a new
 * enum value — one client's release numbering must never leak into every other
 * client's form.
 *
 * Each category maps onto one of the four underlying `WikiIntakeItemType`s, and
 * that mapping is what keeps everything downstream working unchanged: the
 * promotion title prefix, the public intake API's vocabulary, dev filtering, and
 * every request raised before the client had custom categories at all. The
 * custom label is what a human reads; the type is what the system acts on.
 *
 * Framework-free so the server can import it.
 */

export type IntakeCategoryType = "BUG" | "FEEDBACK" | "TASK" | "DESIGN";

export const INTAKE_CATEGORY_TYPES: IntakeCategoryType[] = ["BUG", "FEEDBACK", "TASK", "DESIGN"];

/** How each underlying type reads when there's no custom category to show. */
export const INTAKE_TYPE_LABEL: Record<IntakeCategoryType, string> = {
  BUG: "Bug",
  FEEDBACK: "Feedback",
  TASK: "Request",
  DESIGN: "Design",
};

export interface IntakeCategory {
  /** Stable id — survives a rename, so existing requests follow the new name. */
  id: string;
  /** What the client sees and picks. */
  label: string;
  /** The underlying type this behaves as everywhere downstream. */
  mapsTo: IntakeCategoryType;
}

/** Ceiling on a client's list — a picker, not a taxonomy. */
export const MAX_INTAKE_CATEGORIES = 12;
export const MAX_CATEGORY_LABEL = 40;

/**
 * The default list, used when a client hasn't been given custom categories.
 * Ids are the type names so a client who later switches to custom categories
 * doesn't orphan the requests raised before that.
 */
export const DEFAULT_INTAKE_CATEGORIES: IntakeCategory[] = INTAKE_CATEGORY_TYPES.map((t) => ({
  id: t,
  label: INTAKE_TYPE_LABEL[t],
  mapsTo: t,
}));

function isType(v: unknown): v is IntakeCategoryType {
  return typeof v === "string" && (INTAKE_CATEGORY_TYPES as string[]).includes(v);
}

/**
 * Read a categories list off the wiki's Json column. Anything malformed is
 * dropped rather than trusted — this is a Json column, so its shape is a
 * promise, not a guarantee. Returns null when there is no usable custom list,
 * which callers read as "use the defaults".
 */
export function parseIntakeCategories(raw: unknown): IntakeCategory[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: IntakeCategory[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, label, mapsTo } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof label !== "string" || !isType(mapsTo)) continue;
    const trimmedId = id.trim();
    const trimmedLabel = label.trim().slice(0, MAX_CATEGORY_LABEL);
    if (!trimmedId || !trimmedLabel || seen.has(trimmedId)) continue;
    seen.add(trimmedId);
    out.push({ id: trimmedId, label: trimmedLabel, mapsTo });
    if (out.length >= MAX_INTAKE_CATEGORIES) break;
  }
  return out.length > 0 ? out : null;
}

/** The list to render — custom when configured, else the built-in four. */
export function resolveIntakeCategories(raw: unknown): IntakeCategory[] {
  return parseIntakeCategories(raw) ?? DEFAULT_INTAKE_CATEGORIES;
}

/** True when the client is on the built-in list (nothing custom configured). */
export function usesDefaultCategories(raw: unknown): boolean {
  return parseIntakeCategories(raw) === null;
}

/**
 * Validate a list on the way IN (the settings editor). Unlike `parse`, this
 * reports why it's rejected rather than silently dropping rows — staff editing
 * the list need to know a label was blank, not watch it disappear.
 */
export function validateIntakeCategories(
  input: unknown,
): { ok: true; categories: IntakeCategory[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Categories must be a list." };
  if (input.length > MAX_INTAKE_CATEGORIES) {
    return { ok: false, error: `No more than ${MAX_INTAKE_CATEGORIES} categories.` };
  }
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const categories: IntakeCategory[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Malformed category." };
    const { id, label, mapsTo } = entry as Record<string, unknown>;
    const trimmedLabel = typeof label === "string" ? label.trim() : "";
    if (!trimmedLabel) return { ok: false, error: "Every category needs a name." };
    if (trimmedLabel.length > MAX_CATEGORY_LABEL) {
      return { ok: false, error: `"${trimmedLabel.slice(0, 20)}…" is too long (max ${MAX_CATEGORY_LABEL}).` };
    }
    if (!isType(mapsTo)) {
      return { ok: false, error: `"${trimmedLabel}" needs a type of Bug, Feedback, Request or Design.` };
    }
    const trimmedId = typeof id === "string" && id.trim() ? id.trim() : slugifyCategory(trimmedLabel);
    if (seenIds.has(trimmedId)) return { ok: false, error: `Duplicate category id "${trimmedId}".` };
    // Two identically-named categories are indistinguishable to the client
    // picking one, so they're a mistake rather than a preference.
    const labelKey = trimmedLabel.toLowerCase();
    if (seenLabels.has(labelKey)) return { ok: false, error: `Duplicate category "${trimmedLabel}".` };
    seenIds.add(trimmedId);
    seenLabels.add(labelKey);
    categories.push({ id: trimmedId, label: trimmedLabel, mapsTo });
  }
  return { ok: true, categories };
}

/** Stable id derived from a label. Kept ascii+dashes so it reads in a payload. */
export function slugifyCategory(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "category";
}

/** Find a category by id in a resolved list. */
export function findCategory(categories: IntakeCategory[], id: string | null | undefined) {
  if (!id) return null;
  return categories.find((c) => c.id === id) ?? null;
}

/**
 * What a request row should display, given the client's CURRENT list.
 *
 * Live lookup wins so a renamed category flows through to requests already
 * raised under it. A deleted category falls back to the label snapshotted when
 * the request was raised — losing the category shouldn't silently rewrite what
 * the client told us it was. Only if both are gone does it fall back to the
 * underlying type.
 */
export function displayCategory(
  categories: IntakeCategory[],
  item: { categoryId?: string | null; categoryLabel?: string | null; type: IntakeCategoryType },
): string {
  const live = findCategory(categories, item.categoryId);
  if (live) return live.label;
  const snapshot = item.categoryLabel?.trim();
  if (snapshot) return snapshot;
  return INTAKE_TYPE_LABEL[item.type] ?? item.type;
}

/**
 * Resolve a submitted categoryId to the type the system should store.
 * The type is ALWAYS derived here rather than taken from the caller — a client
 * form that could send its own (categoryId, type) pair could put a "Design"
 * category onto a BUG and split the two apart.
 */
export function typeForCategory(
  categories: IntakeCategory[],
  categoryId: string | null | undefined,
  fallback: IntakeCategoryType = "FEEDBACK",
): { type: IntakeCategoryType; categoryId: string | null; categoryLabel: string | null } {
  const match = findCategory(categories, categoryId);
  if (!match) return { type: fallback, categoryId: null, categoryLabel: null };
  return { type: match.mapsTo, categoryId: match.id, categoryLabel: match.label };
}
