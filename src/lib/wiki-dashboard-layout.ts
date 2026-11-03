/**
 * The wiki dashboard's personal layout — which cards show, in what order, and how wide.
 *
 * ## Per person, in their browser (Dan's call, Oct 2026)
 *
 * Each viewer arranges the dashboard for themselves; nothing is shared and nothing is sent
 * to Foundry. So it lives in `localStorage`, keyed by wiki, and a different laptop shows the
 * default again. That also means no write route and no auth question: a client on an open
 * share link can arrange their own view without being able to change anyone else's.
 *
 * ## The grid is 3 columns and every card is ONE row tall
 *
 * Only the width changes: 1, 2 or 3 columns. A card can never be two rows tall, so the
 * dashboard stays a set of reading rows rather than a collage.
 *
 * ## What a saved layout cannot do
 *
 * It only arranges cards that EXIST. A section switched off since it was saved is dropped; a
 * section switched on since then is added at the end at its default size. A saved layout can
 * therefore never surface a section the viewer is not meant to see — what is available is
 * decided elsewhere and this only orders it.
 */

export type CardSize = 1 | 2 | 3;

export interface DashboardLayout {
  /** Card ids in display order. May contain ids that no longer exist — resolve() drops them. */
  order: string[];
  sizes: Record<string, CardSize>;
  hidden: string[];
}

export const EMPTY_LAYOUT: DashboardLayout = { order: [], sizes: {}, hidden: [] };

/** The daily-updates card's id in the layout (it is not a wiki section). */
export const STANDUPS_CARD = "standups";

/** What each card starts as before anyone changes it — the dashboard as it was designed. */
export function defaultSize(id: string): CardSize {
  if (id === STANDUPS_CARD) return 3;
  if (id === "timeline") return 2;
  return 1;
}

export function isCardSize(v: unknown): v is CardSize {
  return v === 1 || v === 2 || v === 3;
}

/** Defensive read of whatever is in storage. Anything malformed reads as no layout at all. */
export function readLayout(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== "object") return EMPTY_LAYOUT;
  const o = raw as Record<string, unknown>;
  const ids = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  const sizes: Record<string, CardSize> = {};
  if (o.sizes && typeof o.sizes === "object") {
    for (const [k, v] of Object.entries(o.sizes as Record<string, unknown>)) {
      if (isCardSize(v)) sizes[k] = v;
    }
  }
  return { order: ids(o.order), sizes, hidden: ids(o.hidden) };
}

export interface ResolvedLayout {
  visible: { id: string; size: CardSize }[];
  /** Available cards the viewer hid, in default order — the "bring back" tray. */
  hidden: string[];
}

/**
 * The layout to draw, given the cards that are available right now (in their default order).
 */
export function resolveLayout(saved: DashboardLayout, available: string[]): ResolvedLayout {
  const avail = new Set(available);
  const known = saved.order.filter((id) => avail.has(id));
  const added = available.filter((id) => !known.includes(id));
  const ordered = [...known, ...added];
  const hidden = new Set(saved.hidden.filter((id) => avail.has(id)));
  return {
    visible: ordered
      .filter((id) => !hidden.has(id))
      .map((id) => ({ id, size: saved.sizes[id] ?? defaultSize(id) })),
    hidden: available.filter((id) => hidden.has(id)),
  };
}

/** The full order including hidden cards, so hiding then restoring a card keeps its place. */
function fullOrder(saved: DashboardLayout, available: string[]): string[] {
  const known = saved.order.filter((id) => available.includes(id));
  return [...known, ...available.filter((id) => !known.includes(id))];
}

/**
 * Move `activeId` to where `overId` is, among the VISIBLE cards — the drag-and-drop result.
 * Hidden cards keep their relative place in the stored order.
 */
export function moveCard(
  saved: DashboardLayout,
  available: string[],
  activeId: string,
  overId: string,
): DashboardLayout {
  if (activeId === overId) return saved;
  const order = fullOrder(saved, available);
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0) return saved;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return { ...saved, order: next };
}

export function setCardSize(saved: DashboardLayout, id: string, size: CardSize): DashboardLayout {
  return { ...saved, sizes: { ...saved.sizes, [id]: size } };
}

/**
 * Hiding never touches the order, so a restored card comes back exactly where it was —
 * the hidden list is kept separately from the order for that reason.
 */
export function hideCard(saved: DashboardLayout, id: string): DashboardLayout {
  if (saved.hidden.includes(id)) return saved;
  return { ...saved, hidden: [...saved.hidden, id] };
}

export function showCard(saved: DashboardLayout, id: string): DashboardLayout {
  return { ...saved, hidden: saved.hidden.filter((h) => h !== id) };
}

/** True when nothing differs from the default arrangement — so "Reset" can hide itself. */
export function isDefaultLayout(saved: DashboardLayout, available: string[]): boolean {
  const r = resolveLayout(saved, available);
  return (
    r.hidden.length === 0 &&
    r.visible.every((c, i) => c.id === available[i] && c.size === defaultSize(c.id))
  );
}

/**
 * The column span each card is DRAWN at, for a grid of `cols` columns.
 *
 * Cards are packed into rows in the viewer's order — never reordered, so a drag always
 * lands where it was dropped. When a row is not full (the next card does not fit, or it is
 * the last row), the row's LAST card stretches to close the gap. The dashboard never shows
 * empty columns, and the width someone chose is still what is saved — this only decides
 * how it is drawn.
 */
export function fillRows(sizes: CardSize[], cols: 2 | 3): number[] {
  const spans: number[] = [];
  let used = 0;
  let rowStart = 0;
  const close = () => {
    if (spans.length > rowStart && used < cols) spans[spans.length - 1] += cols - used;
  };
  for (const size of sizes) {
    const s = Math.min(size, cols);
    if (used + s > cols) {
      close();
      used = 0;
      rowStart = spans.length;
    }
    spans.push(s);
    used += s;
  }
  close();
  return spans;
}

// Literal class names, so Tailwind's scanner can see every one of them.
const MD_SPAN: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2" };
const LG_SPAN: Record<number, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3" };

/**
 * Span classes for every visible card: one column on a phone, packed into 2 columns from
 * `md` and 3 from `lg`, each with its own gap-closing pass.
 */
export function spanClasses(sizes: CardSize[]): string[] {
  const md = fillRows(sizes, 2);
  const lg = fillRows(sizes, 3);
  return sizes.map((_, i) => `${MD_SPAN[md[i]]} ${LG_SPAN[lg[i]]}`);
}

/** The storage key — one layout per wiki, per browser. Versioned so a format change starts clean. */
export function layoutStorageKey(wikiId: string): string {
  return `foundry.wiki.dashboard.v1.${wikiId}`;
}

/** Read the saved layout. Storage can throw (private mode, blocked site data) — that reads as none. */
export function loadLayout(wikiId: string): DashboardLayout {
  try {
    const raw = window.localStorage.getItem(layoutStorageKey(wikiId));
    return raw ? readLayout(JSON.parse(raw)) : EMPTY_LAYOUT;
  } catch {
    return EMPTY_LAYOUT;
  }
}

export function saveLayout(wikiId: string, layout: DashboardLayout): void {
  try {
    window.localStorage.setItem(layoutStorageKey(wikiId), JSON.stringify(layout));
  } catch {
    // Not persisted — the arrangement still applies for this visit.
  }
}

export function clearLayout(wikiId: string): void {
  try {
    window.localStorage.removeItem(layoutStorageKey(wikiId));
  } catch {
    // Nothing to clear.
  }
}
